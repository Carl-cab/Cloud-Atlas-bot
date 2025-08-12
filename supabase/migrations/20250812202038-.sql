-- Fix security vulnerability in get_notification_settings function
-- Only allow users to access their own notification settings

CREATE OR REPLACE FUNCTION public.get_notification_settings(p_user_id uuid)
 RETURNS TABLE(telegram_enabled boolean, email_enabled boolean, daily_reports boolean, trade_alerts boolean, risk_alerts boolean, performance_summary boolean, email_address text, telegram_chat_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Security check: ensure user can only access their own data
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Access denied: users can only access their own notification settings';
  END IF;

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
$function$