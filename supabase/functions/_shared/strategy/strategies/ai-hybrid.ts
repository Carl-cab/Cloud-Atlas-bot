// =============================================================================
// AI Hybrid Strategy (Skeleton)
//
// Combines traditional technical analysis with AI/ML features. Uses an
// ensemble approach: technical score + structural score + ML prediction.
// Designed as the integration point for future ML model inference.
//
// Currently uses a deterministic scoring system that mirrors the enhanced
// ML engine's gradient boosting approach. Real ML model inference will be
// added in a future phase.
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

export class AIHybridStrategy implements StrategyAdapter {
  readonly strategyId = 'ai-hybrid';
  readonly strategyName = 'AI Hybrid Strategy';

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
    if (candles.length < 30) {
      return { success: false, error: `Need 30+ candles, got ${candles.length}` };
    }

    const closes = candles.map(c => c.close);

    // Technical indicators
    const rsi = this.calculateRSI(closes, 14);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = candles.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : sma20;

    // Volatility
    const returns = [];
    for (let i = 1; i < Math.min(20, closes.length); i++) {
      returns.push((closes[closes.length - i] - closes[closes.length - i - 1]) / closes[closes.length - i - 1]);
    }
    const volatility = returns.length > 0
      ? Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length)
      : 0;

    // Volume ratio
    const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / Math.min(20, candles.length);
    const volumeRatio = avgVolume > 0 ? candles[candles.length - 1].volume / avgVolume : 1;

    // Technical score (0-1)
    let technicalScore = 0.5;
    if (rsi < 30) technicalScore += 0.2;
    else if (rsi > 70) technicalScore -= 0.2;
    if (snapshot.currentPrice > sma20) technicalScore += 0.1;
    else technicalScore -= 0.1;

    // Structural score (0-1)
    let structuralScore = 0.5;
    const trendStrength = sma50 > 0 ? Math.abs(sma20 - sma50) / sma50 : 0;
    if (sma20 > sma50) structuralScore += Math.min(0.25, trendStrength * 10);
    else structuralScore -= Math.min(0.25, trendStrength * 10);

    // ML-placeholder score (ensemble prediction)
    const priceVelocity = closes.length >= 5
      ? (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5]
      : 0;
    const mlScore = 0.5 + priceVelocity * 5;

    // Weighted ensemble
    const ensembleScore = technicalScore * 0.4 + structuralScore * 0.35 + Math.max(0, Math.min(1, mlScore)) * 0.25;

    return {
      success: true,
      data: {
        rsi, sma20, sma50, volatility, volumeRatio,
        technicalScore, structuralScore, mlScore: Math.max(0, Math.min(1, mlScore)),
        ensembleScore, trendStrength, priceVelocity,
      },
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

    const { ensembleScore, volatility } = analysis.data;

    const confidenceResult = await this.calculateConfidence(snapshot, analysis.data);
    const riskResult = await this.calculateRisk(snapshot, analysis.data);
    const confidence = confidenceResult.data ?? 0.5;
    const riskScore = riskResult.data ?? 0.5;

    const positionSizeResult = await this.calculatePositionSize(
      snapshot, confidence, riskScore, context.accountEquity
    );

    let direction: SignalDirection = 'hold';
    let reasoning = 'Ensemble score neutral';

    if (ensembleScore > 0.65) {
      direction = 'long';
      reasoning = `AI ensemble bullish: score=${ensembleScore.toFixed(3)}, vol=${(volatility * 100).toFixed(2)}%`;
    } else if (ensembleScore < 0.35) {
      direction = 'short';
      reasoning = `AI ensemble bearish: score=${ensembleScore.toFixed(3)}, vol=${(volatility * 100).toFixed(2)}%`;
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
          ? snapshot.currentPrice * (1 - volatility * 3)
          : direction === 'short'
            ? snapshot.currentPrice * (1 + volatility * 3)
            : null,
        takeProfit: direction === 'long'
          ? snapshot.currentPrice * (1 + volatility * 6)
          : direction === 'short'
            ? snapshot.currentPrice * (1 - volatility * 6)
            : null,
        expectedHoldingTime: 'PT6H',
        entryPrice: snapshot.currentPrice,
        reasoning,
        indicators: analysis.data,
        metadata: { ensembleWeights: { technical: 0.4, structural: 0.35, ml: 0.25 } },
        timestamp: new Date().toISOString(),
      },
    };
  }

  async calculateConfidence(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    const distance = Math.abs(indicators.ensembleScore - 0.5) * 2;
    const volPenalty = indicators.volatility > 0.05 ? 0.1 : 0;
    const score = Math.min(0.95, 0.4 + distance * 0.4 - volPenalty);
    return { success: true, data: Math.max(0.1, score) };
  }

  async calculateRisk(
    _snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>> {
    let risk = 0.35;
    if (indicators.volatility > 0.05) risk += 0.2;
    if (indicators.volumeRatio < 0.5) risk += 0.15;
    if (indicators.trendStrength < 0.005) risk += 0.1;
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
    _snapshot: MarketSnapshot,
    _context: StrategyContext,
    _entryPrice: number,
    currentPnl: number
  ): Promise<StrategyResult<{ exit: boolean; reason: string }>> {
    if (currentPnl < -0.04) return { success: true, data: { exit: true, reason: 'AI stop: PnL below -4%' } };
    if (currentPnl > 0.08) return { success: true, data: { exit: true, reason: 'AI target hit: PnL above 8%' } };
    return { success: true, data: { exit: false, reason: 'Within AI thresholds' } };
  }

  async shouldPauseTrading(
    snapshot: MarketSnapshot,
    _context: StrategyContext
  ): Promise<StrategyResult<{ pause: boolean; reason: string; durationMs?: number }>> {
    const analysis = await this.analyzeMarket(snapshot);
    if (analysis.success && analysis.data && analysis.data.volatility > 0.10) {
      return { success: true, data: { pause: true, reason: 'Extreme volatility: AI recommends pause', durationMs: 7200000 } };
    }
    return { success: true, data: { pause: false, reason: 'No pause conditions met' } };
  }

  getMetadata(): StrategyMetadata {
    return {
      id: this.strategyId,
      name: this.strategyName,
      version: '0.1.0',
      description: 'Ensemble strategy combining technical analysis, market structure, and ML-placeholder scoring',
      author: 'Cloud Atlas',
      category: 'ai_hybrid',
      supportedTimeframes: ['15m', '1h', '4h', '1d'],
      supportedSymbols: [],
      minDataPoints: 30,
      riskLevel: 'medium',
      tags: ['ai', 'ensemble', 'ml', 'hybrid'],
    };
  }

  getHealth(): StrategyHealth {
    return {
      status: this.initialized ? 'healthy' : 'error',
      lastSignalAt: this.lastSignalAt,
      signalCount: this.signalCount,
      errorCount: this.errorCount,
      averageLatencyMs: 10,
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
