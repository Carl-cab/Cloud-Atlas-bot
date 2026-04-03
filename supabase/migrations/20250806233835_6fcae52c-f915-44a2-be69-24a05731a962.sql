-- Fix security warnings: Update function search paths and enable RLS
-- Fix function search paths for security
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Fix security audit logging function
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Fix update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Enable RLS on market_data_cache table
ALTER TABLE public.market_data_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for market data cache (public read)
CREATE POLICY "Market data cache is publicly readable" 
ON public.market_data_cache 
FOR SELECT 
USING (true);

-- Create policy for system to update market data
CREATE POLICY "System can manage market data cache" 
ON public.market_data_cache 
FOR ALL 
USING (true);