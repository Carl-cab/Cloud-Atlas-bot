import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyRateLimit, rateLimitConfigs } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PositionSizingInput {
  symbol: string;
  capital: number;
  risk_per_trade: number;
  method: string;
  win_rate?: number;
  avg_win?: number;
  avg_loss?: number;
  volatility?: number;
  correlation?: number;
}

interface RiskMonitoringData {
  user_id: string;
  current_positions: any[];
  daily_pnl: number;
  portfolio_value: number;
  volatility: number;
}

class RiskManagementEngine {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
  }

  // Kelly Criterion position sizing
  calculateKellyPositionSize(inputs: PositionSizingInput) {
    const { capital, win_rate = 0.6, avg_win = 1.5, avg_loss = 1.0 } = inputs;
    
    // Kelly formula: f = (bp - q) / b
    // where b = odds received on the wager, p = probability of winning, q = probability of losing
    const b = avg_win / avg_loss;
    const p = win_rate;
    const q = 1 - win_rate;
    
    const kelly_fraction = (b * p - q) / b;
    
    // Apply Kelly fraction with safety factor (typically 25-50% of full Kelly)
    const safety_factor = 0.25;
    const position_fraction = Math.max(0, Math.min(kelly_fraction * safety_factor, 0.1)); // Cap at 10%
    
    const recommended_size = (capital * position_fraction * inputs.risk_per_trade);
    const max_size = capital * 0.1; // Hard cap at 10% of capital
    
    return {
      recommended_size: Math.min(recommended_size, max_size),
      max_size,
      kelly_fraction,
      risk_score: this.calculateRiskScore(position_fraction, inputs),
      confidence_level: 0.95
    };
  }

  // Fixed percentage position sizing
  calculateFixedPercentageSize(inputs: PositionSizingInput) {
    const { capital, risk_per_trade } = inputs;
    
    const recommended_size = capital * risk_per_trade;
    const max_size = capital * 0.15; // 15% max for fixed percentage
    
    return {
      recommended_size: Math.min(recommended_size, max_size),
      max_size,
      risk_score: this.calculateRiskScore(risk_per_trade, inputs),
      confidence_level: 0.85
    };
  }

  // Volatility-adjusted position sizing
  calculateVolatilityAdjustedSize(inputs: PositionSizingInput) {
    const { capital, risk_per_trade, volatility = 0.02 } = inputs;
    
    // Adjust position size based on volatility
    const volatility_adjustment = Math.max(0.5, Math.min(2.0, 1 / (volatility * 50)));
    const adjusted_risk = risk_per_trade * volatility_adjustment;
    
    const recommended_size = capital * adjusted_risk;
    const max_size = capital * 0.12;
    
    return {
      recommended_size: Math.min(recommended_size, max_size),
      max_size,
      volatility_adjustment,
      risk_score: this.calculateRiskScore(adjusted_risk, inputs),
      confidence_level: 0.88
    };
  }

  // Risk parity position sizing
  calculateRiskParitySize(inputs: PositionSizingInput) {
    const { capital, risk_per_trade, volatility = 0.02 } = inputs;
    
    // Equal risk contribution across positions
    const target_risk_contribution = 0.05; // 5% risk contribution
    const position_size = (capital * target_risk_contribution) / volatility;
    
    const recommended_size = Math.min(position_size, capital * risk_per_trade);
    const max_size = capital * 0.08;
    
    return {
      recommended_size: Math.min(recommended_size, max_size),
      max_size,
      target_risk_contribution,
      risk_score: this.calculateRiskScore(target_risk_contribution, inputs),
      confidence_level: 0.92
    };
  }

  // Calculate risk score for position
  calculateRiskScore(position_fraction: number, inputs: PositionSizingInput): number {
    let risk_score = 0.5; // Base risk score
    
    // Adjust for position size
    risk_score += position_fraction * 2; // Larger positions = higher risk
    
    // Adjust for volatility
    if (inputs.volatility) {
      risk_score += inputs.volatility * 10;
    }
    
    // Adjust for win rate (if available)
    if (inputs.win_rate) {
      risk_score -= (inputs.win_rate - 0.5) * 0.5; // Higher win rate = lower risk
    }
    
    // Normalize between 0 and 1
    return Math.max(0.1, Math.min(0.9, risk_score));
  }

  // Main position sizing calculator
  async calculatePositionSize(inputs: PositionSizingInput) {
    let result;
    
    switch (inputs.method) {
      case 'kelly':
        result = this.calculateKellyPositionSize(inputs);
        break;
      case 'fixed_percentage':
        result = this.calculateFixedPercentageSize(inputs);
        break;
      case 'volatility_adjusted':
        result = this.calculateVolatilityAdjustedSize(inputs);
        break;
      case 'risk_parity':
        result = this.calculateRiskParitySize(inputs);
        break;
      default:
        result = this.calculateFixedPercentageSize(inputs);
    }

    // Store calculation in database
    await this.storePositionSizing({
      symbol: inputs.symbol,
      calculation_method: inputs.method,
      inputs: inputs,
      ...result
    });

    return result;
  }

  // Store position sizing calculation
  async storePositionSizing(calculation: any) {
    try {
      const { error } = await this.supabase
        .from('position_sizing_calculations')
        .insert({
          symbol: calculation.symbol,
          calculation_method: calculation.calculation_method,
          inputs: calculation.inputs,
          recommended_size: calculation.recommended_size,
          max_size: calculation.max_size,
          risk_score: calculation.risk_score,
          confidence_level: calculation.confidence_level
        });

      if (error) {
        console.error('Error storing position sizing calculation:', error);
      }
    } catch (error) {
      console.error('Error in storePositionSizing:', error);
    }
  }

  // Monitor risk limits and trigger circuit breakers
  async monitorRiskLimits(data: RiskMonitoringData) {
    const { user_id, current_positions, daily_pnl, portfolio_value, volatility } = data;
    
    // Get user's risk settings
    const { data: riskSettings, error } = await this.supabase
      .from('risk_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error || !riskSettings) {
      console.error('Error fetching risk settings:', error);
      return { circuit_breaker_triggered: false };
    }

    const alerts = [];
    let circuit_breaker_triggered = false;

    // Check daily loss limit
    const daily_loss_percentage = Math.abs(daily_pnl) / portfolio_value;
    if (daily_loss_percentage > riskSettings.circuit_breaker_threshold) {
      circuit_breaker_triggered = true;
      alerts.push({
        type: 'circuit_breaker',
        severity: 'critical',
        message: `Daily loss limit exceeded: ${(daily_loss_percentage * 100).toFixed(2)}%`
      });
    }

    // Check portfolio concentration
    const symbol_exposures = this.calculateSymbolExposures(current_positions, portfolio_value);
    for (const [symbol, exposure] of Object.entries(symbol_exposures)) {
      if (exposure > riskSettings.max_symbol_exposure) {
        alerts.push({
          type: 'concentration_risk',
          severity: 'high',
          message: `High concentration in ${symbol}: ${(exposure * 100).toFixed(1)}%`
        });
      }
    }

    // Check volatility spike
    if (volatility > 0.05) { // 5% volatility threshold
      alerts.push({
        type: 'volatility_spike',
        severity: 'medium',
        message: `High volatility detected: ${(volatility * 100).toFixed(2)}%`
      });
    }

    // Log risk events
    for (const alert of alerts) {
      await this.logRiskEvent(user_id, alert);
    }

    // SECURITY FIX (Finding 4): Persist circuit-breaker halt to bot_config if triggered.
    // Previously this returned circuit_breaker_triggered=true without stopping trading.
    if (circuit_breaker_triggered) {
      await this.triggerCircuitBreaker(
        user_id,
        `Daily loss limit exceeded: ${(daily_loss_percentage * 100).toFixed(2)}%`
      );
    }

    // Update risk monitoring
    await this.updateRiskMonitoring(user_id, {
      daily_loss: daily_loss_percentage,
      portfolio_risk: this.calculatePortfolioRisk(current_positions),
      symbol_exposures
    });

    return {
      circuit_breaker_triggered,
      alerts,
      risk_score: this.calculateOverallRiskScore(daily_loss_percentage, symbol_exposures, volatility)
    };
  }

  // Calculate symbol exposures
  calculateSymbolExposures(positions: any[], portfolio_value: number): Record<string, number> {
    const exposures: Record<string, number> = {};
    
    for (const position of positions) {
      const exposure = Math.abs(position.quantity * position.current_price) / portfolio_value;
      exposures[position.symbol] = (exposures[position.symbol] || 0) + exposure;
    }
    
    return exposures;
  }

  // Calculate overall portfolio risk
  calculatePortfolioRisk(positions: any[]): number {
    if (positions.length === 0) return 0;
    
    // Simplified portfolio risk calculation
    const individual_risks = positions.map(pos => pos.risk_amount || 0);
    const total_risk = individual_risks.reduce((sum, risk) => sum + risk, 0);
    
    // Assume some diversification benefit
    const diversification_factor = Math.min(1, positions.length / 10);
    
    return total_risk * (1 - diversification_factor * 0.2);
  }

  // Calculate overall risk score
  calculateOverallRiskScore(daily_loss: number, exposures: Record<string, number>, volatility: number): number {
    let score = 0.5;
    
    // Daily loss component
    score += daily_loss * 2;
    
    // Concentration component
    const max_exposure = Math.max(...Object.values(exposures));
    score += max_exposure;
    
    // Volatility component
    score += volatility * 5;
    
    return Math.max(0.1, Math.min(0.9, score));
  }

  // Log risk events
  async logRiskEvent(user_id: string, alert: any) {
    try {
      const { error } = await this.supabase
        .from('risk_events')
        .insert({
          user_id,
          event_type: alert.type,
          severity: alert.severity,
          description: alert.message,
          triggered_by: { automatic: true, timestamp: new Date().toISOString() },
          actions_taken: alert.type === 'circuit_breaker' ? ['halt_trading', 'notify_user'] : ['notify_user']
        });

      if (error) {
        console.error('Error logging risk event:', error);
      }
    } catch (error) {
      console.error('Error in logRiskEvent:', error);
    }
  }

  // Update risk monitoring table
  async updateRiskMonitoring(user_id: string, metrics: any) {
    try {
      const monitoring_data = [
        {
          user_id,
          limit_type: 'daily_loss',
          current_value: metrics.daily_loss,
          limit_value: 0.05, // 5% daily loss limit
          utilization_percentage: (metrics.daily_loss / 0.05) * 100,
          status: metrics.daily_loss > 0.04 ? 'critical' : metrics.daily_loss > 0.03 ? 'warning' : 'normal'
        },
        {
          user_id,
          limit_type: 'portfolio_risk',
          current_value: metrics.portfolio_risk,
          limit_value: 0.1,
          utilization_percentage: (metrics.portfolio_risk / 0.1) * 100,
          status: metrics.portfolio_risk > 0.08 ? 'critical' : metrics.portfolio_risk > 0.06 ? 'warning' : 'normal'
        }
      ];

      for (const data of monitoring_data) {
        await this.supabase
          .from('risk_limits_monitoring')
          .upsert(data, {
            onConflict: 'user_id,limit_type'
          });
      }
    } catch (error) {
      console.error('Error updating risk monitoring:', error);
    }
  }

  // SECURITY FIX (Finding 4): Circuit breaker now durably persists a halt to bot_config.
  // The previous implementation only logged an event and claimed success without
  // actually pausing trading. This fix writes is_paused=true to bot_config so
  // that subsequent order attempts are blocked at the kill-switch check.
  async triggerCircuitBreaker(user_id: string, reason: string) {
    const actions_taken: string[] = [];

    // 1. Log the circuit breaker event (best-effort, non-fatal)
    try {
      await this.logRiskEvent(user_id, {
        type: 'circuit_breaker',
        severity: 'critical',
        message: `Circuit breaker triggered: ${reason}`
      });
      actions_taken.push('log_event');
    } catch (logError) {
      console.error('Failed to log circuit breaker event:', logError);
    }

    // 2. DURABLE HALT: Write is_paused=true to bot_config — this is the real stop.
    //    Use the service-role client so RLS does not block the update.
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: pausedRows, error: haltError } = await supabaseService
      .from('bot_config')
      .update({ is_paused: true, paused_reason: `Circuit breaker: ${reason}` })
      .eq('user_id', user_id)
      .select('user_id');

    if (haltError || !pausedRows || pausedRows.length === 0) {
      // If we cannot persist the halt, surface the error rather than falsely claiming success.
      console.error('CRITICAL: Failed to persist circuit-breaker halt to bot_config:', haltError);
      throw new Error(`Circuit breaker halt failed to persist: ${haltError?.message ?? 'no bot_config row updated'}. Trading may still be active.`);
    }
    actions_taken.push('halt_trading');

    // 3. Record the halt in risk_cooldowns for scheduler-driven auto-resume
    const cooldownMs = 60 * 60 * 1000; // 1 hour default
    const resumeAt = new Date(Date.now() + cooldownMs).toISOString();
    const { error: cooldownError } = await supabaseService
      .from('risk_cooldowns')
      .upsert({
        user_id,
        reason: 'CIRCUIT_BREAKER',
        engaged_at: new Date().toISOString(),
        resume_at: resumeAt,
        details: { triggered_by: 'risk-management-engine', reason },
        resolved: false,
      }, { onConflict: 'user_id,reason' });
    if (cooldownError) {
      // Pause is already committed. Throw so the caller knows no cooldown was recorded
      // and the scheduler will not auto-resume — operator intervention required.
      console.error('Failed to write risk_cooldowns row:', cooldownError);
      throw new Error(`Circuit-breaker cooldown failed to persist: ${cooldownError.message}`);
    }
    actions_taken.push('cooldown_scheduled');

    console.log(`Circuit breaker triggered for user ${user_id}: ${reason}. Bot paused until ${resumeAt}.`);

    return {
      success: true,
      message: 'Circuit breaker activated and trading halted',
      resume_at: resumeAt,
      actions_taken,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY FIX (Additional Finding): This function previously had NO authentication.
  // Any unauthenticated caller could trigger circuit breakers for any user_id.
  // JWT verification is now required for all actions.
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Rate limit by verified user_id
  const rateLimitResponse = await applyRateLimit(req, rateLimitConfigs.api, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { action, ...params } = await req.json();

    // Always use the authenticated user_id — never trust user_id from the request body
    if (params.user_id && params.user_id !== user.id) {
      return new Response(JSON.stringify({ success: false, error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    params.user_id = user.id;

    const riskEngine = new RiskManagementEngine();

    switch (action) {
      case 'calculate_position_size': {
        const result = await riskEngine.calculatePositionSize(params as PositionSizingInput);
        
        return new Response(JSON.stringify({
          success: true,
          result: {
            symbol: params.symbol,
            calculation_method: params.method,
            ...result
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'monitor_risk_limits': {
        const result = await riskEngine.monitorRiskLimits(params as RiskMonitoringData);
        
        return new Response(JSON.stringify({
          success: true,
          ...result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'trigger_circuit_breaker': {
        const result = await riskEngine.triggerCircuitBreaker(params.user_id, params.reason);
        
        return new Response(JSON.stringify({
          success: true,
          ...result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Risk Management Engine Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});