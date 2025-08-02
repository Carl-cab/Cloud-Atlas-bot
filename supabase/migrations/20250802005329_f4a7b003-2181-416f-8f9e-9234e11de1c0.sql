-- Create table for ML trading signals
CREATE TABLE public.ml_trading_signals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol TEXT NOT NULL,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('BUY', 'SELL', 'HOLD')),
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    features JSONB NOT NULL,
    risk_amount DECIMAL(15,8) NOT NULL,
    position_size DECIMAL(15,8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for ML model performance tracking
CREATE TABLE public.ml_model_performance (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    model_version TEXT NOT NULL,
    symbol TEXT NOT NULL,
    accuracy DECIMAL(5,4),
    precision_score DECIMAL(5,4),
    recall_score DECIMAL(5,4),
    f1_score DECIMAL(5,4),
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for feature importance tracking
CREATE TABLE public.ml_feature_importance (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    model_version TEXT NOT NULL,
    feature_name TEXT NOT NULL,
    importance_score DECIMAL(10,8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.ml_trading_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_model_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_feature_importance ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is a trading bot)
CREATE POLICY "Allow public read access to ML trading signals" 
ON public.ml_trading_signals 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert to ML trading signals" 
ON public.ml_trading_signals 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public read access to ML model performance" 
ON public.ml_model_performance 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert/update to ML model performance" 
ON public.ml_model_performance 
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read access to ML feature importance" 
ON public.ml_feature_importance 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert to ML feature importance" 
ON public.ml_feature_importance 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_ml_signals_symbol_created ON public.ml_trading_signals(symbol, created_at DESC);
CREATE INDEX idx_ml_signals_created ON public.ml_trading_signals(created_at DESC);
CREATE INDEX idx_ml_performance_symbol ON public.ml_model_performance(symbol);
CREATE INDEX idx_ml_features_model_version ON public.ml_feature_importance(model_version);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_ml_signals_updated_at
    BEFORE UPDATE ON public.ml_trading_signals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ml_performance_updated_at
    BEFORE UPDATE ON public.ml_model_performance
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();