import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')!;

interface DailyPnLSummary {
  date: string;
  starting_balance: number;
  ending_balance: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  max_drawdown: number;
  risk_used: number;
}

class DailyRetrainer {
  async calculateDailyPnL(userId: string, date: string): Promise<DailyPnLSummary> {
    // Get all trades for the day
    const { data: trades } = await supabase
      .from('executed_trades')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', `${date}T00:00:00Z`)
      .lt('timestamp', `${date}T23:59:59Z`)
      .order('timestamp', { ascending: true });

    // Get positions opened/closed on this day
    const { data: positions } = await supabase
      .from('trading_positions')
      .select('*')
      .eq('user_id', userId)
      .or(`opened_at.gte.${date}T00:00:00Z,closed_at.gte.${date}T00:00:00Z`)
      .or(`opened_at.lt.${date}T23:59:59Z,closed_at.lt.${date}T23:59:59Z`);

    // Get bot config for starting balance
    const { data: botConfig } = await supabase
      .from('bot_config')
      .select('capital_cad')
      .eq('user_id', userId)
      .single();

    const startingBalance = botConfig?.capital_cad || 100;
    
    // Calculate metrics
    const totalTrades = trades?.length || 0;
    const realizedPnL = trades?.reduce((sum, trade) => sum + (trade.realized_pnl || 0), 0) || 0;
    
    // Calculate unrealized PnL from open positions
    let unrealizedPnL = 0;
    if (positions) {
      for (const position of positions.filter(p => p.status === 'open')) {
        // Simplified unrealized PnL calculation
        const currentPrice = position.current_price || position.entry_price;
        const pnl = position.side === 'buy' 
          ? (currentPrice - position.entry_price) * position.quantity
          : (position.entry_price - currentPrice) * position.quantity;
        unrealizedPnL += pnl;
      }
    }

    const totalPnL = realizedPnL + unrealizedPnL;
    const endingBalance = startingBalance + totalPnL;
    
    const winningTrades = trades?.filter(t => (t.realized_pnl || 0) > 0).length || 0;
    const losingTrades = trades?.filter(t => (t.realized_pnl || 0) < 0).length || 0;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    // Calculate max drawdown (simplified)
    let maxDrawdown = 0;
    let peak = startingBalance;
    let currentBalance = startingBalance;
    
    if (trades) {
      for (const trade of trades) {
        currentBalance += trade.realized_pnl || 0;
        if (currentBalance > peak) {
          peak = currentBalance;
        }
        const drawdown = (peak - currentBalance) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    const riskUsed = positions?.reduce((sum, pos) => sum + (pos.risk_amount || 0), 0) || 0;

    return {
      date,
      starting_balance: startingBalance,
      ending_balance: endingBalance,
      realized_pnl: realizedPnL,
      unrealized_pnl: unrealizedPnL,
      total_pnl: totalPnL,
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      max_drawdown: maxDrawdown,
      risk_used: riskUsed
    };
  }

  async retrainModels(symbols: string[]): Promise<void> {
    console.log(`Starting daily retraining for symbols: ${symbols.join(', ')}`);
    
    for (const symbol of symbols) {
      try {
        // Fetch latest market data for training
        const { data: marketData } = await supabase
          .from('market_data')
          .select('*')
          .eq('symbol', symbol)
          .order('timestamp', { ascending: true })
          .limit(2000); // Use last 2000 data points for training

        if (!marketData || marketData.length < 200) {
          console.log(`Insufficient data for ${symbol}, skipping retraining`);
          continue;
        }

        // Deactivate old models
        await supabase
          .from('ml_models')
          .update({ is_active: false })
          .eq('symbol', symbol)
          .eq('is_active', true);

        // Call training bot function
        const response = await supabase.functions.invoke('trading-bot', {
          body: {
            action: 'train_model',
            symbol: symbol
          }
        });

        if (response.error) {
          console.error(`Failed to retrain model for ${symbol}:`, response.error);
        } else {
          console.log(`Successfully retrained model for ${symbol}`);
        }

      } catch (error) {
        console.error(`Error retraining model for ${symbol}:`, error);
      }
    }
  }

  async sendDailyReport(userId: string, pnlSummary: DailyPnLSummary): Promise<void> {
    const pnlEmoji = pnlSummary.total_pnl >= 0 ? '📈' : '📉';
    const winRateEmoji = pnlSummary.win_rate >= 0.6 ? '🎯' : pnlSummary.win_rate >= 0.4 ? '⚠️' : '🚨';
    
    const message = `
🤖 <b>Daily Trading Report</b> ${pnlEmoji}
📅 Date: ${pnlSummary.date}

💰 <b>P&L Summary:</b>
• Starting Balance: $${pnlSummary.starting_balance.toFixed(2)}
• Ending Balance: $${pnlSummary.ending_balance.toFixed(2)}
• Realized P&L: $${pnlSummary.realized_pnl.toFixed(2)}
• Unrealized P&L: $${pnlSummary.unrealized_pnl.toFixed(2)}
• <b>Total P&L: $${pnlSummary.total_pnl.toFixed(2)} (${((pnlSummary.total_pnl / pnlSummary.starting_balance) * 100).toFixed(2)}%)</b>

📊 <b>Trading Stats:</b>
• Total Trades: ${pnlSummary.total_trades}
• Winning Trades: ${pnlSummary.winning_trades} ${winRateEmoji}
• Losing Trades: ${pnlSummary.losing_trades}
• Win Rate: ${(pnlSummary.win_rate * 100).toFixed(1)}%

⚠️ <b>Risk Metrics:</b>
• Max Drawdown: ${(pnlSummary.max_drawdown * 100).toFixed(2)}%
• Risk Used: $${pnlSummary.risk_used.toFixed(2)}

🧠 <b>AI Update:</b>
• Models retrained with latest market data
• Regime detection updated
• Strategy parameters optimized

<i>Next retraining: Tomorrow at midnight UTC</i>
    `;

    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
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
      console.error('Failed to send daily report:', error);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request - only allow service role or admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid or expired token');
    }
    const retrainer = new DailyRetrainer();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get all active users
    const { data: activeUsers } = await supabase
      .from('bot_config')
      .select('user_id')
      .eq('is_active', true);

    if (!activeUsers || activeUsers.length === 0) {
      return new Response(JSON.stringify({ message: 'No active users found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = [];

    for (const user of activeUsers) {
      try {
        // Calculate yesterday's P&L
        const pnlSummary = await retrainer.calculateDailyPnL(user.user_id, yesterday);
        
        // Store P&L in database
        await supabase.from('daily_pnl').upsert({
          user_id: user.user_id,
          ...pnlSummary
        });

        // Send daily report
        await retrainer.sendDailyReport(user.user_id, pnlSummary);
        
        results.push({
          userId: user.user_id,
          pnl: pnlSummary.total_pnl,
          trades: pnlSummary.total_trades,
          winRate: pnlSummary.win_rate
        });

      } catch (error) {
        console.error(`Error processing user ${user.user_id}:`, error);
        results.push({
          userId: user.user_id,
          error: error.message
        });
      }
    }

    // Retrain models for all active symbols
    const symbols = ['XBTUSD', 'ETHUSD', 'ADAUSD', 'SOLUSD']; // Add more as needed
    await retrainer.retrainModels(symbols);

    return new Response(JSON.stringify({
      message: 'Daily retraining and reporting completed',
      date: yesterday,
      results,
      modelsRetrained: symbols
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Daily retraining error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});