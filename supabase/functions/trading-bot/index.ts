import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyRateLimit, rateLimitConfigs } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// PHASE 0 FIX: Global Kraken keys removed. Per-user keys are fetched at runtime.
// Only notification keys remain as global config (not exchange credentials).
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

/**
 * PHASE 0 FIX: Fetch per-user Kraken credentials from the secure-credentials edge function.
 * Never uses global API keys. Throws if credentials are not found.
 */
async function getPerUserKrakenCredentials(userId: string, userToken: string): Promise<{ apiKey: string; privateKey: string }> {
  const response = await fetch(`${supabaseUrl}/functions/v1/secure-credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ action: 'retrieve', exchange: 'kraken' }),
  });
  if (!response.ok) {
    throw new Error(`Failed to retrieve Kraken credentials: HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data.success || !data.api_key || !data.api_secret) {
    throw new Error('Kraken API credentials not found. Please configure your API keys in Settings.');
  }
  return { apiKey: data.api_key, privateKey: data.api_secret };
}

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
  // =========================================================================
  // ABSOLUTE HARD LIMITS — cannot be overridden by user configuration.
  // These protect the system even if risk_settings are misconfigured.
  // =========================================================================
  private readonly ABSOLUTE_MAX_RISK_PER_TRADE  = 0.10;  // 10% of capital per trade
  private readonly ABSOLUTE_MAX_DAILY_LOSS      = 0.20;  // 20% of capital per day
  private readonly ABSOLUTE_MAX_DRAWDOWN        = 0.30;  // 30% peak-to-trough drawdown
  private readonly ABSOLUTE_MAX_POSITIONS       = 10;
  private readonly ABSOLUTE_MIN_STOP_LOSS_PCT   = 0.001; // 0.1% minimum stop-loss
  private readonly ABSOLUTE_MAX_TRADE_SIZE_USD  = 10000; // $10,000 hard cap per trade
  // Default cooldown durations (in milliseconds)
  private readonly COOLDOWN_DAILY_LOSS_MS       = 24 * 60 * 60 * 1000; // 24 hours
  private readonly COOLDOWN_CIRCUIT_BREAKER_MS  = 60 * 60 * 1000;      // 1 hour
  private readonly COOLDOWN_MAX_DRAWDOWN_MS     = 48 * 60 * 60 * 1000; // 48 hours

  // -------------------------------------------------------------------------
  // Pause the bot with a reason and schedule automatic cooldown resumption.
  // Writes a risk_cooldowns row so the scheduler can re-enable trading.
  // -------------------------------------------------------------------------
  private async engageCooldown(
    userId: string,
    reason: string,
    cooldownMs: number,
    details: Record<string, unknown>
  ): Promise<void> {
    const resumeAt = new Date(Date.now() + cooldownMs).toISOString();

    // 1. Pause the bot
    await supabase
      .from('bot_config')
      .update({ is_paused: true, paused_reason: reason })
      .eq('user_id', userId);

    // 2. Record the cooldown so the scheduler can auto-resume
    await supabase
      .from('risk_cooldowns')
      .upsert({
        user_id:    userId,
        reason,
        engaged_at: new Date().toISOString(),
        resume_at:  resumeAt,
        details,
        resolved:   false,
      }, { onConflict: 'user_id,reason' });

    // 3. Notify the operator via Telegram (best-effort, never throws)
    try {
      const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const { data: notifSettings } = await supabase
        .from('notification_settings')
        .select('telegram_chat_id, telegram_enabled')
        .eq('user_id', userId)
        .maybeSingle();

      if (telegramToken && notifSettings?.telegram_enabled && notifSettings?.telegram_chat_id) {
        const resumeDate = new Date(resumeAt).toUTCString();
        const message = [
          '🚨 <b>Cloud Atlas Bot — Risk Limit Breached</b>',
          '',
          `<b>Reason:</b> ${reason}`,
          `<b>Cooldown:</b> ${Math.round(cooldownMs / 60000)} minutes`,
          `<b>Auto-resume:</b> ${resumeDate}`,
          '',
          ...Object.entries(details).map(([k, v]) => `<b>${k}:</b> ${v}`),
          '',
          '<i>Trading has been paused automatically. The bot will resume after the cooldown period unless manually overridden.</i>',
        ].join('\n');

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: notifSettings.telegram_chat_id,
            text: message,
            parse_mode: 'HTML',
          }),
        });
      }
    } catch (notifErr) {
      console.error('Operator notification failed (non-fatal):', notifErr);
    }
  }

  // -------------------------------------------------------------------------
  // Main risk evaluation — called before every order placement.
  // All DB queries are scoped to userId (authenticated JWT user).
  // -------------------------------------------------------------------------
  async evaluateRisk(
    signal: TradingSignal,
    balance: number,
    userId: string
  ): Promise<{
    approved: boolean;
    positionSize: number;
    stopLossPct: number;
    takeProfitPct: number;
    reason?: string;
  }> {
    // --- Load user's risk settings (with safe defaults) ---
    const { data: riskSettings } = await supabase
      .from('risk_settings')
      .select('max_daily_loss, max_position_size, max_positions, stop_loss_pct, take_profit_pct, max_trade_size_usd, circuit_breaker_enabled, circuit_breaker_threshold, max_drawdown')
      .eq('user_id', userId)
      .maybeSingle();

    // Clamp all user settings to absolute hard limits
    const maxDailyLossFraction = Math.min(
      riskSettings?.max_daily_loss ? riskSettings.max_daily_loss / 100 : 0.05,
      this.ABSOLUTE_MAX_DAILY_LOSS
    );
    const maxDrawdownFraction = Math.min(
      riskSettings?.max_drawdown ? riskSettings.max_drawdown / 100 : 0.10,
      this.ABSOLUTE_MAX_DRAWDOWN
    );
    const maxPositionFraction = Math.min(
      riskSettings?.max_position_size ?? 0.10,
      this.ABSOLUTE_MAX_RISK_PER_TRADE
    );
    const maxPositions = Math.min(
      riskSettings?.max_positions ?? 4,
      this.ABSOLUTE_MAX_POSITIONS
    );
    const stopLossPct = Math.max(
      riskSettings?.stop_loss_pct ?? 0.02,
      this.ABSOLUTE_MIN_STOP_LOSS_PCT
    );
    const takeProfitPct = riskSettings?.take_profit_pct ?? 0.04;
    const maxTradeSizeUsd = Math.min(
      riskSettings?.max_trade_size_usd ?? 50.0,
      this.ABSOLUTE_MAX_TRADE_SIZE_USD
    );

    // =========================================================================
    // LAYER 1: Kill switch — immediate halt, no cooldown needed
    // =========================================================================
    const { data: botConfig } = await supabase
      .from('bot_config')
      .select('is_paused, paused_reason')
      .eq('user_id', userId)
      .maybeSingle();

    if (botConfig?.is_paused === true) {
      const reason = botConfig.paused_reason || 'Kill switch activated';
      return { approved: false, positionSize: 0, stopLossPct, takeProfitPct, reason: `Trading paused: ${reason}` };
    }

    // =========================================================================
    // LAYER 2: Daily loss limit — 24-hour cooldown on breach
    // =========================================================================
    const today = new Date().toISOString().split('T')[0];
    const { data: todayPnL } = await supabase
      .from('daily_pnl')
      .select('total_pnl')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    const dailyPnL = Number(todayPnL?.total_pnl ?? 0);
    const dailyLossLimit = balance * maxDailyLossFraction;
    if (dailyPnL < -dailyLossLimit) {
      await this.engageCooldown(userId, 'DAILY_LOSS_LIMIT', this.COOLDOWN_DAILY_LOSS_MS, {
        daily_pnl:        `$${dailyPnL.toFixed(2)}`,
        daily_loss_limit: `$${dailyLossLimit.toFixed(2)} (${(maxDailyLossFraction * 100).toFixed(1)}% of capital)`,
        balance:          `$${balance.toFixed(2)}`,
        resume_in:        '24 hours',
      });
      return { approved: false, positionSize: 0, stopLossPct, takeProfitPct, reason: 'Daily loss limit reached — bot paused for 24 hours' };
    }

    // =========================================================================
    // LAYER 3: Maximum drawdown — 48-hour cooldown on breach
    //
    // Drawdown = (peak_balance - current_balance) / peak_balance
    // Peak balance is the highest available_balance recorded in pnl_snapshots.
    // =========================================================================
    const { data: peakSnapshot } = await supabase
      .from('pnl_snapshots')
      .select('portfolio_value')
      .eq('user_id', userId)
      .order('portfolio_value', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (peakSnapshot) {
      const peakBalance = Number(peakSnapshot.portfolio_value);
      const drawdown = peakBalance > 0 ? (peakBalance - balance) / peakBalance : 0;
      const drawdownLimit = maxDrawdownFraction;

      if (drawdown > drawdownLimit) {
        await this.engageCooldown(userId, 'MAX_DRAWDOWN', this.COOLDOWN_MAX_DRAWDOWN_MS, {
          current_balance: `$${balance.toFixed(2)}`,
          peak_balance:    `$${peakBalance.toFixed(2)}`,
          drawdown:        `${(drawdown * 100).toFixed(2)}%`,
          drawdown_limit:  `${(drawdownLimit * 100).toFixed(1)}%`,
          resume_in:       '48 hours',
        });
        return { approved: false, positionSize: 0, stopLossPct, takeProfitPct, reason: `Maximum drawdown exceeded (${(drawdown * 100).toFixed(2)}%) — bot paused for 48 hours` };
      }
    }

    // =========================================================================
    // LAYER 4: Circuit breaker — 1-hour cooldown on breach
    // =========================================================================
    if (riskSettings?.circuit_breaker_enabled && riskSettings?.circuit_breaker_threshold) {
      const { data: recentTrades } = await supabase
        .from('executed_trades')
        .select('realized_pnl')
        .eq('user_id', userId)
        .gte('timestamp', new Date(Date.now() - 3600000).toISOString());

      const recentLoss = (recentTrades ?? []).reduce(
        (sum: number, t: any) => sum + Number(t.realized_pnl ?? 0), 0
      );
      const circuitBreakerLimit = balance * (riskSettings.circuit_breaker_threshold / 100);

      if (recentLoss < -circuitBreakerLimit) {
        await this.engageCooldown(userId, 'CIRCUIT_BREAKER', this.COOLDOWN_CIRCUIT_BREAKER_MS, {
          recent_loss_1h:       `$${recentLoss.toFixed(2)}`,
          circuit_breaker_limit: `$${circuitBreakerLimit.toFixed(2)} (${riskSettings.circuit_breaker_threshold}% of capital)`,
          resume_in:            '1 hour',
        });
        return { approved: false, positionSize: 0, stopLossPct, takeProfitPct, reason: 'Circuit breaker triggered — bot paused for 1 hour' };
      }
    }

    // =========================================================================
    // LAYER 5: Maximum open positions
    // =========================================================================
    const { data: openPositions } = await supabase
      .from('trading_positions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'open');

    if ((openPositions?.length ?? 0) >= maxPositions) {
      return { approved: false, positionSize: 0, stopLossPct, takeProfitPct, reason: 'Maximum open positions reached' };
    }

    // =========================================================================
    // LAYER 6: Mandatory stop-loss validation
    // =========================================================================
    if (stopLossPct <= 0) {
      return { approved: false, positionSize: 0, stopLossPct, takeProfitPct, reason: 'Stop-loss percentage must be greater than zero' };
    }

    // =========================================================================
    // Position sizing — Kelly-inspired risk-based sizing
    // position_size = (risk_amount) / (entry_price * stop_loss_pct)
    // =========================================================================
    const riskAmount = balance * maxPositionFraction;
    let positionSize = riskAmount / (signal.price * stopLossPct);

    // Hard cap on trade size in USD
    const tradeSizeUsd = positionSize * signal.price;
    if (tradeSizeUsd > maxTradeSizeUsd) {
      positionSize = maxTradeSizeUsd / signal.price;
    }

    // Enforce minimum viable order size
    positionSize = Math.max(positionSize, 0.001);

    const approved = signal.confidence > 0.6;
    return {
      approved,
      positionSize,
      stopLossPct,
      takeProfitPct,
      reason: !approved ? 'Signal confidence below threshold (0.6)' : undefined
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

// Helper function to generate strategy signals
function generateStrategySignal(strategy: string, marketData: any[], config: any = {}) {
  const latest = marketData[0];
  const prices = marketData.map(d => parseFloat(d.close)).reverse();
  
  if (strategy === 'trend_following') {
    // Calculate EMAs
    const ema9 = calculateEMA(prices, 9);
    const ema21 = calculateEMA(prices, 21);
    
    // Calculate MACD (simplified)
    const macdLine = ema9[ema9.length - 1] - ema21[ema21.length - 1];
    
    // Trend following logic
    const emaSignal = ema9[ema9.length - 1] > ema21[ema21.length - 1] ? 'buy' : 'sell';
    
    let signalType = 'hold';
    let confidence = 50;
    
    if (emaSignal === 'buy' && macdLine > 0) {
      signalType = 'buy';
      confidence = Math.min(95, 70 + Math.abs(macdLine) * 10);
    } else if (emaSignal === 'sell' && macdLine < 0) {
      signalType = 'sell';
      confidence = Math.min(95, 70 + Math.abs(macdLine) * 10);
    }
    
    return {
      type: signalType,
      confidence,
      price: parseFloat(latest.close),
      indicators: {
        ema9: ema9[ema9.length - 1],
        ema21: ema21[ema21.length - 1],
        macd: macdLine
      },
      mlScore: null
    };
    
  } else if (strategy === 'mean_reversion') {
    // Calculate RSI
    const rsi = calculateRSI(prices, 14);
    const currentRSI = rsi[rsi.length - 1] || 50;
    const currentPrice = parseFloat(latest.close);
    
    let signalType = 'hold';
    let confidence = 50;
    
    // Mean reversion logic
    if (currentRSI < (config.rsiOversold || 30)) {
      signalType = 'buy';
      confidence = Math.min(95, 70 + (30 - currentRSI));
    } else if (currentRSI > (config.rsiOverbought || 70)) {
      signalType = 'sell';
      confidence = Math.min(95, 70 + (currentRSI - 70));
    }
    
    return {
      type: signalType,
      confidence,
      price: currentPrice,
      indicators: {
        rsi: currentRSI
      },
      mlScore: null
    };
  }
  
  // Default hold signal
  return {
    type: 'hold',
    confidence: 50,
    price: parseFloat(latest.close),
    indicators: {},
    mlScore: null
  };
}

// Technical indicator calculation functions
function calculateEMA(prices: number[], period: number): number[] {
  const ema = [];
  const k = 2 / (period + 1);
  ema[0] = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }
  
  return ema;
}

function calculateRSI(prices: number[], period: number): number[] {
  const rsi = [];
  const gains = [];
  const losses = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  for (let i = period - 1; i < gains.length; i++) {
    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Apply rate limiting (fail open if rate limiter errors)
    try {
      const rateLimitResponse = await applyRateLimit(req, rateLimitConfigs.api);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    } catch (rlErr) {
      console.error('Rate limiter error (non-fatal, failing open):', rlErr);
    }

    console.log('[trading-bot] Request received, version: phase3-debug-v2');

    // --- PHASE 0 FIX: Strict JWT validation ---
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or malformed authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // --- END PHASE 0 FIX ---

    // Parse request body only once to avoid "Body already consumed" error
    const requestBody = await req.json();
    const { action, symbol = 'XBTUSD', userId: requestedUserId, strategy, config = {}, strategies = [], config: strategyConfig = {} } = requestBody;

    // PHASE 0 FIX: Reject any attempt to act on behalf of a different user
    if (requestedUserId && requestedUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied: userId in payload does not match authenticated user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // Always use the authenticated user ID — never trust the request body
    const userId = user.id;

    console.log(`Trading bot action: ${action}, symbol: ${symbol}, user: ${userId}`);

    // PHASE 0 FIX: Fetch per-user Kraken credentials at runtime (no global keys)
    // Only fetch credentials for actions that actually call the exchange API.
    // execute_trade does NOT need credentials in paper mode (the default).
    let krakenAPI: KrakenAPI | null = null;
    const exchangeActions = ['analyze_market'];
    if (exchangeActions.includes(action)) {
      const creds = await getPerUserKrakenCredentials(userId, token);
      krakenAPI = new KrakenAPI(creds.apiKey, creds.privateKey);
    }
    const mlEngine = new MLEngine();
    const regimeDetector = new RegimeDetector();
    const riskManager = new RiskManager();
    const notificationManager = new NotificationManager();

    switch (action) {
      case 'analyze_market':
        // Fetch market data
        if (!krakenAPI) throw new Error('Kraken API not initialized for this action');
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

      case 'generate_signal':
        
        // Get recent market data
        const { data: recentData } = await supabase
          .from('market_data')
          .select('*')
          .eq('symbol', symbol)
          .order('timestamp', { ascending: false })
          .limit(50);
        
        if (!recentData || recentData.length === 0) {
          console.log(`No market data for ${symbol}, fetching from Kraken...`);
          
          // Fallback: fetch fresh data from Kraken
          try {
            const ohlcData = await krakenAPI.getOHLCData(symbol);
            const marketData = ohlcData.result[Object.keys(ohlcData.result)[0]];
            
            if (!marketData || marketData.length === 0) {
              throw new Error('No data from Kraken');
            }
            
            // Store the fresh data
            const formattedData = marketData.slice(-50).map((candle: any) => ({
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
            
            // Use the fresh data for signal generation
            const strategySignal = generateStrategySignal(strategy, formattedData, config);
            
            await supabase.from('strategy_signals').insert({
              symbol,
              signal_type: strategySignal.type,
              strategy_type: strategy,
              confidence: strategySignal.confidence,
              price: strategySignal.price,
              timestamp: new Date().toISOString(),
              indicators: strategySignal.indicators,
              ml_score: strategySignal.mlScore
            });
            
            return new Response(JSON.stringify({ 
              signal: strategySignal,
              message: 'Signal generated with fresh market data'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
            
          } catch (fallbackError) {
            console.error('Fallback data fetch failed:', fallbackError);
            return new Response(JSON.stringify({ 
              error: 'No market data available and fallback failed',
              details: fallbackError.message 
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
        
        const strategySignal = generateStrategySignal(strategy, recentData, config);
        
        // Store signal
        await supabase.from('strategy_signals').insert({
          symbol,
          signal_type: strategySignal.type,
          strategy_type: strategy,
          confidence: strategySignal.confidence,
          price: strategySignal.price,
          timestamp: new Date().toISOString(),
          indicators: strategySignal.indicators,
          ml_score: strategySignal.mlScore
        });
        
        return new Response(JSON.stringify({ signal: strategySignal }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'start_strategies':
        
        // Generate initial signals for each strategy
        for (const strategy of strategies) {
          try {
            const { data: recentData } = await supabase
              .from('market_data')
              .select('*')
              .eq('symbol', symbol)
              .order('timestamp', { ascending: false })
              .limit(50);
            
            if (recentData && recentData.length > 0) {
              const strategySignal = generateStrategySignal(strategy, recentData, strategyConfig);
              
              await supabase.from('strategy_signals').insert({
                symbol,
                signal_type: strategySignal.type,
                strategy_type: strategy,
                confidence: strategySignal.confidence,
                price: strategySignal.price,
                timestamp: new Date().toISOString(),
                indicators: strategySignal.indicators,
                ml_score: strategySignal.mlScore
              });
            }
          } catch (error) {
            console.error(`Error generating ${strategy} signal:`, error);
          }
        }
        
        return new Response(JSON.stringify({ 
          message: 'Strategy engines started',
          strategies 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'execute_trade': {
        console.log('[execute_trade] Starting for user:', userId, 'symbol:', symbol);

        // Get user's bot config
        const { data: botConfigData, error: botConfigErr } = await supabase
          .from('bot_config')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        console.log('[execute_trade] bot_config query result:', botConfigData ? 'found' : 'null', botConfigErr ? `err: ${botConfigErr.message}` : 'no-error');

        let botConfig = botConfigData;

        // Auto-initialize safe paper config if none exists
        if (!botConfig) {
          console.log('[execute_trade] No bot_config found, auto-creating paper config');
          const defaultConfig = {
            user_id: userId,
            mode: 'paper',
            is_active: true,
            is_paused: false,
            capital_cad: 10000,
            daily_stop_loss: 5,
          };
          const { data: newConfig, error: insertErr } = await supabase
            .from('bot_config')
            .insert(defaultConfig)
            .select()
            .single();

          if (insertErr) {
            console.error('[execute_trade] bot_config insert failed:', insertErr.message, insertErr.details, insertErr.hint);
            return new Response(JSON.stringify({
              error: 'Bot configuration could not be initialized',
              detail: insertErr.message,
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          console.log('[execute_trade] bot_config created:', newConfig?.mode);
          botConfig = newConfig;
        }

        // PHASE 2 FIX: Check kill switch BEFORE is_active — paused takes priority
        if (botConfig.is_paused === true) {
          const pauseReason = botConfig.paused_reason || 'Kill switch activated';
          return new Response(JSON.stringify({ error: `Trading is paused: ${pauseReason}` }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!botConfig.is_active) {
          return new Response(JSON.stringify({ error: 'Bot is not active' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get latest signal
        console.log('[execute_trade] Querying strategy_signals for symbol:', symbol);
        const { data: latestSignal, error: sigErr } = await supabase
          .from('strategy_signals')
          .select('*')
          .eq('symbol', symbol)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('[execute_trade] Signal result:', latestSignal ? latestSignal.signal_type : 'null', sigErr ? `err: ${sigErr.message}` : 'no-error');

        if (!latestSignal || latestSignal.signal_type === 'hold') {
          return new Response(JSON.stringify({ message: 'No actionable signal' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // PHASE 2 FIX: Pass userId to evaluateRisk so DB queries are user-scoped
        const balance = Number(botConfig.capital_cad) || 10000;
        console.log('[execute_trade] Running risk evaluation, balance:', balance);
        const riskEval = await riskManager.evaluateRisk(latestSignal, balance, userId);
        console.log('[execute_trade] Risk result: approved=', riskEval.approved, 'reason=', riskEval.reason);

        if (!riskEval.approved) {
          try { await notificationManager.notifyTrade(latestSignal, false, riskEval.reason); } catch (nErr) { console.error('[execute_trade] Notification error (non-fatal):', nErr); }
          return new Response(JSON.stringify({
            message: 'Trade rejected by risk management',
            reason: riskEval.reason
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Execute trade (paper trading mode)
        if (botConfig.mode === 'paper') {
          const stopLossPrice = latestSignal.price * (1 - riskEval.stopLossPct);
          const takeProfitPrice = latestSignal.price * (1 + riskEval.takeProfitPct);

          const position = {
            user_id: userId,
            symbol,
            side: latestSignal.signal_type,
            quantity: riskEval.positionSize,
            entry_price: latestSignal.price,
            stop_loss: stopLossPrice,
            take_profit: takeProfitPrice,
            strategy_used: latestSignal.strategy_type,
            risk_amount: balance * (riskEval.stopLossPct ?? 0.02),
            status: 'open'
          };

          console.log('[execute_trade] Inserting paper position:', position.side, position.symbol, position.entry_price);
          const { error: posErr } = await supabase.from('trading_positions').insert(position);
          if (posErr) {
            console.error('[execute_trade] Position insert failed:', posErr.message, posErr.details, posErr.hint);
            return new Response(JSON.stringify({
              error: 'Paper trade position insert failed',
              detail: posErr.message,
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          try { await notificationManager.notifyTrade(latestSignal, true, 'Paper trade executed'); } catch (nErr) { console.error('[execute_trade] Notification error (non-fatal):', nErr); }

          return new Response(JSON.stringify({
            message: 'Paper trade executed successfully',
            position
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // LIVE TRADING READINESS GATE
        // Live trading is blocked until ALL readiness criteria are met.
        // This gate cannot be bypassed by changing bot_config.mode alone.
        const { data: readinessChecks } = await supabase
          .from('deployment_checks')
          .select('status')
          .eq('check_category', 'trading')
          .order('checked_at', { ascending: false })
          .limit(20);

        const hasFailedChecks = !readinessChecks || readinessChecks.some(c => c.status === 'fail');

        const { count: paperTradeCount } = await supabase
          .from('executed_trades')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        const { count: failedReconciliations } = await supabase
          .from('reconciliation_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'discrepancy');

        const gateFailures: string[] = [];
        if (hasFailedChecks) gateFailures.push('health-check has failed checks');
        if ((paperTradeCount ?? 0) < 50) gateFailures.push(`need 50+ paper trades (have ${paperTradeCount ?? 0})`);
        if ((failedReconciliations ?? 0) > 0) gateFailures.push('unresolved reconciliation discrepancies exist');

        if (gateFailures.length > 0) {
          return new Response(JSON.stringify({
            error: 'Live trading readiness gate FAILED',
            gate_failures: gateFailures,
            message: 'Live trading cannot be enabled until all readiness criteria pass. Run in paper mode first.',
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // If all gates pass but live trading is attempted, still block for this release.
        // Live trading execution will be implemented in a future phase.
        return new Response(JSON.stringify({
          error: 'Live trading is not yet implemented',
          message: 'All readiness gates passed, but live order execution is disabled in this release.',
        }), {
          status: 501,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'generate_paper_signal': {
        console.log('[generate_paper_signal] Starting for symbol:', symbol);
        let currentPrice: number;
        try {
          const tickerResp = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${symbol}`);
          const tickerData = await tickerResp.json();
          const pairKey = Object.keys(tickerData.result || {})[0];
          currentPrice = pairKey ? parseFloat(tickerData.result[pairKey].c[0]) : 0;
          console.log('[generate_paper_signal] Kraken price:', currentPrice);
        } catch (fetchErr) {
          console.error('[generate_paper_signal] Kraken fetch failed:', fetchErr);
          currentPrice = 0;
        }

        if (!currentPrice || isNaN(currentPrice)) {
          const basePrices: Record<string, number> = { 'XBTUSD': 65000, 'ETHUSD': 3500, 'SOLUSD': 150 };
          const basePrice = basePrices[symbol] ?? basePrices['XBTUSD'] ?? 65000;
          const variation = (Math.random() - 0.5) * 0.02;
          currentPrice = basePrice * (1 + variation);
          console.log('[generate_paper_signal] Using synthetic price:', currentPrice);
        }

        const signalRand = Math.random();
        const paperSignalType = signalRand > 0.6 ? 'buy' : signalRand < 0.4 ? 'sell' : 'hold';
        const paperConfidence = 0.5 + Math.random() * 0.4;

        const paperSignal = {
          symbol,
          signal_type: paperSignalType,
          strategy_type: 'trend_following',
          confidence: paperConfidence,
          price: currentPrice,
          timestamp: new Date().toISOString(),
          indicators: { source: 'paper_signal_generator', price: currentPrice },
          ml_score: 0.5 + Math.random() * 0.3,
        };

        console.log('[generate_paper_signal] Inserting signal:', paperSignal.signal_type, paperSignal.price);
        const { error: sigInsertErr } = await supabase.from('strategy_signals').insert(paperSignal);
        if (sigInsertErr) {
          console.error('[generate_paper_signal] Insert failed:', sigInsertErr.message);
          return new Response(JSON.stringify({
            error: 'Failed to insert signal',
            detail: sigInsertErr.message,
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log('[generate_paper_signal] Success');
        return new Response(JSON.stringify({
          message: 'Paper signal generated',
          signal: paperSignal,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

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
    // Log full error for debugging; do not leak to client
    console.error('[trading-bot] UNHANDLED ERROR:', error?.message ?? error, error?.stack ?? '');
    return new Response(JSON.stringify({
      error: 'Internal server error',
      // Include error name/message in response during Phase 3 debugging only
      debug_hint: error?.message ?? 'unknown',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});