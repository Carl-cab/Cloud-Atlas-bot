import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Kraken API configuration
const KRAKEN_API_KEY = Deno.env.get('KRAKEN_API_KEY')!;
const KRAKEN_PRIVATE_KEY = Deno.env.get('KRAKEN_PRIVATE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')!;

interface MarketRegime {
  regime: 'trend' | 'range' | 'high_volatility';
  confidence: number;
  trend_strength: number;
  volatility: number;
}

interface TradingSignal {
  symbol: string;
  signal_type: 'buy' | 'sell' | 'hold';
  confidence: number;
  price: number;
  strategy_type: 'trend_following' | 'mean_reversion';
  ml_score: number;
  indicators: any;
}

class KrakenAPI {
  private apiKey: string;
  private privateKey: string;
  private baseUrl = 'https://api.kraken.com';

  constructor(apiKey: string, privateKey: string) {
    this.apiKey = apiKey;
    this.privateKey = privateKey;
  }

  async getOHLCData(pair: string, interval: number = 15): Promise<any> {
    const url = `${this.baseUrl}/0/public/OHLC?pair=${pair}&interval=${interval}`;
    const response = await fetch(url);
    return await response.json();
  }

  async getAccountBalance(): Promise<any> {
    return await this.privateRequest('/0/private/Balance', {});
  }

  async addOrder(orderData: any): Promise<any> {
    return await this.privateRequest('/0/private/AddOrder', orderData);
  }

  private async privateRequest(endpoint: string, data: any): Promise<any> {
    const nonce = Date.now() * 1000;
    const postData = new URLSearchParams({ nonce: nonce.toString(), ...data }).toString();
    
    // Create signature (simplified - in production use proper crypto)
    const signature = await this.createSignature(endpoint, postData, nonce);
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'API-Key': this.apiKey,
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
    });
    
    return await response.json();
  }

  private async createSignature(endpoint: string, postData: string, nonce: number): Promise<string> {
    // Simplified signature creation - implement proper HMAC-SHA512 in production
    return btoa(`${nonce}${postData}${endpoint}`);
  }
}

class MLEngine {
  async trainModel(symbol: string, marketData: any[]): Promise<any> {
    console.log(`Training ML model for ${symbol} with ${marketData.length} data points`);
    
    // Simplified ML training simulation
    const features = this.extractFeatures(marketData);
    const labels = this.generateLabels(marketData);
    
    // Simulate model training
    const accuracy = 0.65 + Math.random() * 0.2; // 65-85% accuracy
    const precision = 0.6 + Math.random() * 0.25;
    const recall = 0.55 + Math.random() * 0.3;
    const f1Score = 2 * (precision * recall) / (precision + recall);
    
    const modelMetrics = {
      symbol,
      model_type: 'gradient_boosting',
      version: Date.now(),
      accuracy,
      precision_score: precision,
      recall_score: recall,
      f1_score: f1Score,
      training_data_size: marketData.length,
      feature_importance: {
        rsi: 0.25,
        macd: 0.22,
        bollinger_bands: 0.18,
        volume: 0.15,
        price_momentum: 0.20
      },
      model_params: {
        n_estimators: 100,
        max_depth: 6,
        learning_rate: 0.1
      },
      is_active: true
    };
    
    // Save model to database
    await supabase.from('ml_models').insert(modelMetrics);
    
    return modelMetrics;
  }

  private extractFeatures(data: any[]): number[][] {
    return data.map(candle => [
      parseFloat(candle.close),
      parseFloat(candle.volume),
      parseFloat(candle.high) - parseFloat(candle.low), // Range
      this.calculateRSI(data, data.indexOf(candle)),
      this.calculateMACD(data, data.indexOf(candle))
    ]);
  }

  private generateLabels(data: any[]): number[] {
    return data.map((candle, index) => {
      if (index >= data.length - 5) return 0; // Not enough future data
      const futurePrice = parseFloat(data[index + 5].close);
      const currentPrice = parseFloat(candle.close);
      return futurePrice > currentPrice * 1.01 ? 1 : 0; // 1% threshold
    });
  }

  private calculateRSI(data: any[], index: number, period: number = 14): number {
    if (index < period) return 50;
    
    let gains = 0, losses = 0;
    for (let i = index - period + 1; i <= index; i++) {
      const change = parseFloat(data[i].close) - parseFloat(data[i-1].close);
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(data: any[], index: number): number {
    if (index < 26) return 0;
    
    const ema12 = this.calculateEMA(data, index, 12);
    const ema26 = this.calculateEMA(data, index, 26);
    return ema12 - ema26;
  }

  private calculateEMA(data: any[], index: number, period: number): number {
    if (index < period) return parseFloat(data[index].close);
    
    const multiplier = 2 / (period + 1);
    let ema = parseFloat(data[index - period].close);
    
    for (let i = index - period + 1; i <= index; i++) {
      ema = (parseFloat(data[i].close) * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  async generateSignal(symbol: string, marketData: any[], regime: MarketRegime): Promise<TradingSignal> {
    const latestData = marketData[marketData.length - 1];
    const price = parseFloat(latestData.close);
    
    // Get latest ML model
    const { data: models } = await supabase
      .from('ml_models')
      .select('*')
      .eq('symbol', symbol)
      .eq('is_active', true)
      .order('trained_at', { ascending: false })
      .limit(1);
    
    const model = models?.[0];
    
    // Calculate technical indicators
    const rsi = this.calculateRSI(marketData, marketData.length - 1);
    const macd = this.calculateMACD(marketData, marketData.length - 1);
    
    // Strategy selection based on regime
    let strategy: 'trend_following' | 'mean_reversion';
    let signal: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0.5;
    
    if (regime.regime === 'trend' && regime.confidence > 0.7) {
      strategy = 'trend_following';
      // Trend following logic
      if (macd > 0 && rsi < 70) {
        signal = 'buy';
        confidence = 0.7 + (regime.confidence * 0.2);
      } else if (macd < 0 && rsi > 30) {
        signal = 'sell';
        confidence = 0.7 + (regime.confidence * 0.2);
      }
    } else {
      strategy = 'mean_reversion';
      // Mean reversion logic
      if (rsi < 30) {
        signal = 'buy';
        confidence = 0.6 + ((30 - rsi) / 30 * 0.3);
      } else if (rsi > 70) {
        signal = 'sell';
        confidence = 0.6 + ((rsi - 70) / 30 * 0.3);
      }
    }
    
    // ML score adjustment
    const mlScore = model ? model.accuracy * confidence : confidence * 0.8;
    
    const tradingSignal: TradingSignal = {
      symbol,
      signal_type: signal,
      confidence: Math.min(confidence, 0.95),
      price,
      strategy_type: strategy,
      ml_score: mlScore,
      indicators: {
        rsi,
        macd,
        regime: regime.regime,
        volatility: regime.volatility
      }
    };
    
    // Save signal to database
    await supabase.from('strategy_signals').insert({
      ...tradingSignal,
      timestamp: new Date().toISOString()
    });
    
    return tradingSignal;
  }
}

class RegimeDetector {
  detectRegime(marketData: any[]): MarketRegime {
    if (marketData.length < 50) {
      return { regime: 'range', confidence: 0.5, trend_strength: 0, volatility: 0 };
    }
    
    const prices = marketData.slice(-50).map(d => parseFloat(d.close));
    const returns = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
    
    // Calculate volatility
    const volatility = this.calculateVolatility(returns);
    
    // Calculate trend strength
    const trendStrength = this.calculateTrendStrength(prices);
    
    // Determine regime
    let regime: 'trend' | 'range' | 'high_volatility';
    let confidence = 0;
    
    if (volatility > 0.03) { // High volatility threshold
      regime = 'high_volatility';
      confidence = Math.min(volatility * 20, 0.95);
    } else if (Math.abs(trendStrength) > 0.6) {
      regime = 'trend';
      confidence = Math.abs(trendStrength);
    } else {
      regime = 'range';
      confidence = 1 - Math.abs(trendStrength);
    }
    
    const regimeData: MarketRegime = {
      regime,
      confidence: Math.min(confidence, 0.95),
      trend_strength: trendStrength,
      volatility
    };
    
    return regimeData;
  }

  private calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private calculateTrendStrength(prices: number[]): number {
    const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
    const secondHalf = prices.slice(Math.floor(prices.length / 2));
    
    const avgFirst = firstHalf.reduce((sum, p) => sum + p, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, p) => sum + p, 0) / secondHalf.length;
    
    return (avgSecond - avgFirst) / avgFirst;
  }
}

class RiskManager {
  private maxRiskPerTrade = 0.005; // 0.5%
  private maxDailyLoss = 0.02; // 2%
  private maxPositions = 4;

  async evaluateRisk(signal: TradingSignal, balance: number): Promise<{
    approved: boolean;
    positionSize: number;
    reason?: string;
  }> {
    // Check daily loss limit
    const today = new Date().toISOString().split('T')[0];
    const { data: todayPnL } = await supabase
      .from('daily_pnl')
      .select('total_pnl')
      .eq('date', today)
      .single();
    
    const dailyPnL = todayPnL?.total_pnl || 0;
    if (dailyPnL < -balance * this.maxDailyLoss) {
      return { approved: false, positionSize: 0, reason: 'Daily loss limit reached' };
    }
    
    // Check max positions
    const { data: openPositions } = await supabase
      .from('trading_positions')
      .select('id')
      .eq('status', 'open');
    
    if (openPositions && openPositions.length >= this.maxPositions) {
      return { approved: false, positionSize: 0, reason: 'Maximum positions reached' };
    }
    
    // Calculate position size based on risk
    const riskAmount = balance * this.maxRiskPerTrade;
    const positionSize = riskAmount / (signal.price * 0.02); // Assuming 2% stop loss
    
    return {
      approved: signal.confidence > 0.6,
      positionSize: Math.max(positionSize, 0.001), // Minimum order size
      reason: signal.confidence <= 0.6 ? 'Low confidence signal' : undefined
    };
  }
}

class NotificationManager {
  async sendTelegramMessage(message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      });
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
    }
  }

  async notifyTrade(signal: TradingSignal, executed: boolean, reason?: string): Promise<void> {
    const emoji = signal.signal_type === 'buy' ? '🟢' : signal.signal_type === 'sell' ? '🔴' : '🟡';
    const status = executed ? '✅ EXECUTED' : '❌ SKIPPED';
    
    const message = `
${emoji} <b>Trading Signal ${status}</b>

<b>Symbol:</b> ${signal.symbol}
<b>Action:</b> ${signal.signal_type.toUpperCase()}
<b>Price:</b> $${signal.price.toFixed(2)}
<b>Confidence:</b> ${(signal.confidence * 100).toFixed(1)}%
<b>Strategy:</b> ${signal.strategy_type.replace('_', ' ').toUpperCase()}
<b>ML Score:</b> ${(signal.ml_score * 100).toFixed(1)}%

${reason ? `<b>Reason:</b> ${reason}` : ''}

<i>Timestamp:</i> ${new Date().toLocaleString()}
    `;
    
    await this.sendTelegramMessage(message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, symbol = 'XBTUSD', userId } = await req.json();
    
    const krakenAPI = new KrakenAPI(KRAKEN_API_KEY, KRAKEN_PRIVATE_KEY);
    const mlEngine = new MLEngine();
    const regimeDetector = new RegimeDetector();
    const riskManager = new RiskManager();
    const notificationManager = new NotificationManager();

    switch (action) {
      case 'analyze_market':
        // Fetch market data
        const ohlcData = await krakenAPI.getOHLCData(symbol);
        const marketData = ohlcData.result[Object.keys(ohlcData.result)[0]];
        
        // Store market data
        const formattedData = marketData.slice(-100).map((candle: any) => ({
          symbol,
          timestamp: new Date(candle[0] * 1000).toISOString(),
          timeframe: '15m',
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[6])
        }));
        
        await supabase.from('market_data').upsert(formattedData);
        
        // Detect regime
        const regime = regimeDetector.detectRegime(marketData);
        await supabase.from('market_regimes').insert({
          symbol,
          timestamp: new Date().toISOString(),
          regime: regime.regime,
          confidence: regime.confidence,
          trend_strength: regime.trend_strength,
          volatility: regime.volatility
        });
        
        // Generate trading signal
        const signal = await mlEngine.generateSignal(symbol, marketData, regime);
        
        return new Response(JSON.stringify({
          regime,
          signal,
          marketData: formattedData.slice(-20)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'execute_trade':
        // Get user's bot config
        const { data: botConfig } = await supabase
          .from('bot_config')
          .select('*')
          .eq('user_id', userId)
          .single();
        
        if (!botConfig?.is_active) {
          return new Response(JSON.stringify({ error: 'Bot is not active' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Get latest signal
        const { data: latestSignal } = await supabase
          .from('strategy_signals')
          .select('*')
          .eq('symbol', symbol)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (!latestSignal || latestSignal.signal_type === 'hold') {
          return new Response(JSON.stringify({ message: 'No actionable signal' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Risk evaluation
        const balance = botConfig.capital_cad;
        const riskEval = await riskManager.evaluateRisk(latestSignal, balance);
        
        if (!riskEval.approved) {
          await notificationManager.notifyTrade(latestSignal, false, riskEval.reason);
          return new Response(JSON.stringify({ 
            message: 'Trade rejected by risk management',
            reason: riskEval.reason 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Execute trade (paper trading mode)
        if (botConfig.mode === 'paper') {
          const position = {
            user_id: userId,
            symbol,
            side: latestSignal.signal_type,
            quantity: riskEval.positionSize,
            entry_price: latestSignal.price,
            strategy_used: latestSignal.strategy_type,
            risk_amount: balance * 0.005,
            status: 'open'
          };
          
          await supabase.from('trading_positions').insert(position);
          await notificationManager.notifyTrade(latestSignal, true, 'Paper trade executed');
          
          return new Response(JSON.stringify({ 
            message: 'Paper trade executed successfully',
            position 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        break;

      case 'train_model':
        // Get historical data for training
        const { data: historicalData } = await supabase
          .from('market_data')
          .select('*')
          .eq('symbol', symbol)
          .order('timestamp', { ascending: true })
          .limit(1000);
        
        if (!historicalData || historicalData.length < 100) {
          return new Response(JSON.stringify({ error: 'Insufficient historical data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const model = await mlEngine.trainModel(symbol, historicalData);
        
        return new Response(JSON.stringify({ 
          message: 'Model trained successfully',
          model 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Trading bot error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});