-- Create RPC function to get notification settings
CREATE OR REPLACE FUNCTION public.get_notification_settings(p_user_id uuid)
RETURNS TABLE (
  telegram_enabled boolean,
  email_enabled boolean,
  daily_reports boolean,
  trade_alerts boolean,
  risk_alerts boolean,
  performance_summary boolean,
  email_address text,
  telegram_chat_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  FROM notification_settings ns
  WHERE ns.user_id = p_user_id;
END;
$$;

-- Create RPC function to upsert notification settings
CREATE OR REPLACE FUNCTION public.upsert_notification_settings(
  p_user_id uuid,
  p_telegram_enabled boolean DEFAULT false,
  p_email_enabled boolean DEFAULT false,
  p_daily_reports boolean DEFAULT true,
  p_trade_alerts boolean DEFAULT true,
  p_risk_alerts boolean DEFAULT true,
  p_performance_summary boolean DEFAULT true,
  p_email_address text DEFAULT NULL,
  p_telegram_chat_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notification_settings (
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
$$;