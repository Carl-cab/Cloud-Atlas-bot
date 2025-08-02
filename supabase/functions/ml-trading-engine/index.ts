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

interface MLFeatures {
  rsi: number;
  volatility: number;
  returns: number;
  sma_20: number;
  bollinger_upper: number;
  bollinger_lower: number;
}

interface TradingSignal {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  features: MLFeatures;
  risk_amount: number;
  position_size: number;
  timestamp: string;
}

class MLTradingEngine {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
  }

  // Generate technical indicators and features
  generateFeatures(data: MarketData[]): MLFeatures {
    const closes = data.map(d => d.close);
    const returns = this.calculateReturns(closes);
    const rsi = this.calculateRSI(closes, 14);
    const volatility = this.calculateVolatility(returns, 10);
    const sma20 = this.calculateSMA(closes, 20);
    const bollinger = this.calculateBollingerBands(closes, 20, 2);
    
    return {
      rsi: rsi[rsi.length - 1] || 50,
      volatility: volatility[volatility.length - 1] || 0.02,
      returns: returns[returns.length - 1] || 0,
      sma_20: sma20[sma20.length - 1] || closes[closes.length - 1],
      bollinger_upper: bollinger.upper[bollinger.upper.length - 1] || closes[closes.length - 1],
      bollinger_lower: bollinger.lower[bollinger.lower.length - 1] || closes[closes.length - 1]
    };
  }

  // Calculate RSI
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

  // Calculate returns
  calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  // Calculate volatility
  calculateVolatility(returns: number[], period: number): number[] {
    const volatility: number[] = [];
    for (let i = period - 1; i < returns.length; i++) {
      const subset = returns.slice(i - period + 1, i + 1);
      const mean = subset.reduce((a, b) => a + b) / subset.length;
      const variance = subset.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / subset.length;
      volatility.push(Math.sqrt(variance));
    }
    return volatility;
  }

  // Calculate Simple Moving Average
  calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
      sma.push(sum / period);
    }
    return sma;
  }

  // Calculate Bollinger Bands
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

  // ML-based signal generation (simplified rule-based for now)
  generateSignal(symbol: string, features: MLFeatures, currentPrice: number, capital: number): TradingSignal {
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0.5;

    // Multi-factor scoring system
    let score = 0;
    
    // RSI signals
    if (features.rsi < 30) score += 0.3; // Oversold
    if (features.rsi > 70) score -= 0.3; // Overbought
    
    // Bollinger Band signals
    if (currentPrice < features.bollinger_lower) score += 0.2;
    if (currentPrice > features.bollinger_upper) score -= 0.2;
    
    // Trend signals
    if (currentPrice > features.sma_20) score += 0.1;
    if (currentPrice < features.sma_20) score -= 0.1;
    
    // Volatility adjustment
    if (features.volatility > 0.05) score *= 0.8; // Reduce confidence in high volatility
    
    // Generate signal based on score
    if (score > 0.4) {
      signal = 'BUY';
      confidence = Math.min(0.95, 0.5 + score);
    } else if (score < -0.4) {
      signal = 'SELL';
      confidence = Math.min(0.95, 0.5 + Math.abs(score));
    }

    // Risk management - 0.5% of capital per trade
    const riskAmount = capital * 0.005;
    const positionSize = riskAmount / currentPrice;

    return {
      symbol,
      signal,
      confidence,
      features,
      risk_amount: riskAmount,
      position_size: positionSize,
      timestamp: new Date().toISOString()
    };
  }

  // Store ML signal in database
  async storeSignal(signal: TradingSignal) {
    const { data, error } = await this.supabase
      .from('ml_trading_signals')
      .insert({
        symbol: signal.symbol,
        signal_type: signal.signal,
        confidence: signal.confidence,
        features: signal.features,
        risk_amount: signal.risk_amount,
        position_size: signal.position_size,
        created_at: signal.timestamp
      });

    if (error) {
      console.error('Error storing ML signal:', error);
    }
    
    return { data, error };
  }

  // Get recent signals for analysis
  async getRecentSignals(symbol?: string, limit = 50) {
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
    const { action, symbol, marketData, capital } = await req.json();
    const mlEngine = new MLTradingEngine();

    switch (action) {
      case 'generate_signal': {
        if (!marketData || !symbol || !capital) {
          throw new Error('Missing required parameters: symbol, marketData, capital');
        }

        const features = mlEngine.generateFeatures(marketData);
        const currentPrice = marketData[marketData.length - 1].close;
        const signal = mlEngine.generateSignal(symbol, features, currentPrice, capital);
        
        // Store signal in database
        await mlEngine.storeSignal(signal);

        return new Response(JSON.stringify({
          success: true,
          signal,
          features
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_signals': {
        const { data, error } = await mlEngine.getRecentSignals(symbol);
        
        if (error) {
          throw new Error(`Failed to fetch signals: ${error.message}`);
        }

        return new Response(JSON.stringify({
          success: true,
          signals: data
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'analyze_features': {
        if (!marketData) {
          throw new Error('Missing marketData parameter');
        }

        const features = mlEngine.generateFeatures(marketData);
        
        return new Response(JSON.stringify({
          success: true,
          features,
          technical_analysis: {
            trend: features.rsi > 50 ? 'bullish' : 'bearish',
            volatility_level: features.volatility > 0.03 ? 'high' : 'normal',
            price_position: 'analyzing bollinger bands...'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('ML Trading Engine Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});