import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AutonomousSettings {
  enabled: boolean;
  aggressiveness: number;
  riskTolerance: number;
  tradingHours: { start: string; end: string; };
  maxPositionsPerDay: number;
  maxDrawdownPercent: number;
  marketRegimeAdaptation: boolean;
  emergencyStopEnabled: boolean;
}

interface MarketAnalysis {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  volatility: number;
  trend: 'up' | 'down' | 'sideways';
  regime: 'trend' | 'range' | 'high_volatility';
  signals: Array<{
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    strength: number;
    reasoning: string;
  }>;
}

interface RiskAssessment {
  currentDrawdown: number;
  portfolioRisk: number;
  positionSizing: number;
  stopLossLevels: Record<string, number>;
  riskScore: number; // 0-100
  maxPositions: number;
  emergencyStop: boolean;
}

interface TradingDecision {
  action: 'buy' | 'sell' | 'hold' | 'rebalance' | 'emergency_stop';
  symbol?: string;
  quantity?: number;
  price?: number;
  reasoning: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  stopLoss?: number;
  takeProfit?: number;
}

class AutonomousAgent {
  private settings: AutonomousSettings;
  private userId: string;

  constructor(settings: AutonomousSettings, userId: string) {
    this.settings = settings;
    this.userId = userId;
  }

  async analyzeMarkets(): Promise<MarketAnalysis> {
    console.log('Analyzing markets for autonomous decisions...');

    // Get latest market data for multiple symbols
    const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD'];
    const marketSignals = [];

    for (const symbol of symbols) {
      // Get recent market data
      const { data: marketData } = await supabase
        .from('market_data')
        .select('*')
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (marketData && marketData.length > 10) {
        // Calculate technical indicators
        const prices = marketData.map(d => d.close);
        const volumes = marketData.map(d => d.volume);
        
        // Simple momentum calculation
        const momentum = (prices[0] - prices[9]) / prices[9];
        const volatility = this.calculateVolatility(prices.slice(0, 20));
        const volumeAvg = volumes.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        const volumeCurrent = volumes[0];
        
        // Simple sentiment calculation
        let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        let strength = 50;
        
        if (momentum > 0.02 && volumeCurrent > volumeAvg * 1.2) {
          sentiment = 'bullish';
          strength = Math.min(85, 60 + (momentum * 1000));
        } else if (momentum < -0.02 && volumeCurrent > volumeAvg * 1.2) {
          sentiment = 'bearish';
          strength = Math.min(85, 60 + (Math.abs(momentum) * 1000));
        }

        marketSignals.push({
          symbol,
          action: sentiment === 'bullish' ? 'buy' : sentiment === 'bearish' ? 'sell' : 'hold',
          strength,
          reasoning: `Momentum: ${(momentum * 100).toFixed(2)}%, Vol: ${volumeCurrent > volumeAvg ? 'High' : 'Normal'}`
        });
      }
    }

    // Get market regime
    const { data: latestRegime } = await supabase
      .from('market_regimes')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    // Overall market sentiment
    const bullishSignals = marketSignals.filter(s => s.action === 'buy').length;
    const bearishSignals = marketSignals.filter(s => s.action === 'sell').length;
    
    let overallSentiment: 'bullish' | 'bearish' | 'neutral';
    if (bullishSignals > bearishSignals) {
      overallSentiment = 'bullish';
    } else if (bearishSignals > bullishSignals) {
      overallSentiment = 'bearish';
    } else {
      overallSentiment = 'neutral';
    }

    const avgStrength = marketSignals.reduce((sum, s) => sum + s.strength, 0) / marketSignals.length;

    return {
      sentiment: overallSentiment,
      confidence: avgStrength / 100,
      volatility: 0.25, // Placeholder
      trend: overallSentiment === 'neutral' ? 'sideways' : overallSentiment === 'bullish' ? 'up' : 'down',
      regime: latestRegime?.regime || 'range',
      signals: marketSignals
    };
  }

  async assessRisk(): Promise<RiskAssessment> {
    console.log('Assessing risk for autonomous trading...');

    // Get current positions
    const { data: positions } = await supabase
      .from('trading_positions')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'open');

    // Get bot config for balance
    const { data: botConfig } = await supabase
      .from('bot_config')
      .select('*')
      .eq('user_id', this.userId)
      .single();

    const balance = botConfig?.capital_cad || 10000;
    const openPositions = positions?.length || 0;

    // Calculate current portfolio risk
    const totalRiskAmount = positions?.reduce((sum, pos) => sum + (pos.risk_amount || 0), 0) || 0;
    const portfolioRisk = (totalRiskAmount / balance) * 100;

    // Get today's P&L for drawdown calculation
    const today = new Date().toISOString().split('T')[0];
    const { data: todayPnL } = await supabase
      .from('daily_pnl')
      .select('*')
      .eq('user_id', this.userId)
      .eq('date', today)
      .single();

    const currentDrawdown = todayPnL ? Math.abs(Math.min(0, todayPnL.total_pnl / balance * 100)) : 0;

    // Calculate risk score
    let riskScore = 0;
    riskScore += Math.min(40, portfolioRisk * 2); // Portfolio risk weight
    riskScore += Math.min(30, currentDrawdown * 3); // Drawdown weight
    riskScore += Math.min(20, (openPositions / this.settings.maxPositionsPerDay) * 20); // Position count weight
    riskScore += Math.min(10, this.settings.aggressiveness / 10); // Aggressiveness weight

    // Emergency stop conditions
    const emergencyStop = this.settings.emergencyStopEnabled && (
      currentDrawdown >= this.settings.maxDrawdownPercent ||
      portfolioRisk >= 80 ||
      openPositions >= this.settings.maxPositionsPerDay
    );

    // Calculate position sizing based on risk tolerance
    const basePositionSize = (this.settings.riskTolerance / 100) * 0.02; // Max 2% risk per trade
    const adjustedPositionSize = basePositionSize * (1 - currentDrawdown / 100);

    return {
      currentDrawdown,
      portfolioRisk,
      positionSizing: adjustedPositionSize,
      stopLossLevels: {
        'BTCUSD': 0.02,
        'ETHUSD': 0.025,
        'ADAUSD': 0.03
      },
      riskScore,
      maxPositions: this.settings.maxPositionsPerDay,
      emergencyStop
    };
  }

  async makeDecision(marketAnalysis: MarketAnalysis, riskAssessment: RiskAssessment): Promise<TradingDecision> {
    console.log('Making autonomous trading decision...');

    // Check emergency stop
    if (riskAssessment.emergencyStop) {
      return {
        action: 'emergency_stop',
        reasoning: `Emergency stop triggered: Drawdown ${riskAssessment.currentDrawdown.toFixed(2)}% or risk ${riskAssessment.riskScore}%`,
        confidence: 1.0,
        riskLevel: 'high'
      };
    }

    // Check trading hours
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const withinTradingHours = currentTime >= this.settings.tradingHours.start && 
                               currentTime <= this.settings.tradingHours.end;

    if (!withinTradingHours) {
      return {
        action: 'hold',
        reasoning: `Outside trading hours (${this.settings.tradingHours.start}-${this.settings.tradingHours.end})`,
        confidence: 1.0,
        riskLevel: 'low'
      };
    }

    // Find best signal
    const actionableSignals = marketAnalysis.signals.filter(s => 
      s.action !== 'hold' && 
      s.strength > (60 - this.settings.aggressiveness / 2)
    );

    if (actionableSignals.length === 0) {
      return {
        action: 'hold',
        reasoning: 'No strong signals detected above threshold',
        confidence: 0.5,
        riskLevel: 'low'
      };
    }

    // Select best signal based on strength and market regime adaptation
    let bestSignal = actionableSignals.reduce((best, current) => 
      current.strength > best.strength ? current : best
    );

    // Adjust for market regime if enabled
    if (this.settings.marketRegimeAdaptation) {
      if (marketAnalysis.regime === 'high_volatility' && this.settings.riskTolerance < 50) {
        return {
          action: 'hold',
          reasoning: 'High volatility regime - risk tolerance too low',
          confidence: 0.8,
          riskLevel: 'high'
        };
      }
    }

    // Calculate position size
    const positionSize = riskAssessment.positionSizing * (bestSignal.strength / 100);
    
    // Calculate stop loss and take profit
    const stopLoss = riskAssessment.stopLossLevels[bestSignal.symbol] || 0.02;
    const takeProfitRatio = 1.5; // 1.5x risk-reward ratio
    
    return {
      action: bestSignal.action as 'buy' | 'sell',
      symbol: bestSignal.symbol,
      quantity: positionSize,
      reasoning: `${bestSignal.reasoning}. Market: ${marketAnalysis.sentiment}, Risk: ${riskAssessment.riskScore.toFixed(0)}%`,
      confidence: (bestSignal.strength + marketAnalysis.confidence * 100) / 200,
      riskLevel: riskAssessment.riskScore > 60 ? 'high' : riskAssessment.riskScore > 30 ? 'medium' : 'low',
      stopLoss,
      takeProfit: stopLoss * takeProfitRatio
    };
  }

  async executeAction(decision: TradingDecision): Promise<any> {
    console.log('Executing autonomous trading action:', decision.action);

    switch (decision.action) {
      case 'emergency_stop':
        // Close all positions and disable bot
        await supabase
          .from('bot_config')
          .update({ is_active: false })
          .eq('user_id', this.userId);

        // Log emergency stop
        await supabase.from('trading_logs').insert({
          user_id: this.userId,
          level: 'ERROR',
          category: 'EMERGENCY_STOP',
          message: decision.reasoning,
          metadata: { decision }
        });

        return { success: true, action: 'emergency_stop' };

      case 'buy':
      case 'sell':
        if (!decision.symbol || !decision.quantity) {
          throw new Error('Invalid trade parameters');
        }

        // Get current price
        const { data: latestPrice } = await supabase
          .from('market_data')
          .select('close')
          .eq('symbol', decision.symbol)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        const price = latestPrice?.close || 0;

        // Create position
        const position = {
          user_id: this.userId,
          symbol: decision.symbol,
          side: decision.action,
          quantity: decision.quantity,
          entry_price: price,
          stop_loss: decision.action === 'buy' ? 
            price * (1 - decision.stopLoss!) : 
            price * (1 + decision.stopLoss!),
          take_profit: decision.action === 'buy' ? 
            price * (1 + decision.takeProfit!) : 
            price * (1 - decision.takeProfit!),
          risk_amount: price * decision.quantity * decision.stopLoss!,
          strategy_used: 'autonomous_agent',
          status: 'open'
        };

        await supabase.from('trading_positions').insert(position);

        // Log trade
        await supabase.from('trading_logs').insert({
          user_id: this.userId,
          level: 'INFO',
          category: 'AUTONOMOUS_TRADE',
          message: `Autonomous ${decision.action} order: ${decision.quantity} ${decision.symbol} at ${price}`,
          metadata: { decision, position }
        });

        return { success: true, action: decision.action, position };

      case 'hold':
        // Log hold decision
        await supabase.from('trading_logs').insert({
          user_id: this.userId,
          level: 'INFO',
          category: 'AUTONOMOUS_HOLD',
          message: decision.reasoning,
          metadata: { decision }
        });

        return { success: true, action: 'hold' };

      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  private calculateVolatility(prices: number[]): number {
    const returns = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const requestBody = await req.json();
    const { action, user_id: requestedUserId, settings, market_analysis, risk_assessment, decision } = requestBody;

    // Reject any attempt to act on behalf of a different user
    if (requestedUserId && requestedUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied: user_id in payload does not match authenticated user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Always use the authenticated user ID — never trust the request body
    const user_id = user.id;
    console.log(`Autonomous agent action: ${action} for authenticated user: ${user_id}`);

    const agent = new AutonomousAgent(settings, user_id);

    switch (action) {
      case 'initialize':
        // Initialize autonomous agent
        await supabase.from('trading_logs').insert({
          user_id,
          level: 'INFO',
          category: 'AUTONOMOUS_INIT',
          message: 'Autonomous agent initialized',
          metadata: { settings }
        });

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Autonomous agent initialized' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'analyze_markets':
        const marketAnalysis = await agent.analyzeMarkets();
        return new Response(JSON.stringify(marketAnalysis), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'assess_risk':
        const riskAssessment = await agent.assessRisk();
        return new Response(JSON.stringify(riskAssessment), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'make_decision':
        const tradingDecision = await agent.makeDecision(market_analysis, risk_assessment);
        return new Response(JSON.stringify(tradingDecision), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'execute_action':
        const result = await agent.executeAction(decision);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Autonomous agent error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});