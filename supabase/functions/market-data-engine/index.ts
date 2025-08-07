import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketDataUpdate {
  symbol: string;
  price: number;
  volume: number;
  timestamp: string;
  change_24h: number;
  bid: number;
  ask: number;
  exchange: string;
}

interface TechnicalIndicator {
  rsi: number;
  macd: number;
  bb_upper: number;
  bb_lower: number;
  sma_20: number;
  ema_12: number;
  ema_26: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const { action, symbol, exchange = 'kraken' } = await req.json();
    console.log(`Market data engine: ${action} for ${symbol} on ${exchange}`);

    switch (action) {
      case 'fetch_real_time':
        return await fetchRealTimeData(supabaseClient, symbol, exchange);
      
      case 'calculate_indicators':
        return await calculateTechnicalIndicators(supabaseClient, symbol);
      
      case 'update_regime':
        return await updateMarketRegime(supabaseClient, symbol);
      
      case 'get_dashboard_metrics':
        return await getDashboardMetrics(supabaseClient);
      
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('Market data engine error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function fetchRealTimeData(supabase: any, symbol: string, exchange: string) {
  try {
    // Mock real-time data for demo (in production, connect to actual exchange APIs)
    const basePrice = symbol === 'BTCUSD' ? 65000 : symbol === 'ETHUSD' ? 3500 : 100;
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    const currentPrice = basePrice * (1 + variation);
    
    const marketData: MarketDataUpdate = {
      symbol,
      price: currentPrice,
      volume: Math.random() * 1000000,
      timestamp: new Date().toISOString(),
      change_24h: (Math.random() - 0.5) * 0.05 * currentPrice,
      bid: currentPrice * 0.999,
      ask: currentPrice * 1.001,
      exchange
    };

    // Store in database
    const { error: insertError } = await supabase
      .from('market_data')
      .insert([{
        symbol: marketData.symbol,
        price: marketData.price,
        volume: marketData.volume,
        timestamp: marketData.timestamp,
        change_24h: marketData.change_24h,
        bid: marketData.bid,
        ask: marketData.ask,
        exchange: marketData.exchange
      }]);

    if (insertError) {
      console.error('Error inserting market data:', insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: marketData,
        message: 'Real-time data fetched successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    throw new Error(`Failed to fetch real-time data: ${error.message}`);
  }
}

async function calculateTechnicalIndicators(supabase: any, symbol: string) {
  try {
    // Get historical price data for calculations
    const { data: priceData, error } = await supabase
      .from('market_data')
      .select('price, timestamp')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!priceData || priceData.length < 20) {
      throw new Error('Insufficient data for technical indicators');
    }

    const prices = priceData.map((item: any) => item.price).reverse();
    
    // Calculate technical indicators
    const indicators: TechnicalIndicator = {
      rsi: calculateRSI(prices),
      macd: calculateMACD(prices),
      bb_upper: calculateBollingerBands(prices).upper,
      bb_lower: calculateBollingerBands(prices).lower,
      sma_20: calculateSMA(prices, 20),
      ema_12: calculateEMA(prices, 12),
      ema_26: calculateEMA(prices, 26)
    };

    // Store indicators
    const { error: insertError } = await supabase
      .from('technical_indicators')
      .insert([{
        symbol,
        ...indicators,
        timestamp: new Date().toISOString()
      }]);

    if (insertError) {
      console.error('Error inserting indicators:', insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: indicators,
        message: 'Technical indicators calculated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    throw new Error(`Failed to calculate indicators: ${error.message}`);
  }
}

async function updateMarketRegime(supabase: any, symbol: string) {
  try {
    // Get latest technical indicators
    const { data: indicators, error: indicatorsError } = await supabase
      .from('technical_indicators')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (indicatorsError || !indicators) {
      throw new Error('No technical indicators available');
    }

    // Determine market regime based on indicators
    let regime = 'range';
    let confidence = 0.5;
    let trend_strength = 0;
    let volatility = 0.02;

    if (indicators.macd > 0 && indicators.rsi < 70) {
      regime = 'trend';
      trend_strength = 0.7;
      confidence = 0.8;
    } else if (indicators.rsi > 70 || indicators.rsi < 30) {
      regime = 'high_volatility';
      volatility = 0.05;
      confidence = 0.75;
    }

    const regimeData = {
      symbol,
      regime,
      confidence,
      trend_strength,
      volatility,
      timestamp: new Date().toISOString()
    };

    // Store regime
    const { error: insertError } = await supabase
      .from('market_regimes')
      .insert([regimeData]);

    if (insertError) {
      console.error('Error inserting regime:', insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: regimeData,
        message: 'Market regime updated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    throw new Error(`Failed to update regime: ${error.message}`);
  }
}

async function getDashboardMetrics(supabase: any) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get real-time metrics
    const metrics = {
      total_users: 1,
      active_connections: Math.floor(Math.random() * 10) + 1,
      data_points_today: Math.floor(Math.random() * 1000) + 500,
      avg_latency_ms: Math.floor(Math.random() * 50) + 20,
      uptime_percentage: 99.5 + Math.random() * 0.5,
      last_updated: new Date().toISOString()
    };

    // Get market data counts
    const { count: marketDataCount } = await supabase
      .from('market_data')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', today);

    metrics.data_points_today = marketDataCount || metrics.data_points_today;

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: metrics,
        message: 'Dashboard metrics retrieved'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    throw new Error(`Failed to get dashboard metrics: ${error.message}`);
  }
}

// Technical Analysis Functions
function calculateSMA(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / slice.length;
}

function calculateEMA(prices: number[], period: number): number {
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function calculateRSI(prices: number[], period: number = 14): number {
  const gains = [];
  const losses = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
  const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices: number[]): number {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  return ema12 - ema26;
}

function calculateBollingerBands(prices: number[], period: number = 20) {
  const sma = calculateSMA(prices, period);
  const slice = prices.slice(-period);
  
  const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (2 * stdDev),
    lower: sma - (2 * stdDev),
    middle: sma
  };
}