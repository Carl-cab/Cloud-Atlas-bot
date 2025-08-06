-- Create necessary security and monitoring tables

-- Create API keys table for secure storage of exchange credentials
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    exchange VARCHAR(50) NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    passphrase TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, exchange)
);

-- Enable RLS for API keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Create policies for API keys
CREATE POLICY "Users can manage their own API keys" 
ON public.api_keys 
FOR ALL 
USING (auth.uid() = user_id);

-- Create system health monitoring table
CREATE TABLE IF NOT EXISTS public.system_health (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create comprehensive trading logs table
CREATE TABLE IF NOT EXISTS public.trading_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    level VARCHAR(20) NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for trading logs
ALTER TABLE public.trading_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for trading logs
CREATE POLICY "Users can view their own trading logs" 
ON public.trading_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert trading logs" 
ON public.trading_logs 
FOR INSERT 
WITH CHECK (true);

-- Create WebSocket connections table for real-time data
CREATE TABLE IF NOT EXISTS public.websocket_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    connection_type VARCHAR(20) NOT NULL CHECK (connection_type IN ('ticker', 'orderbook', 'trades')),
    is_active BOOLEAN DEFAULT true,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for WebSocket connections
ALTER TABLE public.websocket_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for WebSocket connections
CREATE POLICY "Users can manage their own WebSocket connections" 
ON public.websocket_connections 
FOR ALL 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_health_service_time ON public.system_health(service_name, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_exchange ON public.api_keys(user_id, exchange);
CREATE INDEX IF NOT EXISTS idx_trading_logs_user_time ON public.trading_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_logs_level_category ON public.trading_logs(level, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_websocket_connections_user ON public.websocket_connections(user_id, is_active);

-- Create function to log trading events
CREATE OR REPLACE FUNCTION public.log_trading_event(
    p_user_id UUID,
    p_level VARCHAR(20),
    p_category VARCHAR(50),
    p_message TEXT,
    p_metadata JSONB DEFAULT NULL
) RETURNS void AS $$
BEGIN
    INSERT INTO public.trading_logs (user_id, level, category, message, metadata)
    VALUES (p_user_id, p_level, p_category, p_message, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add triggers for updated_at columns
CREATE OR REPLACE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON public.api_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();