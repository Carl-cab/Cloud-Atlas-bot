// =============================================================================
// Trend Following Strategy (Skeleton)
//
// Identifies established trends using moving average crossovers (SMA 20/50)
// and ADX-like trend strength. Enters when trend is confirmed, exits when
// trend reverses or weakens.
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

export class TrendFollowingStrategy implements StrategyAdapter {
  readonly strategyId = 'trend-following';
  readonly strategyName = 'Trend Following Strategy';

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
    if (candles.length < 50) {
      return { success: false, error: `Need 50+ candles, got ${candles.length}` };
    }

    const closes = candles.map(c => c.close);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const smaCrossover = (sma20 - sma50) / sma50;

    // Trend strength: absolute distance between SMAs relative to price
    const trendStrength = Math.abs(sma20 - sma50) / snapshot.currentPrice;

    // Slope of SMA20 over last 5 periods
    const sma20_5ago = closes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20;
    const smaSlope = sma20_5ago > 0 ? (sma20 - sma20_5ago) / sma20_5ago : 0;

    // Price position relative to SMAs
    const priceVsSma20 = (snapshot.currentPrice - sma20) / sma20;
    const priceVsSma50 = (snapshot.currentPrice - sma50) / sma50;

    return {
      success: true,
      data: { sma20, sma50, smaCrossover, trendStrength, smaSlope, priceVsSma20, priceVsSma50 },
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

    const { smaCrossover, trendStrength, smaSlope, priceVsSma20 } = analysis.data;

    const confidenceResult = await this.calculateConfidence(snapshot, analysis.data);
    const riskResult = await this.calculateRisk(snapshot, analysis.data);
    const confidence = confidenceResult.data ?? 0.5;
    const riskScore = riskResult.data ?? 0.5;

    const positionSizeResult = await this.calculatePositionSize(
      snapshot, confidence, riskScore, context.accountEquity
    );

    let direction: SignalDirection = 'hold';
    let reasoning = 'No clear trend';

    if (smaCrossover > 0.005 && smaSlope > 0.001 && priceVsSma20 > 0) {
      direction = 'long';
      reasoning = `Uptrend confirmed: SMA20/50 crossover=${(smaCrossover * 100).toFixed(2)}%, slope=${(smaSlope * 100).toFixed(2)}%`;
    } else if (smaCrossover < -0.005 && smaSlope < -0.001 && priceVsSma20 < 0) {
      direction = 'short';
      reasoning = `Downtrend confirmed: SMA20/50 crossover=${(smaCrossover * 100).toFixed(2)}%, slope=${(smaSlope * 100).toFixed(2)}%`;
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
        stopLoss: direction === 'long'
          ? snapshot.currentPrice * 0.95
          : direction === 'short'
            ? snapshot.currentPrice * 1.05
            : null,
        takeProfit: direction === 'long'
          ? snapshot.currentPrice * 1.10
          : direction === 'short'
            ? snapshot.currentPrice * 0.90
            : null,
        expectedHoldingTime: 'P1D',
        entryPrice: snapshot.currentPrice,
        reasoning,
        indicators: analysis.data,
        metadata: { trendStrength },
        timestamp: new Date().toISOString(),
      },
    };
  }

  async calculateConfidence(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    let score = 0.4;
    if (indicators.trendStrength > 0.02) score += 0.2;
    if (Math.abs(indicators.smaSlope) > 0.005) score += 0.15;
    if (Math.abs(indicators.smaCrossover) > 0.01) score += 0.1;
    return { success: true, data: Math.min(0.95, score) };
  }

  async calculateRisk(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    let risk = 0.25;
    if (indicators.trendStrength < 0.005) risk += 0.3;
    if (Math.abs(indicators.smaSlope) < 0.001) risk += 0.2;
    return { success: true, data: Math.min(1.0, risk) };
  }

  async calculatePositionSize(
    _snapshot: MarketSnapshot,
    confidence: number,
    riskScore: number,
    _accountEquity: number
  ): Promise<StrategyResult<number>> {
    const base = 0.025;
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
    if (currentPnl < -0.05) return { success: true, data: { exit: true, reason: 'Trend reversal: PnL below -5%' } };
    if (currentPnl > 0.10) return { success: true, data: { exit: true, reason: 'Trend target hit: PnL above 10%' } };
    return { success: true, data: { exit: false, reason: 'Trend holding' } };
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
      description: 'Follows established trends using SMA crossovers and trend strength confirmation',
      author: 'Cloud Atlas',
      category: 'trend_following',
      supportedTimeframes: ['1h', '4h', '1d'],
      supportedSymbols: [],
      minDataPoints: 50,
      riskLevel: 'medium',
      tags: ['trend', 'sma-crossover', 'momentum'],
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
