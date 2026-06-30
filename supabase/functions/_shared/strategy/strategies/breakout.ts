// =============================================================================
// Breakout Strategy (Skeleton)
//
// Detects when price breaks out of a consolidation range. Uses recent
// high/low channels and volume surge as confirmation. Enters on breakout,
// exits if breakout fails (returns to range).
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

export class BreakoutStrategy implements StrategyAdapter {
  readonly strategyId = 'breakout';
  readonly strategyName = 'Breakout Strategy';

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

    const lookback = candles.slice(-20);
    const rangeHigh = Math.max(...lookback.map(c => c.high));
    const rangeLow = Math.min(...lookback.map(c => c.low));
    const rangeWidth = rangeHigh - rangeLow;
    const rangePercent = rangeHigh > 0 ? rangeWidth / rangeHigh : 0;
    const avgVolume = lookback.reduce((s, c) => s + c.volume, 0) / lookback.length;
    const currentVolume = candles[candles.length - 1].volume;
    const volumeSurge = avgVolume > 0 ? currentVolume / avgVolume : 1;
    const breakoutUp = snapshot.currentPrice > rangeHigh ? (snapshot.currentPrice - rangeHigh) / rangeWidth : 0;
    const breakoutDown = snapshot.currentPrice < rangeLow ? (rangeLow - snapshot.currentPrice) / rangeWidth : 0;

    return {
      success: true,
      data: { rangeHigh, rangeLow, rangePercent, volumeSurge, breakoutUp, breakoutDown },
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

    const { breakoutUp, breakoutDown, volumeSurge, rangeHigh, rangeLow, rangePercent } = analysis.data;

    const confidenceResult = await this.calculateConfidence(snapshot, analysis.data);
    const riskResult = await this.calculateRisk(snapshot, analysis.data);
    const confidence = confidenceResult.data ?? 0.5;
    const riskScore = riskResult.data ?? 0.5;

    const positionSizeResult = await this.calculatePositionSize(
      snapshot, confidence, riskScore, context.accountEquity
    );

    let direction: SignalDirection = 'hold';
    let reasoning = 'No breakout detected';

    if (breakoutUp > 0.1 && volumeSurge > 1.5) {
      direction = 'long';
      reasoning = `Upward breakout: ${(breakoutUp * 100).toFixed(1)}% above range, volume ${volumeSurge.toFixed(1)}x`;
    } else if (breakoutDown > 0.1 && volumeSurge > 1.5) {
      direction = 'short';
      reasoning = `Downward breakout: ${(breakoutDown * 100).toFixed(1)}% below range, volume ${volumeSurge.toFixed(1)}x`;
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
        stopLoss: direction === 'long' ? rangeHigh : direction === 'short' ? rangeLow : null,
        takeProfit: direction === 'long'
          ? snapshot.currentPrice + (rangeHigh - rangeLow)
          : direction === 'short'
            ? snapshot.currentPrice - (rangeHigh - rangeLow)
            : null,
        expectedHoldingTime: 'PT2H',
        entryPrice: snapshot.currentPrice,
        reasoning,
        indicators: analysis.data,
        metadata: { rangePercent },
        timestamp: new Date().toISOString(),
      },
    };
  }

  async calculateConfidence(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    const breakout = Math.max(indicators.breakoutUp, indicators.breakoutDown);
    const volConfirm = indicators.volumeSurge > 2 ? 0.15 : 0;
    const score = Math.min(0.95, 0.4 + breakout * 0.3 + volConfirm);
    return { success: true, data: score };
  }

  async calculateRisk(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    let risk = 0.4;
    if (indicators.rangePercent < 0.02) risk += 0.2; // tight range = false breakout risk
    if (indicators.volumeSurge < 1.2) risk += 0.15; // weak volume confirmation
    return { success: true, data: Math.min(1.0, risk) };
  }

  async calculatePositionSize(
    _snapshot: MarketSnapshot,
    confidence: number,
    riskScore: number,
    _accountEquity: number
  ): Promise<StrategyResult<number>> {
    const base = 0.015;
    const adjusted = base * confidence * (1 - riskScore * 0.5);
    return { success: true, data: Math.max(0.005, Math.min(0.06, adjusted)) };
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
        enter: signal.data.direction !== 'hold' && signal.data.confidence > 0.65,
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
    if (currentPnl < -0.025) return { success: true, data: { exit: true, reason: 'Failed breakout: PnL below -2.5%' } };
    if (currentPnl > 0.05) return { success: true, data: { exit: true, reason: 'Breakout target hit: PnL above 5%' } };
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
      description: 'Detects price breakouts from consolidation ranges with volume confirmation',
      author: 'Cloud Atlas',
      category: 'breakout',
      supportedTimeframes: ['5m', '15m', '1h'],
      supportedSymbols: [],
      minDataPoints: 20,
      riskLevel: 'high',
      tags: ['breakout', 'range', 'volume-surge'],
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
