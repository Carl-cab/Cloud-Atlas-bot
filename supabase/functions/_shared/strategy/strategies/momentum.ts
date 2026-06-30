// =============================================================================
// Momentum Strategy (Skeleton)
//
// Detects and follows price momentum using RSI, rate of change, and volume.
// Enters when momentum accelerates, exits when it fades.
//
// This is a skeleton implementation. Trading logic will be added in a future
// phase once the Strategy Engine framework is validated.
// =============================================================================

import type { StrategyAdapter, StrategyContext } from '../adapter.ts';
import type {
  MarketSnapshot,
  StrategySignal,
  StrategyMetadata,
  StrategyHealth,
  StrategyResult,
  SignalDirection,
} from '../types.ts';

export class MomentumStrategy implements StrategyAdapter {
  readonly strategyId = 'momentum';
  readonly strategyName = 'Momentum Strategy';

  private signalCount = 0;
  private errorCount = 0;
  private lastSignalAt: string | null = null;
  private initialized = false;

  async initialize(_config?: Record<string, unknown>): Promise<StrategyResult<void>> {
    this.initialized = true;
    return { success: true };
  }

  async analyzeMarket(snapshot: MarketSnapshot): Promise<StrategyResult<Record<string, number>>> {
    if (!this.initialized) return { success: false, error: 'Strategy not initialized' };

    const candles = snapshot.ohlcv;
    if (candles.length < 14) {
      return { success: false, error: `Need 14+ candles, got ${candles.length}` };
    }

    const closes = candles.map(c => c.close);
    const rsi = this.calculateRSI(closes, 14);
    const roc = closes.length >= 2 ? (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2] : 0;
    const volumeRatio = candles.length >= 20
      ? candles[candles.length - 1].volume / (candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20)
      : 1;

    return {
      success: true,
      data: { rsi, roc, volumeRatio, currentPrice: snapshot.currentPrice },
    };
  }

  async generateSignal(
    snapshot: MarketSnapshot,
    context: StrategyContext
  ): Promise<StrategyResult<StrategySignal>> {
    const analysis = await this.analyzeMarket(snapshot);
    if (!analysis.success || !analysis.data) {
      this.errorCount++;
      return { success: false, error: analysis.error };
    }

    const { rsi, roc, volumeRatio } = analysis.data;

    const confidenceResult = await this.calculateConfidence(snapshot, analysis.data);
    const riskResult = await this.calculateRisk(snapshot, analysis.data);
    const confidence = confidenceResult.data ?? 0.5;
    const riskScore = riskResult.data ?? 0.5;

    const positionSizeResult = await this.calculatePositionSize(
      snapshot, confidence, riskScore, context.accountEquity
    );

    let direction: SignalDirection = 'hold';
    let reasoning = 'No clear momentum signal';

    if (rsi > 60 && roc > 0.005 && volumeRatio > 1.2) {
      direction = 'long';
      reasoning = `Bullish momentum: RSI=${rsi.toFixed(1)}, ROC=${(roc * 100).toFixed(2)}%, volume ${volumeRatio.toFixed(1)}x avg`;
    } else if (rsi < 40 && roc < -0.005 && volumeRatio > 1.2) {
      direction = 'short';
      reasoning = `Bearish momentum: RSI=${rsi.toFixed(1)}, ROC=${(roc * 100).toFixed(2)}%, volume ${volumeRatio.toFixed(1)}x avg`;
    }

    this.signalCount++;
    this.lastSignalAt = new Date().toISOString();

    return {
      success: true,
      data: {
        strategyId: this.strategyId,
        symbol: snapshot.symbol,
        direction,
        strength: confidence >= 0.75 ? 'strong' : confidence >= 0.5 ? 'moderate' : 'weak',
        confidence,
        riskScore,
        positionSize: positionSizeResult.data ?? 0.02,
        stopLoss: direction !== 'hold' ? snapshot.currentPrice * (direction === 'long' ? 0.97 : 1.03) : null,
        takeProfit: direction !== 'hold' ? snapshot.currentPrice * (direction === 'long' ? 1.06 : 0.94) : null,
        expectedHoldingTime: 'PT4H',
        entryPrice: snapshot.currentPrice,
        reasoning,
        indicators: { rsi, roc, volumeRatio },
        metadata: { regime: context.currentRegime },
        timestamp: new Date().toISOString(),
      },
    };
  }

  async calculateConfidence(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    const { rsi, roc, volumeRatio } = indicators;
    let score = 0.5;
    if (rsi > 60 || rsi < 40) score += 0.15;
    if (Math.abs(roc) > 0.01) score += 0.1;
    if (volumeRatio > 1.5) score += 0.1;
    return { success: true, data: Math.min(0.95, Math.max(0.1, score)) };
  }

  async calculateRisk(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    const { rsi, volumeRatio } = indicators;
    let risk = 0.3;
    if (rsi > 80 || rsi < 20) risk += 0.3;
    if (volumeRatio > 3) risk += 0.2;
    return { success: true, data: Math.min(1.0, risk) };
  }

  async calculatePositionSize(
    _snapshot: MarketSnapshot,
    confidence: number,
    riskScore: number,
    _accountEquity: number
  ): Promise<StrategyResult<number>> {
    const base = 0.02;
    const adjusted = base * confidence * (1 - riskScore * 0.5);
    return { success: true, data: Math.max(0.005, Math.min(0.10, adjusted)) };
  }

  async shouldEnterTrade(
    snapshot: MarketSnapshot,
    context: StrategyContext
  ): Promise<StrategyResult<{ enter: boolean; direction: SignalDirection; reason: string }>> {
    const signal = await this.generateSignal(snapshot, context);
    if (!signal.success || !signal.data) {
      return { success: true, data: { enter: false, direction: 'hold', reason: signal.error ?? 'Analysis failed' } };
    }
    return {
      success: true,
      data: {
        enter: signal.data.direction !== 'hold' && signal.data.confidence > 0.6,
        direction: signal.data.direction,
        reason: signal.data.reasoning,
      },
    };
  }

  async shouldExitTrade(
    _snapshot: MarketSnapshot,
    _context: StrategyContext,
    _entryPrice: number,
    currentPnl: number
  ): Promise<StrategyResult<{ exit: boolean; reason: string }>> {
    if (currentPnl < -0.03) return { success: true, data: { exit: true, reason: 'Stop loss: PnL below -3%' } };
    if (currentPnl > 0.06) return { success: true, data: { exit: true, reason: 'Take profit: PnL above 6%' } };
    return { success: true, data: { exit: false, reason: 'Within thresholds' } };
  }

  async shouldPauseTrading(
    _snapshot: MarketSnapshot,
    _context: StrategyContext
  ): Promise<StrategyResult<{ pause: boolean; reason: string; durationMs?: number }>> {
    return { success: true, data: { pause: false, reason: 'No pause conditions met' } };
  }

  getMetadata(): StrategyMetadata {
    return {
      id: this.strategyId,
      name: this.strategyName,
      version: '0.1.0',
      description: 'Detects and follows price momentum using RSI, rate of change, and volume confirmation',
      author: 'Cloud Atlas',
      category: 'momentum',
      supportedTimeframes: ['5m', '15m', '1h', '4h'],
      supportedSymbols: [],
      minDataPoints: 14,
      riskLevel: 'medium',
      tags: ['momentum', 'rsi', 'volume'],
    };
  }

  getHealth(): StrategyHealth {
    return {
      status: this.initialized ? 'healthy' : 'error',
      lastSignalAt: this.lastSignalAt,
      signalCount: this.signalCount,
      errorCount: this.errorCount,
      averageLatencyMs: 5,
      checkedAt: new Date().toISOString(),
    };
  }

  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}
