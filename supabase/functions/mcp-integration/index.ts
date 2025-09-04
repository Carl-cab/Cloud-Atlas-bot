import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MCPRequest {
  action: 'fetch_external_data' | 'analyze_sentiment' | 'get_economic_calendar' | 'fetch_onchain_data';
  params: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { action, params }: MCPRequest = await req.json();

    console.log(`MCP Integration: Processing ${action}`, params);

    let result: any = {};

    switch (action) {
      case 'fetch_external_data':
        result = await fetchExternalMarketData(params);
        break;
      
      case 'analyze_sentiment':
        result = await analyzeSentiment(params);
        break;
      
      case 'get_economic_calendar':
        result = await getEconomicCalendar(params);
        break;
      
      case 'fetch_onchain_data':
        result = await fetchOnchainData(params);
        break;
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log the operation for monitoring
    await supabase.rpc('log_trading_event', {
      p_user_id: params.user_id || null,
      p_level: 'INFO',
      p_category: 'MCP_INTEGRATION',
      p_message: `Successfully processed ${action}`,
      p_metadata: { action, params: params }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: result,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('MCP Integration error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

async function fetchExternalMarketData(params: any) {
  const { sources = ['binance', 'coinbase'], symbols = ['BTCUSDT', 'ETHUSDT'] } = params;
  
  const results: any = {};
  
  for (const source of sources) {
    try {
      switch (source) {
        case 'binance':
          results[source] = await fetchBinanceData(symbols);
          break;
        case 'coinbase':
          results[source] = await fetchCoinbaseData(symbols);
          break;
        case 'coingecko':
          results[source] = await fetchCoingeckoData(symbols);
          break;
        default:
          console.warn(`Unsupported data source: ${source}`);
      }
    } catch (error) {
      console.error(`Error fetching data from ${source}:`, error);
      results[source] = { error: error.message };
    }
  }
  
  return {
    sources: results,
    symbols,
    fetch_time: new Date().toISOString()
  };
}

async function fetchBinanceData(symbols: string[]) {
  const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Binance API error: ${data.msg || 'Unknown error'}`);
  }
  
  return symbols.map(symbol => {
    const ticker = data.find((t: any) => t.symbol === symbol.replace('/', ''));
    return {
      symbol,
      price: ticker?.lastPrice || null,
      change_24h: ticker?.priceChangePercent || null,
      volume_24h: ticker?.volume || null
    };
  });
}

async function fetchCoinbaseData(symbols: string[]) {
  const results = [];
  
  for (const symbol of symbols) {
    try {
      const formattedSymbol = symbol.replace('USDT', '-USD').replace('/', '-');
      const response = await fetch(`https://api.coinbase.com/v2/exchange-rates?currency=${formattedSymbol.split('-')[0]}`);
      const data = await response.json();
      
      results.push({
        symbol,
        price: data.data?.rates?.USD || null,
        source: 'coinbase'
      });
    } catch (error) {
      console.error(`Error fetching ${symbol} from Coinbase:`, error);
      results.push({ symbol, error: error.message });
    }
  }
  
  return results;
}

async function fetchCoingeckoData(symbols: string[]) {
  try {
    // Map trading symbols to CoinGecko IDs
    const coinIds = symbols.map(symbol => {
      const base = symbol.split(/USDT|USD/)[0].toLowerCase();
      return base === 'btc' ? 'bitcoin' : base === 'eth' ? 'ethereum' : base;
    });
    
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`);
    const data = await response.json();
    
    return symbols.map((symbol, index) => {
      const coinId = coinIds[index];
      const coinData = data[coinId];
      
      return {
        symbol,
        price: coinData?.usd || null,
        change_24h: coinData?.usd_24h_change || null,
        source: 'coingecko'
      };
    });
  } catch (error) {
    throw new Error(`CoinGecko API error: ${error.message}`);
  }
}

async function analyzeSentiment(params: any) {
  const { symbols, timeframe = '1d', sources = ['twitter', 'reddit'] } = params;
  
  // Simulate sentiment analysis (in production, integrate with actual APIs)
  const sentimentData: any = {};
  
  for (const symbol of symbols) {
    sentimentData[symbol] = {
      overall_score: (Math.random() - 0.5) * 2, // -1 to 1
      confidence: Math.random(),
      sources: {}
    };
    
    for (const source of sources) {
      sentimentData[symbol].sources[source] = {
        score: (Math.random() - 0.5) * 2,
        mentions: Math.floor(Math.random() * 1000),
        trending: Math.random() > 0.7
      };
    }
  }
  
  return {
    sentiment_analysis: sentimentData,
    timeframe,
    analysis_time: new Date().toISOString(),
    note: "This is simulated sentiment data. In production, integrate with real sentiment APIs."
  };
}

async function getEconomicCalendar(params: any) {
  const { date_range = '7d', importance = 'medium', currencies = ['USD', 'EUR'] } = params;
  
  // Simulate economic calendar data (integrate with real APIs like Trading Economics, etc.)
  const events = [
    {
      title: "Federal Reserve Interest Rate Decision",
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      currency: "USD",
      importance: "high",
      forecast: "5.25%",
      previous: "5.00%"
    },
    {
      title: "Non-Farm Payrolls",
      date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      currency: "USD", 
      importance: "high",
      forecast: "180K",
      previous: "175K"
    },
    {
      title: "ECB Interest Rate Decision",
      date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      currency: "EUR",
      importance: "high",
      forecast: "4.25%",
      previous: "4.00%"
    }
  ];
  
  const filteredEvents = events.filter(event => 
    currencies.includes(event.currency) &&
    (importance === 'all' || event.importance === importance || event.importance === 'high')
  );
  
  return {
    events: filteredEvents,
    date_range,
    currencies,
    retrieved_at: new Date().toISOString(),
    note: "This is simulated economic calendar data. In production, integrate with real economic calendar APIs."
  };
}

async function fetchOnchainData(params: any) {
  const { assets, metrics = ['network_value', 'active_addresses'], period = '7d' } = params;
  
  // Simulate on-chain metrics (integrate with APIs like Glassnode, IntoTheBlock, etc.)
  const onchainData: any = {};
  
  for (const asset of assets) {
    onchainData[asset] = {
      period,
      metrics: {}
    };
    
    for (const metric of metrics) {
      onchainData[asset].metrics[metric] = {
        current_value: Math.floor(Math.random() * 1000000),
        change_7d: (Math.random() - 0.5) * 0.4, // -20% to +20%
        trend: ['increasing', 'decreasing', 'stable'][Math.floor(Math.random() * 3)],
        percentile_rank: Math.floor(Math.random() * 100)
      };
    }
  }
  
  return {
    onchain_analysis: onchainData,
    assets,
    metrics,
    period,
    analysis_time: new Date().toISOString(),
    note: "This is simulated on-chain data. In production, integrate with real blockchain analytics APIs."
  };
}