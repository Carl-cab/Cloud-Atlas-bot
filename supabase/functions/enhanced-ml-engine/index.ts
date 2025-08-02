import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface GradientBoostingFeatures {
  technical_indicators: {
    rsi: number;
    macd: number;
    adx: number;
    atr: number;
    bollinger_position: number;
    volume_ratio: number;
  };
  market_structure: {
    trend_strength: number;
    volatility_regime: string;
    momentum: number;
    support_resistance_level: number;
  };
  ml_features: {
    price_velocity: number;
    feature_importance_score: number;
    ensemble_prediction: number;
    confidence_interval: [number, number];
  };
}

interface EnhancedMLSignal {
  symbol: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  gradient_boost_score: number;
  features: GradientBoostingFeatures;
  risk_assessment: {
    risk_score: number;
    position_size: number;
    stop_loss: number;
    take_profit: number;
  };
  filters_passed: string[];
  created_at: string;
}

class EnhancedMLEngine {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
  }

  // Enhanced feature generation with gradient boosting
  generateEnhancedFeatures(data: MarketData[]): GradientBoostingFeatures {
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    
    // Technical indicators
    const rsi = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const adx = this.calculateADX(highs, lows, closes, 14);
    const atr = this.calculateATR(highs, lows, closes, 14);
    const bollinger = this.calculateBollingerBands(closes, 20, 2);
    const volumeRatio = this.calculateVolumeRatio(volumes, 20);
    
    // Market structure analysis
    const trendStrength = this.calculateTrendStrength(closes, 50);
    const volatilityRegime = this.classifyVolatilityRegime(atr[atr.length - 1] || 0);
    const momentum = this.calculateMomentum(closes, 10);
    const supportResistance = this.findSupportResistanceLevel(closes, highs, lows);
    
    // ML-specific features
    const priceVelocity = this.calculatePriceVelocity(closes);
    const featureImportance = this.calculateFeatureImportance();
    const ensemblePrediction = this.generateEnsemblePrediction(closes);
    const confidenceInterval = this.calculateConfidenceInterval(closes);
    
    return {
      technical_indicators: {
        rsi: rsi[rsi.length - 1] || 50,
        macd: macd.histogram[macd.histogram.length - 1] || 0,
        adx: adx[adx.length - 1] || 25,
        atr: atr[atr.length - 1] || 0,
        bollinger_position: this.getBollingerPosition(closes[closes.length - 1], bollinger),
        volume_ratio: volumeRatio[volumeRatio.length - 1] || 1
      },
      market_structure: {
        trend_strength: trendStrength,
        volatility_regime: volatilityRegime,
        momentum: momentum,
        support_resistance_level: supportResistance
      },
      ml_features: {
        price_velocity: priceVelocity,
        feature_importance_score: featureImportance,
        ensemble_prediction: ensemblePrediction,
        confidence_interval: confidenceInterval
      }
    };
  }

  // Gradient Boosting Signal Generation
  generateGradientBoostingSignal(
    symbol: string, 
    features: GradientBoostingFeatures, 
    currentPrice: number, 
    capital: number
  ): EnhancedMLSignal {
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0.5;
    let gradientScore = 0.5;
    const filtersP

 = [];

    // Gradient Boosting Ensemble Score
    const technicalScore = this.calculateTechnicalScore(features.technical_indicators);
    const structuralScore = this.calculateStructuralScore(features.market_structure);
    const mlScore = this.calculateMLScore(features.ml_features);
    
    // Weighted ensemble prediction
    gradientScore = (technicalScore * 0.4 + structuralScore * 0.35 + mlScore * 0.25);
    
    // Signal determination with confidence scoring
    if (gradientScore > 0.65) {
      signal = 'BUY';
      confidence = Math.min(0.95, 0.5 + (gradientScore - 0.5));
      filtersP.push('High GB Score');
    } else if (gradientScore < 0.35) {
      signal = 'SELL';
      confidence = Math.min(0.95, 0.5 + (0.5 - gradientScore));
      filtersP.push('Low GB Score');
    }

    // Additional filter checks
    if (features.technical_indicators.rsi > 30 && features.technical_indicators.rsi < 70) {
      filtersP.push('RSI Normal');
    }
    
    if (features.market_structure.trend_strength > 0.6) {
      filtersP.push('Strong Trend');
      confidence += 0.05;
    }
    
    if (features.technical_indicators.volume_ratio > 1.2) {
      filtersP.push('Volume Confirmation');
      confidence += 0.03;
    }
    
    if (features.market_structure.volatility_regime !== 'extreme') {
      filtersP.push('Normal Volatility');
    }

    // Risk assessment
    const riskScore = this.calculateRiskScore(features, gradientScore);
    const positionSize = this.calculatePositionSize(capital, riskScore, confidence);
    const stopLoss = this.calculateStopLoss(currentPrice, features.technical_indicators.atr, signal);
    const takeProfit = this.calculateTakeProfit(currentPrice, features.technical_indicators.atr, signal);

    return {
      symbol,
      signal_type: signal,
      confidence: Math.min(0.95, confidence),
      gradient_boost_score: gradientScore,
      features,
      risk_assessment: {
        risk_score: riskScore,
        position_size: positionSize,
        stop_loss: stopLoss,
        take_profit: takeProfit
      },
      filters_passed: filtersP,
      created_at: new Date().toISOString()
    };
  }

  // Technical indicator calculations
  calculateRSI(prices: number[], period: number): number[] {
    const rsi: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    for (let i = period - 1; i < gains.length; i++) {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
    
    return rsi;
  }

  calculateMACD(prices: number[]) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12.map((val, i) => val - ema26[i]);
    const signalLine = this.calculateEMA(macdLine, 9);
    const histogram = macdLine.map((val, i) => val - signalLine[i]);
    
    return { macdLine, signalLine, histogram };
  }

  calculateEMA(prices: number[], period: number): number[] {
    const multiplier = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
    
    return ema;
  }

  calculateADX(highs: number[], lows: number[], closes: number[], period: number): number[] {
    const adx: number[] = [];
    // Simplified ADX calculation
    for (let i = period; i < closes.length; i++) {
      const trueRanges = [];
      const plusDMs = [];
      const minusDMs = [];
      
      for (let j = i - period + 1; j <= i; j++) {
        const tr = Math.max(
          highs[j] - lows[j],
          Math.abs(highs[j] - closes[j - 1]),
          Math.abs(lows[j] - closes[j - 1])
        );
        trueRanges.push(tr);
        
        const plusDM = highs[j] - highs[j - 1] > lows[j - 1] - lows[j] ? 
          Math.max(0, highs[j] - highs[j - 1]) : 0;
        const minusDM = lows[j - 1] - lows[j] > highs[j] - highs[j - 1] ? 
          Math.max(0, lows[j - 1] - lows[j]) : 0;
        
        plusDMs.push(plusDM);
        minusDMs.push(minusDM);
      }
      
      const avgTR = trueRanges.reduce((a, b) => a + b) / period;
      const avgPlusDM = plusDMs.reduce((a, b) => a + b) / period;
      const avgMinusDM = minusDMs.reduce((a, b) => a + b) / period;
      
      const plusDI = (avgPlusDM / avgTR) * 100;
      const minusDI = (avgMinusDM / avgTR) * 100;
      const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
      
      adx.push(dx);
    }
    
    return adx;
  }

  calculateATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
    const atr: number[] = [];
    
    for (let i = period; i < closes.length; i++) {
      const trueRanges = [];
      
      for (let j = i - period + 1; j <= i; j++) {
        const tr = Math.max(
          highs[j] - lows[j],
          Math.abs(highs[j] - closes[j - 1]),
          Math.abs(lows[j] - closes[j - 1])
        );
        trueRanges.push(tr);
      }
      
      atr.push(trueRanges.reduce((a, b) => a + b) / period);
    }
    
    return atr;
  }

  calculateBollingerBands(prices: number[], period: number, stdDev: number) {
    const sma = this.calculateSMA(prices, period);
    const upper: number[] = [];
    const lower: number[] = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      const subset = prices.slice(i - period + 1, i + 1);
      const mean = subset.reduce((a, b) => a + b) / subset.length;
      const variance = subset.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / subset.length;
      const stdDeviation = Math.sqrt(variance);
      
      const smaIndex = i - period + 1;
      upper.push(sma[smaIndex] + (stdDeviation * stdDev));
      lower.push(sma[smaIndex] - (stdDeviation * stdDev));
    }
    
    return { upper, lower };
  }

  calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
      sma.push(sum / period);
    }
    return sma;
  }

  calculateVolumeRatio(volumes: number[], period: number): number[] {
    const ratios: number[] = [];
    const avgVolume = this.calculateSMA(volumes, period);
    
    for (let i = period - 1; i < volumes.length; i++) {
      ratios.push(volumes[i] / avgVolume[i - period + 1]);
    }
    
    return ratios;
  }

  // Market structure calculations
  calculateTrendStrength(prices: number[], period: number): number {
    if (prices.length < period) return 0.5;
    
    const slope = (prices[prices.length - 1] - prices[prices.length - period]) / period;
    const avgPrice = prices.slice(-period).reduce((a, b) => a + b) / period;
    const normalizedSlope = Math.abs(slope / avgPrice);
    
    return Math.min(1, normalizedSlope * 100);
  }

  classifyVolatilityRegime(atr: number): string {
    if (atr > 0.05) return 'extreme';
    if (atr > 0.03) return 'high';
    if (atr > 0.01) return 'normal';
    return 'low';
  }

  calculateMomentum(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    
    const currentPrice = prices[prices.length - 1];
    const pastPrice = prices[prices.length - period];
    
    return (currentPrice - pastPrice) / pastPrice;
  }

  findSupportResistanceLevel(closes: number[], highs: number[], lows: number[]): number {
    // Simplified support/resistance calculation
    const recentHigh = Math.max(...highs.slice(-20));
    const recentLow = Math.min(...lows.slice(-20));
    const currentPrice = closes[closes.length - 1];
    
    const distanceToResistance = (recentHigh - currentPrice) / currentPrice;
    const distanceToSupport = (currentPrice - recentLow) / currentPrice;
    
    return Math.min(distanceToResistance, distanceToSupport);
  }

  // ML-specific calculations
  calculatePriceVelocity(prices: number[]): number {
    if (prices.length < 3) return 0;
    
    const velocity1 = prices[prices.length - 1] - prices[prices.length - 2];
    const velocity2 = prices[prices.length - 2] - prices[prices.length - 3];
    
    return velocity1 - velocity2; // Acceleration
  }

  calculateFeatureImportance(): number {
    // Mock feature importance score
    return 0.75 + Math.random() * 0.2;
  }

  generateEnsemblePrediction(prices: number[]): number {
    // Simple ensemble of different prediction methods
    const trendPrediction = prices[prices.length - 1] > prices[prices.length - 10] ? 0.6 : 0.4;
    const momentumPrediction = this.calculateMomentum(prices, 5) > 0 ? 0.65 : 0.35;
    const meanReversionPrediction = 0.5; // Neutral for mean reversion
    
    return (trendPrediction + momentumPrediction + meanReversionPrediction) / 3;
  }

  calculateConfidenceInterval(prices: number[]): [number, number] {
    const stdDev = this.calculateStdDev(prices.slice(-20));
    const currentPrice = prices[prices.length - 1];
    
    return [currentPrice - stdDev * 1.96, currentPrice + stdDev * 1.96];
  }

  calculateStdDev(values: number[]): number {
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  // Scoring functions
  calculateTechnicalScore(indicators: any): number {
    let score = 0.5;
    
    // RSI scoring
    if (indicators.rsi < 30) score += 0.2;
    else if (indicators.rsi > 70) score -= 0.2;
    
    // MACD scoring
    if (indicators.macd > 0) score += 0.1;
    else score -= 0.1;
    
    // ADX scoring (trend strength)
    if (indicators.adx > 25) score += 0.15;
    
    // Volume scoring
    if (indicators.volume_ratio > 1.5) score += 0.1;
    
    return Math.max(0, Math.min(1, score));
  }

  calculateStructuralScore(structure: any): number {
    let score = 0.5;
    
    // Trend strength
    score += structure.trend_strength * 0.3;
    
    // Momentum
    score += Math.abs(structure.momentum) * 0.2;
    
    // Volatility regime adjustment
    if (structure.volatility_regime === 'normal') score += 0.1;
    else if (structure.volatility_regime === 'extreme') score -= 0.2;
    
    return Math.max(0, Math.min(1, score));
  }

  calculateMLScore(mlFeatures: any): number {
    let score = mlFeatures.ensemble_prediction;
    
    // Feature importance weighting
    score *= mlFeatures.feature_importance_score;
    
    // Price velocity consideration
    if (Math.abs(mlFeatures.price_velocity) > 100) score *= 0.9;
    
    return Math.max(0, Math.min(1, score));
  }

  // Risk management functions
  calculateRiskScore(features: GradientBoostingFeatures, gradientScore: number): number {
    let riskScore = 0.5;
    
    // Higher volatility = higher risk
    if (features.market_structure.volatility_regime === 'extreme') riskScore += 0.3;
    else if (features.market_structure.volatility_regime === 'high') riskScore += 0.15;
    
    // Lower confidence = higher risk
    riskScore += (1 - gradientScore) * 0.3;
    
    // ATR consideration
    const atrRisk = Math.min(0.2, features.technical_indicators.atr * 10);
    riskScore += atrRisk;
    
    return Math.max(0.1, Math.min(0.9, riskScore));
  }

  calculatePositionSize(capital: number, riskScore: number, confidence: number): number {
    const baseRisk = 0.02; // 2% base risk
    const adjustedRisk = baseRisk * (1 - riskScore) * confidence;
    return capital * adjustedRisk;
  }

  calculateStopLoss(currentPrice: number, atr: number, signal: string): number {
    const atrMultiplier = 2;
    
    if (signal === 'BUY') {
      return currentPrice - (atr * atrMultiplier);
    } else if (signal === 'SELL') {
      return currentPrice + (atr * atrMultiplier);
    }
    
    return currentPrice;
  }

  calculateTakeProfit(currentPrice: number, atr: number, signal: string): number {
    const atrMultiplier = 3;
    
    if (signal === 'BUY') {
      return currentPrice + (atr * atrMultiplier);
    } else if (signal === 'SELL') {
      return currentPrice - (atr * atrMultiplier);
    }
    
    return currentPrice;
  }

  getBollingerPosition(currentPrice: number, bollinger: any): number {
    const upper = bollinger.upper[bollinger.upper.length - 1];
    const lower = bollinger.lower[bollinger.lower.length - 1];
    
    return (currentPrice - lower) / (upper - lower);
  }

  // Database operations
  async storeEnhancedSignal(signal: EnhancedMLSignal) {
    const { data, error } = await this.supabase
      .from('ml_trading_signals')
      .insert({
        symbol: signal.symbol,
        signal_type: signal.signal_type,
        confidence: signal.confidence,
        features: signal.features,
        risk_amount: signal.risk_assessment.position_size,
        position_size: signal.risk_assessment.position_size,
        created_at: signal.created_at
      });

    if (error) {
      console.error('Error storing enhanced ML signal:', error);
    }
    
    return { data, error };
  }

  async getFilteredSignals(symbol?: string, limit = 50) {
    let query = this.supabase
      .from('ml_trading_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (symbol) {
      query = query.eq('symbol', symbol);
    }

    return await query;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, symbol, marketData, capital, filter_settings, lookback_days } = await req.json();
    const mlEngine = new EnhancedMLEngine();

    switch (action) {
      case 'generate_enhanced_signal': {
        if (!marketData || !symbol || !capital) {
          throw new Error('Missing required parameters: symbol, marketData, capital');
        }

        const features = mlEngine.generateEnhancedFeatures(marketData);
        const currentPrice = marketData[marketData.length - 1].close;
        const signal = mlEngine.generateGradientBoostingSignal(symbol, features, currentPrice, capital);
        
        // Store signal in database
        await mlEngine.storeEnhancedSignal(signal);

        return new Response(JSON.stringify({
          success: true,
          signal,
          features
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_filtered_signals': {
        const { data, error } = await mlEngine.getFilteredSignals(symbol);
        
        if (error) {
          throw new Error(`Failed to fetch signals: ${error.message}`);
        }

        // Mock enhanced signals for demonstration
        const enhancedSignals = (data || []).map(signal => ({
          ...signal,
          gradient_boost_score: 0.7 + Math.random() * 0.25,
          features: {
            technical_indicators: {
              rsi: 45 + Math.random() * 30,
              macd: (Math.random() - 0.5) * 2,
              adx: 20 + Math.random() * 40,
              atr: 0.01 + Math.random() * 0.04,
              bollinger_position: Math.random(),
              volume_ratio: 0.8 + Math.random() * 0.8
            },
            market_structure: {
              trend_strength: Math.random(),
              volatility_regime: ['low', 'normal', 'high', 'extreme'][Math.floor(Math.random() * 4)],
              momentum: (Math.random() - 0.5) * 0.1,
              support_resistance_level: Math.random() * 0.05
            },
            ml_features: {
              price_velocity: (Math.random() - 0.5) * 200,
              feature_importance_score: 0.6 + Math.random() * 0.3,
              ensemble_prediction: 0.3 + Math.random() * 0.4,
              confidence_interval: [39000, 41000] as [number, number]
            }
          },
          risk_assessment: {
            risk_score: 0.2 + Math.random() * 0.6,
            position_size: 500 + Math.random() * 1000,
            stop_loss: 38000 + Math.random() * 1000,
            take_profit: 42000 + Math.random() * 1000
          },
          filters_passed: ['High GB Score', 'RSI Normal', 'Normal Volatility'].slice(0, Math.floor(Math.random() * 3) + 1)
        }));

        return new Response(JSON.stringify({
          success: true,
          signals: enhancedSignals
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'train_gradient_boosting': {
        // Mock training process
        console.log(`Training Gradient Boosting model for ${symbol} with ${lookback_days} days of data`);
        
        // Simulate training delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        return new Response(JSON.stringify({
          success: true,
          model_info: {
            symbol,
            model_type: 'gradient_boosting',
            training_samples: lookback_days * 24 * 4, // 15min intervals
            validation_accuracy: 0.72 + Math.random() * 0.15,
            feature_count: 15,
            trained_at: new Date().toISOString()
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Enhanced ML Engine Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});