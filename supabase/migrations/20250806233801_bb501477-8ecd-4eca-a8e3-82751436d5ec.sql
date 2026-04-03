-- Security Hardening: Create encrypted storage for API keys and rate limiting
-- Add rate limiting table for API endpoints
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_request TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, endpoint)
);

-- Enable RLS on rate limits table
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own rate limits
CREATE POLICY "Users can view their own rate limits" 
ON public.api_rate_limits 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can manage rate limits" 
ON public.api_rate_limits 
FOR ALL 
USING (true);

-- Add audit log table for security monitoring
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Create policies for audit log
CREATE POLICY "Users can view their own audit logs" 
ON public.security_audit_log 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs" 
ON public.security_audit_log 
FOR INSERT 
WITH CHECK (true);

-- Update API keys table to add encryption status
ALTER TABLE public.api_keys 
ADD COLUMN IF NOT EXISTS encryption_key_id TEXT,
ADD COLUMN IF NOT EXISTS last_used TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

-- Add stop-loss and take-profit to trading positions
ALTER TABLE public.trading_positions 
ADD COLUMN IF NOT EXISTS stop_loss_type VARCHAR(20) DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS take_profit_type VARCHAR(20) DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS trailing_stop BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS trailing_amount NUMERIC,
ADD COLUMN IF NOT EXISTS exit_reason TEXT;

-- Enhanced order management
CREATE TABLE IF NOT EXISTS public.order_management (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    position_id UUID REFERENCES public.trading_positions(id),
    parent_order_id UUID,
    order_type VARCHAR(30) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity NUMERIC NOT NULL,
    filled_quantity NUMERIC DEFAULT 0,
    price NUMERIC,
    stop_price NUMERIC,
    take_profit_price NUMERIC,
    status VARCHAR(20) DEFAULT 'pending',
    exchange_order_id TEXT,
    time_in_force VARCHAR(10) DEFAULT 'GTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    executed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on order management
ALTER TABLE public.order_management ENABLE ROW LEVEL SECURITY;

-- Create policies for order management
CREATE POLICY "Users can manage their own orders" 
ON public.order_management 
FOR ALL 
USING (auth.uid() = user_id);

-- Add paper trading mode configuration
ALTER TABLE public.bot_config 
ADD COLUMN IF NOT EXISTS paper_trading_balance NUMERIC DEFAULT 10000.00,
ADD COLUMN IF NOT EXISTS paper_trading_fees NUMERIC DEFAULT 0.001,
ADD COLUMN IF NOT EXISTS stop_loss_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS take_profit_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS trailing_stop_enabled BOOLEAN DEFAULT false;

-- Create real-time market data cache
CREATE TABLE IF NOT EXISTS public.market_data_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    exchange VARCHAR(20) NOT NULL,
    price NUMERIC NOT NULL,
    bid NUMERIC,
    ask NUMERIC,
    volume_24h NUMERIC,
    change_24h NUMERIC,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(symbol, exchange)
);

-- Enable realtime for market data
ALTER TABLE public.market_data_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_data_cache;

-- Create notification queue for real-time events
CREATE TABLE IF NOT EXISTS public.notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(10) DEFAULT 'normal',
    data JSONB,
    read BOOLEAN DEFAULT false,
    sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS and realtime for notifications
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_queue;

-- Create policies for notifications
CREATE POLICY "Users can view their own notifications" 
ON public.notification_queue 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" 
ON public.notification_queue 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function for rate limiting
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_user_id UUID,
    p_endpoint VARCHAR(100),
    p_max_requests INTEGER DEFAULT 100,
    p_window_minutes INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    window_start TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get current window start
    window_start := now() - INTERVAL '1 minute' * p_window_minutes;
    
    -- Clean old entries or reset if window expired
    UPDATE public.api_rate_limits 
    SET request_count = 0, window_start = now()
    WHERE user_id = p_user_id 
    AND endpoint = p_endpoint 
    AND window_start < window_start;
    
    -- Insert or update rate limit record
    INSERT INTO public.api_rate_limits (user_id, endpoint, request_count, window_start, last_request)
    VALUES (p_user_id, p_endpoint, 1, now(), now())
    ON CONFLICT (user_id, endpoint)
    DO UPDATE SET 
        request_count = api_rate_limits.request_count + 1,
        last_request = now()
    RETURNING request_count INTO current_count;
    
    -- Return true if under limit
    RETURN current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for security audit logging
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_user_id UUID,
    p_action VARCHAR(100),
    p_resource VARCHAR(100) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_metadata JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.security_audit_log (
        user_id, action, resource, ip_address, user_agent, success, metadata
    ) VALUES (
        p_user_id, p_action, p_resource, p_ip_address, p_user_agent, p_success, p_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_management_updated_at
    BEFORE UPDATE ON public.order_management
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();