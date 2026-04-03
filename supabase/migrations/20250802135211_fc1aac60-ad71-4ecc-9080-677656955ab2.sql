-- Create market data table for real-time OHLC data
CREATE TABLE public.market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'kraken',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  open DECIMAL(20,8) NOT NULL,
  high DECIMAL(20,8) NOT NULL,
  low DECIMAL(20,8) NOT NULL,
  close DECIMAL(20,8) NOT NULL,
  volume DECIMAL(20,8) NOT NULL,
  interval_period TEXT NOT NULL DEFAULT '15m',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_market_data_symbol_timestamp ON public.market_data(symbol, timestamp DESC);
CREATE INDEX idx_market_data_symbol_interval ON public.market_data(symbol, interval_period, timestamp DESC);

-- Create market regime table
CREATE TABLE public.market_regime (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  regime_type TEXT NOT NULL CHECK (regime_type IN ('trending', 'ranging', 'high_volatility')),
  adx_value DECIMAL(10,4),
  atr_value DECIMAL(20,8),
  volatility_percentile DECIMAL(5,2),
  trend_strength DECIMAL(5,2),
  confidence DECIMAL(5,2) NOT NULL DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for regime data
CREATE INDEX idx_market_regime_symbol_timestamp ON public.market_regime(symbol, timestamp DESC);

-- Create technical indicators table
CREATE TABLE public.technical_indicators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  ema_9 DECIMAL(20,8),
  ema_21 DECIMAL(20,8),
  ema_50 DECIMAL(20,8),
  sma_50 DECIMAL(20,8),
  sma_200 DECIMAL(20,8),
  rsi_14 DECIMAL(10,4),
  adx_14 DECIMAL(10,4),
  atr_14 DECIMAL(20,8),
  macd_line DECIMAL(20,8),
  macd_signal DECIMAL(20,8),
  bb_upper DECIMAL(20,8),
  bb_middle DECIMAL(20,8),
  bb_lower DECIMAL(20,8),
  bb_bandwidth DECIMAL(10,4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for technical indicators
CREATE INDEX idx_technical_indicators_symbol_timestamp ON public.technical_indicators(symbol, timestamp DESC);

-- Enable RLS
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_regime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_indicators ENABLE ROW LEVEL SECURITY;

-- Create policies (public read access for market data)
CREATE POLICY "Market data is viewable by everyone" 
ON public.market_data 
FOR SELECT 
USING (true);

CREATE POLICY "Market regime is viewable by everyone" 
ON public.market_regime 
FOR SELECT 
USING (true);

CREATE POLICY "Technical indicators are viewable by everyone" 
ON public.technical_indicators 
FOR SELECT 
USING (true);

-- Service role can insert/update market data
CREATE POLICY "Service role can manage market data" 
ON public.market_data 
FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage market regime" 
ON public.market_regime 
FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage technical indicators" 
ON public.technical_indicators 
FOR ALL 
USING (auth.role() = 'service_role');

-- Add realtime support
ALTER TABLE public.market_data REPLICA IDENTITY FULL;
ALTER TABLE public.market_regime REPLICA IDENTITY FULL;
ALTER TABLE public.technical_indicators REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER publication supabase_realtime ADD TABLE public.market_data;
ALTER publication supabase_realtime ADD TABLE public.market_regime;
ALTER publication supabase_realtime ADD TABLE public.technical_indicators;