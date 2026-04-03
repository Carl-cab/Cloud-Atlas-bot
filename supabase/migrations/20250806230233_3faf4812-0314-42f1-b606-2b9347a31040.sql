-- Fix the database issues and implement proper security

-- Create a demo user profile with proper UUID
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    email_change_sent_at,
    email_change_confirm_status,
    banned_until,
    deleted_at
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'demo@cloudatlasbot.com',
    crypt('demo123456', gen_salt('bf')),
    now(),
    now(),
    now(),
    encode(gen_random_bytes(32), 'hex'),
    '',
    '',
    '',
    '',
    '{"provider": "email", "providers": ["email"]}',
    '{"display_name": "Demo User", "email": "demo@cloudatlasbot.com"}',
    false,
    null,
    0,
    null,
    null
) ON CONFLICT (id) DO NOTHING;

-- Create bot config for demo user
INSERT INTO public.bot_config (
    user_id,
    capital_cad,
    risk_percentage,
    max_trades,
    is_active,
    ml_model_enabled,
    regime_detection_enabled
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    100.00,
    2.0,
    5,
    false,
    true,
    true
) ON CONFLICT (user_id) DO UPDATE SET
    capital_cad = EXCLUDED.capital_cad,
    risk_percentage = EXCLUDED.risk_percentage,
    max_trades = EXCLUDED.max_trades,
    updated_at = now();

-- Create initial daily P&L record
INSERT INTO public.daily_pnl (
    user_id,
    date,
    total_pnl,
    trades_count,
    win_rate,
    balance_start,
    balance_end
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    CURRENT_DATE,
    0.00,
    0,
    0.00,
    100.00,
    100.00
) ON CONFLICT (user_id, date) DO NOTHING;

-- Create API keys table for secure key storage
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Create notification_settings table
CREATE TABLE IF NOT EXISTS public.notification_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    telegram_enabled BOOLEAN DEFAULT false,
    email_enabled BOOLEAN DEFAULT false,
    daily_reports BOOLEAN DEFAULT true,
    trade_alerts BOOLEAN DEFAULT true,
    risk_alerts BOOLEAN DEFAULT true,
    performance_summary BOOLEAN DEFAULT true,
    email_address TEXT,
    telegram_chat_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id)
);

-- Enable RLS for notifications
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
CREATE POLICY "Users can manage their own notification settings" 
ON public.notification_settings 
FOR ALL 
USING (auth.uid() = user_id);

-- Create system_health table for monitoring
CREATE TABLE IF NOT EXISTS public.system_health (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_health_service_time ON public.system_health(service_name, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_exchange ON public.api_keys(user_id, exchange);
CREATE INDEX IF NOT EXISTS idx_bot_config_user_active ON public.bot_config(user_id, is_active);

-- Create trading_logs table for comprehensive logging
CREATE TABLE IF NOT EXISTS public.trading_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Create indexes for logs
CREATE INDEX IF NOT EXISTS idx_trading_logs_user_time ON public.trading_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_logs_level_category ON public.trading_logs(level, category, created_at DESC);

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

CREATE OR REPLACE TRIGGER update_notification_settings_updated_at
    BEFORE UPDATE ON public.notification_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();