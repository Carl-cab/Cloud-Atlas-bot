// =============================================================================
// Mean Reversion Strategy (Skeleton)
//
// Identifies when price has deviated significantly from its mean (using
// Bollinger Bands and Z-score) and bets on reversion. Enters when price
// is at extremes, exits when it returns to the mean.
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

export class MeanReversionStrategy implements StrategyAdapter {
  readonly strategyId = 'mean-reversion';
  readonly strategyName = 'Mean Reversion Strategy';

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
    if (candles.length < 20) {
      return { success: false, error: `Need 20+ candles, got ${candles.length}` };
    }

    const closes = candles.map(c => c.close);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const stdDev = Math.sqrt(closes.slice(-20).reduce((s, c) => s + (c - sma20) ** 2, 0) / 20);
    const zScore = stdDev > 0 ? (snapshot.currentPrice - sma20) / stdDev : 0;
    const bollingerUpper = sma20 + 2 * stdDev;
    const bollingerLower = sma20 - 2 * stdDev;
    const bollingerPosition = stdDev > 0 ? (snapshot.currentPrice - bollingerLower) / (bollingerUpper - bollingerLower) : 0.5;

    return {
      success: true,
      data: { sma20, stdDev, zScore, bollingerPosition, bollingerUpper, bollingerLower },
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

    const { zScore, bollingerPosition, sma20 } = analysis.data;

    const confidenceResult = await this.calculateConfidence(snapshot, analysis.data);
    const riskResult = await this.calculateRisk(snapshot, analysis.data);
    const confidence = confidenceResult.data ?? 0.5;
    const riskScore = riskResult.data ?? 0.5;

    const positionSizeResult = await this.calculatePositionSize(
      snapshot, confidence, riskScore, context.accountEquity
    );

    let direction: SignalDirection = 'hold';
    let reasoning = 'Price within normal range';

    if (zScore < -2 && bollingerPosition < 0.1) {
      direction = 'long';
      reasoning = `Oversold: Z-score=${zScore.toFixed(2)}, BB position=${(bollingerPosition * 100).toFixed(1)}%`;
    } else if (zScore > 2 && bollingerPosition > 0.9) {
      direction = 'short';
      reasoning = `Overbought: Z-score=${zScore.toFixed(2)}, BB position=${(bollingerPosition * 100).toFixed(1)}%`;
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
        stopLoss: direction === 'long' ? snapshot.currentPrice * 0.96 : direction === 'short' ? snapshot.currentPrice * 1.04 : null,
        takeProfit: direction !== 'hold' ? sma20 : null,
        expectedHoldingTime: 'PT8H',
        entryPrice: snapshot.currentPrice,
        reasoning,
        indicators: analysis.data,
        metadata: { targetPrice: sma20 },
        timestamp: new Date().toISOString(),
      },
    };
  }

  async calculateConfidence(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    const absZ = Math.abs(indicators.zScore ?? 0);
    const score = Math.min(0.95, 0.4 + absZ * 0.15);
    return { success: true, data: score };
  }

  async calculateRisk(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    const absZ = Math.abs(indicators.zScore ?? 0);
    const risk = absZ > 3 ? 0.7 : 0.3 + absZ * 0.1;
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
    return { success: true, data: Math.max(0.005, Math.min(0.08, adjusted)) };
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
    snapshot: MarketSnapshot,
    _context: StrategyContext,
    entryPrice: number,
    currentPnl: number
  ): Promise<StrategyResult<{ exit: boolean; reason: string }>> {
    const analysis = await this.analyzeMarket(snapshot);
    if (analysis.success && analysis.data) {
      const absZ = Math.abs(analysis.data.zScore);
      if (absZ < 0.5) return { success: true, data: { exit: true, reason: 'Price reverted to mean' } };
    }
    if (currentPnl < -0.04) return { success: true, data: { exit: true, reason: 'Stop loss: PnL below -4%' } };
    if (currentPnl > 0.04) return { success: true, data: { exit: true, reason: 'Take profit: PnL above 4%' } };
    return { success: true, data: { exit: false, reason: 'Within thresholds' } };
  }

  async shouldPauseTrading(
    snapshot: MarketSnapshot,
    _context: StrategyContext
  ): Promise<StrategyResult<{ pause: boolean; reason: string; durationMs?: number }>> {
    const analysis = await this.analyzeMarket(snapshot);
    if (analysis.success && analysis.data && analysis.data.stdDev / analysis.data.sma20 > 0.1) {
      return { success: true, data: { pause: true, reason: 'Extreme volatility detected', durationMs: 3600000 } };
    }
    return { success: true, data: { pause: false, reason: 'No pause conditions met' } };
  }

  getMetadata(): StrategyMetadata {
    return {
      id: this.strategyId,
      name: this.strategyName,
      version: '0.1.0',
      description: 'Identifies price deviations from mean using Bollinger Bands and Z-score, bets on reversion',
      author: 'Cloud Atlas',
      category: 'mean_reversion',
      supportedTimeframes: ['15m', '1h', '4h', '1d'],
      supportedSymbols: [],
      minDataPoints: 20,
      riskLevel: 'low',
      tags: ['mean-reversion', 'bollinger', 'z-score'],
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
}
