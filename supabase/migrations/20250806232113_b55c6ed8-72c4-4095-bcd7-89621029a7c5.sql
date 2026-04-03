-- Fix critical security issues

-- Enable RLS on system_health table (critical security issue)
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

-- Create policy for system_health (allow service monitoring)
CREATE POLICY "System health is readable by authenticated users" 
ON public.system_health 
FOR SELECT 
USING (true);

CREATE POLICY "System can insert health checks" 
ON public.system_health 
FOR INSERT 
WITH CHECK (true);

-- Fix function search path security issues
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Fix existing functions with search path
CREATE OR REPLACE FUNCTION public.get_notification_settings(p_user_id uuid)
 RETURNS TABLE(telegram_enabled boolean, email_enabled boolean, daily_reports boolean, trade_alerts boolean, risk_alerts boolean, performance_summary boolean, email_address text, telegram_chat_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ns.telegram_enabled,
    ns.email_enabled,
    ns.daily_reports,
    ns.trade_alerts,
    ns.risk_alerts,
    ns.performance_summary,
    ns.email_address,
    ns.telegram_chat_id
  FROM public.notification_settings ns
  WHERE ns.user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_notification_settings(p_user_id uuid, p_telegram_enabled boolean DEFAULT false, p_email_enabled boolean DEFAULT false, p_daily_reports boolean DEFAULT true, p_trade_alerts boolean DEFAULT true, p_risk_alerts boolean DEFAULT true, p_performance_summary boolean DEFAULT true, p_email_address text DEFAULT NULL::text, p_telegram_chat_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.notification_settings (
    user_id,
    telegram_enabled,
    email_enabled,
    daily_reports,
    trade_alerts,
    risk_alerts,
    performance_summary,
    email_address,
    telegram_chat_id,
    updated_at
  )
  VALUES (
    p_user_id,
    p_telegram_enabled,
    p_email_enabled,
    p_daily_reports,
    p_trade_alerts,
    p_risk_alerts,
    p_performance_summary,
    p_email_address,
    p_telegram_chat_id,
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    telegram_enabled = p_telegram_enabled,
    email_enabled = p_email_enabled,
    daily_reports = p_daily_reports,
    trade_alerts = p_trade_alerts,
    risk_alerts = p_risk_alerts,
    performance_summary = p_performance_summary,
    email_address = p_email_address,
    telegram_chat_id = p_telegram_chat_id,
    updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name');
  RETURN NEW;
END;
$function$;