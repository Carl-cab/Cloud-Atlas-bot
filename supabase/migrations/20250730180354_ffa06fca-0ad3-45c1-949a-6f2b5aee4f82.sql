-- Create tables for the agentic AI crypto trading bot

-- Market data table for storing OHLCV data
CREATE TABLE public.market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL, -- '15m', '1h'
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  open DECIMAL(20,8) NOT NULL,
  high DECIMAL(20,8) NOT NULL,
  low DECIMAL(20,8) NOT NULL,
  close DECIMAL(20,8) NOT NULL,
  volume DECIMAL(20,8) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Market regime detection table
CREATE TABLE public.market_regimes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  regime TEXT NOT NULL, -- 'trend', 'range', 'high_volatility'
  confidence DECIMAL(5,2) NOT NULL,
  volatility DECIMAL(10,6) NOT NULL,
  trend_strength DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trading strategies performance tracking
CREATE TABLE public.strategy_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  strategy_type TEXT NOT NULL, -- 'trend_following', 'mean_reversion'
  signal_type TEXT NOT NULL, -- 'buy', 'sell', 'hold'
  confidence DECIMAL(5,2) NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  ml_score DECIMAL(5,2),
  indicators JSONB,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trading positions table
CREATE TABLE public.trading_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'long', 'short'
  entry_price DECIMAL(20,8) NOT NULL,
  quantity DECIMAL(20,8) NOT NULL,
  stop_loss DECIMAL(20,8),
  take_profit DECIMAL(20,8),
  current_price DECIMAL(20,8),
  unrealized_pnl DECIMAL(20,8),
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed', 'partial'
  strategy_used TEXT NOT NULL,
  risk_amount DECIMAL(20,8) NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Executed trades table
CREATE TABLE public.executed_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  position_id UUID REFERENCES public.trading_positions(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'buy', 'sell'
  quantity DECIMAL(20,8) NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  fee DECIMAL(20,8) NOT NULL,
  realized_pnl DECIMAL(20,8),
  trade_type TEXT NOT NULL, -- 'entry', 'exit', 'stop_loss', 'take_profit'
  kraken_order_id TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Daily PnL tracking
CREATE TABLE public.daily_pnl (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  starting_balance DECIMAL(20,8) NOT NULL,
  ending_balance DECIMAL(20,8) NOT NULL,
  realized_pnl DECIMAL(20,8) NOT NULL,
  unrealized_pnl DECIMAL(20,8) NOT NULL,
  total_pnl DECIMAL(20,8) NOT NULL,
  total_trades INTEGER NOT NULL,
  winning_trades INTEGER NOT NULL,
  losing_trades INTEGER NOT NULL,
  win_rate DECIMAL(5,2) NOT NULL,
  max_drawdown DECIMAL(5,2) NOT NULL,
  risk_used DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ML model tracking
CREATE TABLE public.ml_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_type TEXT NOT NULL, -- 'gradient_boosting', 'random_forest'
  symbol TEXT NOT NULL,
  version INTEGER NOT NULL,
  accuracy DECIMAL(5,2),
  precision_score DECIMAL(5,2),
  recall_score DECIMAL(5,2),
  f1_score DECIMAL(5,2),
  feature_importance JSONB,
  model_params JSONB,
  training_data_size INTEGER,
  trained_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bot configuration and settings
CREATE TABLE public.bot_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'paper', -- 'paper', 'live'
  risk_per_trade DECIMAL(5,2) NOT NULL DEFAULT 0.5,
  daily_stop_loss DECIMAL(5,2) NOT NULL DEFAULT 2.0,
  max_positions INTEGER NOT NULL DEFAULT 4,
  capital_cad DECIMAL(20,8) NOT NULL DEFAULT 100.00,
  symbols TEXT[] NOT NULL DEFAULT ARRAY['BTCUSD', 'ETHUSD'],
  retraining_frequency TEXT NOT NULL DEFAULT 'daily',
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_regimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executed_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_pnl ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;

-- Create policies for market data (public read access)
CREATE POLICY "Market data is publicly readable" 
ON public.market_data FOR SELECT USING (true);

CREATE POLICY "Market regimes are publicly readable" 
ON public.market_regimes FOR SELECT USING (true);

CREATE POLICY "Strategy signals are publicly readable" 
ON public.strategy_signals FOR SELECT USING (true);

CREATE POLICY "ML models are publicly readable" 
ON public.ml_models FOR SELECT USING (true);

-- Create policies for user-specific data
CREATE POLICY "Users can view their own positions" 
ON public.trading_positions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own trades" 
ON public.executed_trades FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own PnL" 
ON public.daily_pnl FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own bot config" 
ON public.bot_config FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot config" 
ON public.bot_config FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bot config" 
ON public.bot_config FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_market_data_symbol_timeframe_timestamp ON public.market_data(symbol, timeframe, timestamp);
CREATE INDEX idx_market_regimes_symbol_timestamp ON public.market_regimes(symbol, timestamp);
CREATE INDEX idx_strategy_signals_symbol_timestamp ON public.strategy_signals(symbol, timestamp);
CREATE INDEX idx_trading_positions_user_status ON public.trading_positions(user_id, status);
CREATE INDEX idx_executed_trades_user_timestamp ON public.executed_trades(user_id, timestamp);
CREATE INDEX idx_daily_pnl_user_date ON public.daily_pnl(user_id, date);
CREATE INDEX idx_ml_models_symbol_active ON public.ml_models(symbol, is_active);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for bot_config
CREATE TRIGGER update_bot_config_updated_at
  BEFORE UPDATE ON public.bot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();