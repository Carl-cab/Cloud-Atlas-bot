// =============================================================================
// Backtest Engine
//
// Event-driven replay with strict no-lookahead execution:
//   1. At candle i, if a position is open, stops/takes are checked against
//      candle i's high/low (pessimistic: stop-loss checked before take-profit).
//   2. The strategy decides on the CLOSE of candle i.
//   3. Entry/exit decisions fill at the OPEN of candle i+1, adjusted for
//      slippage and half-spread; fees are charged on notional per side.
//
// Position sizing is risk-based: quantity = (equity × riskPerTrade) / stop
// distance, capped at maxPositionFraction of equity. Entries without a
// stop-loss are rejected — unsized risk is not allowed in this system.
// =============================================================================

import type {
  BacktestConfig,
  BacktestResult,
  BacktestStrategy,
  Candle,
  EquityPoint,
  ExitReason,
  OpenPositionView,
  TradeRecord,
} from './types';

interface OpenPosition {
  side: 'long' | 'short';
  entryPrice: number;
  entryTime: string;
  entryIndex: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  entryFee: number;
}

/** Buy-side prices are worsened upward; sell-side downward. */
function applyCosts(price: number, side: 'buy' | 'sell', config: BacktestConfig): number {
  const slip = config.costs.slippageBps / 10_000;
  const halfSpread = config.costs.spreadBps / 20_000;
  return side === 'buy' ? price * (1 + slip + halfSpread) : price * (1 - slip - halfSpread);
}

export function runBacktest(
  strategy: BacktestStrategy,
  candles: Candle[],
  config: BacktestConfig
): BacktestResult {
  const startIndex = Math.max(config.startIndex ?? 0, strategy.warmup);
  const trades: TradeRecord[] = [];
  const equityCurve: EquityPoint[] = [];

  let cash = config.initialEquity;
  let position: OpenPosition | null = null;
  let totalFeesPaid = 0;
  let candlesInPosition = 0;

  const markToMarket = (price: number): number => {
    if (!position) return cash;
    const gross = position.side === 'long'
      ? position.quantity * price
      : position.quantity * (2 * position.entryPrice - price);
    return cash + gross;
  };

  const closePosition = (
    rawPrice: number,
    index: number,
    reason: ExitReason
  ): void => {
    if (!position) return;
    const exitSide = position.side === 'long' ? 'sell' : 'buy';
    const fillPrice = applyCosts(rawPrice, exitSide, config);
    const notional = position.quantity * fillPrice;
    const exitFee = notional * config.costs.feeRate;
    const grossPnl = position.side === 'long'
      ? position.quantity * (fillPrice - position.entryPrice)
      : position.quantity * (position.entryPrice - fillPrice);
    const pnl = grossPnl - position.entryFee - exitFee;

    cash += position.quantity * position.entryPrice + grossPnl - exitFee;
    totalFeesPaid += exitFee;

    trades.push({
      side: position.side,
      entryTime: position.entryTime,
      exitTime: candles[index].t,
      entryIndex: position.entryIndex,
      exitIndex: index,
      entryPrice: position.entryPrice,
      exitPrice: fillPrice,
      quantity: position.quantity,
      feesPaid: position.entryFee + exitFee,
      pnl,
      returnPct: (pnl / (position.quantity * position.entryPrice)) * 100,
      holdingCandles: index - position.entryIndex,
      exitReason: reason,
    });
    position = null;
  };

  const openPosition = (
    side: 'long' | 'short',
    rawPrice: number,
    index: number,
    stopLoss: number | null,
    takeProfit: number | null
  ): void => {
    if (stopLoss === null) return; // entries without a stop are rejected
    const entrySide = side === 'long' ? 'buy' : 'sell';
    const fillPrice = applyCosts(rawPrice, entrySide, config);
    const stopDistance = side === 'long' ? fillPrice - stopLoss : stopLoss - fillPrice;
    if (stopDistance <= 0) return; // stop on the wrong side of entry

    const equity = cash;
    const riskQty = (equity * config.riskPerTrade) / stopDistance;
    const capQty = (equity * config.maxPositionFraction) / fillPrice;
    const quantity = Math.min(riskQty, capQty);
    if (quantity <= 0 || quantity * fillPrice < 1) return; // dust guard

    const notional = quantity * fillPrice;
    const entryFee = notional * config.costs.feeRate;
    cash -= notional + entryFee;
    totalFeesPaid += entryFee;

    position = {
      side,
      entryPrice: fillPrice,
      entryTime: candles[index].t,
      entryIndex: index,
      quantity,
      stopLoss,
      takeProfit,
      entryFee,
    };
  };

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i];

    // 1. Intrabar stop / take checks on the current candle (skip the entry
    //    candle itself: fills happen at its open and stops apply from the
    //    next candle to avoid same-bar ambiguity with the fill price).
    if (position && i > position.entryIndex) {
      if (position.side === 'long') {
        if (position.stopLoss !== null && candle.l <= position.stopLoss) {
          closePosition(position.stopLoss, i, 'stop_loss');
        } else if (position.takeProfit !== null && candle.h >= position.takeProfit) {
          closePosition(position.takeProfit, i, 'take_profit');
        }
      } else {
        if (position.stopLoss !== null && candle.h >= position.stopLoss) {
          closePosition(position.stopLoss, i, 'stop_loss');
        } else if (position.takeProfit !== null && candle.l <= position.takeProfit) {
          closePosition(position.takeProfit, i, 'take_profit');
        }
      }
    }

    if (position) candlesInPosition++;

    // 2. Strategy decision on close of candle i, executed at open of i+1.
    if (i < candles.length - 1) {
      const view: OpenPositionView | null = position
        ? {
            side: position.side,
            entryPrice: position.entryPrice,
            entryIndex: position.entryIndex,
            quantity: position.quantity,
            stopLoss: position.stopLoss,
            takeProfit: position.takeProfit,
          }
        : null;

      const decision = strategy.decide(candles, i, view);
      const nextOpen = candles[i + 1].o;

      if (position && decision.trailingStop !== undefined) {
        // Stops only ever tighten.
        if (position.side === 'long') {
          position.stopLoss = Math.max(position.stopLoss ?? -Infinity, decision.trailingStop);
        } else {
          position.stopLoss = Math.min(position.stopLoss ?? Infinity, decision.trailingStop);
        }
      }

      if (decision.action === 'exit' && position) {
        closePosition(nextOpen, i + 1, 'signal');
      } else if (decision.action === 'enter_long' && !position) {
        openPosition('long', nextOpen, i + 1, decision.stopLoss ?? null, decision.takeProfit ?? null);
      } else if (decision.action === 'enter_short' && !position && config.allowShorts) {
        openPosition('short', nextOpen, i + 1, decision.stopLoss ?? null, decision.takeProfit ?? null);
      }
    }

    equityCurve.push({ t: candle.t, equity: markToMarket(candle.c) });
  }

  // Force-close any open position at the final close for honest accounting.
  if (position) {
    closePosition(candles[candles.length - 1].c, candles.length - 1, 'end_of_data');
    equityCurve[equityCurve.length - 1] = {
      t: candles[candles.length - 1].t,
      equity: cash,
    };
  }

  return {
    strategyId: strategy.id,
    params: strategy.params,
    config,
    trades,
    equityCurve,
    finalEquity: cash,
    totalFeesPaid,
    candlesTested: candles.length - startIndex,
    candlesInPosition,
  };
}
