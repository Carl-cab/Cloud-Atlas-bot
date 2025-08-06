-- Enable real-time updates for critical monitoring tables
ALTER TABLE public.system_health REPLICA IDENTITY FULL;
ALTER TABLE public.trading_logs REPLICA IDENTITY FULL;
ALTER TABLE public.notification_queue REPLICA IDENTITY FULL;

-- Create comprehensive logging function for trade executions
CREATE OR REPLACE FUNCTION public.log_trade_execution(
  p_user_id UUID,
  p_symbol TEXT,
  p_side TEXT,
  p_quantity NUMERIC,
  p_price NUMERIC,
  p_order_type TEXT,
  p_status TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log the trade execution
  INSERT INTO public.trading_logs (
    user_id,
    level,
    category,
    message,
    metadata
  ) VALUES (
    p_user_id,
    'INFO',
    'TRADE_EXECUTION',
    format('Trade %s: %s %s %s at %s (%s)', 
      p_status, p_side, p_quantity, p_symbol, p_price, p_order_type),
    jsonb_build_object(
      'symbol', p_symbol,
      'side', p_side,
      'quantity', p_quantity,
      'price', p_price,
      'order_type', p_order_type,
      'status', p_status,
      'additional_data', p_metadata
    )
  );
END;
$$;

-- Create alert system function for critical failures
CREATE OR REPLACE FUNCTION public.create_system_alert(
  p_alert_type TEXT,
  p_severity TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  alert_id UUID;
BEGIN
  -- Generate alert ID
  alert_id := gen_random_uuid();
  
  -- Insert into notification queue for immediate processing
  INSERT INTO public.notification_queue (
    id,
    user_id,
    type,
    title,
    message,
    priority,
    data
  ) VALUES (
    alert_id,
    COALESCE(p_user_id, (SELECT auth.uid())),
    p_alert_type,
    format('System Alert - %s', p_severity),
    p_message,
    CASE 
      WHEN p_severity = 'CRITICAL' THEN 'high'
      WHEN p_severity = 'WARNING' THEN 'medium'
      ELSE 'normal'
    END,
    jsonb_build_object(
      'severity', p_severity,
      'alert_type', p_alert_type,
      'metadata', p_metadata,
      'created_at', now()
    )
  );
  
  -- Log the alert creation
  INSERT INTO public.trading_logs (
    user_id,
    level,
    category,
    message,
    metadata
  ) VALUES (
    COALESCE(p_user_id, (SELECT auth.uid())),
    CASE 
      WHEN p_severity = 'CRITICAL' THEN 'ERROR'
      WHEN p_severity = 'WARNING' THEN 'WARN'
      ELSE 'INFO'
    END,
    'SYSTEM_ALERT',
    p_message,
    jsonb_build_object(
      'alert_id', alert_id,
      'alert_type', p_alert_type,
      'severity', p_severity,
      'metadata', p_metadata
    )
  );
  
  RETURN alert_id;
END;
$$;

-- Create performance monitoring function
CREATE OR REPLACE FUNCTION public.record_performance_metric(
  p_metric_name TEXT,
  p_metric_value NUMERIC,
  p_unit TEXT DEFAULT 'count',
  p_tags JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log performance metric
  INSERT INTO public.trading_logs (
    user_id,
    level,
    category,
    message,
    metadata
  ) VALUES (
    COALESCE((SELECT auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid),
    'INFO',
    'PERFORMANCE_METRIC',
    format('Metric %s: %s %s', p_metric_name, p_metric_value, p_unit),
    jsonb_build_object(
      'metric_name', p_metric_name,
      'value', p_metric_value,
      'unit', p_unit,
      'tags', p_tags,
      'timestamp', now()
    )
  );
END;
$$;

-- Create system health check trigger
CREATE OR REPLACE FUNCTION public.monitor_system_health()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check for critical service failures
  IF NEW.status = 'critical' THEN
    PERFORM public.create_system_alert(
      'SERVICE_FAILURE',
      'CRITICAL',
      format('Service %s is experiencing critical issues: %s', 
        NEW.service_name, 
        COALESCE(NEW.error_message, 'Unknown error')
      ),
      jsonb_build_object(
        'service_name', NEW.service_name,
        'response_time_ms', NEW.response_time_ms,
        'error_message', NEW.error_message
      )
    );
  -- Check for performance degradation
  ELSIF NEW.status = 'warning' AND NEW.response_time_ms > 1000 THEN
    PERFORM public.create_system_alert(
      'PERFORMANCE_DEGRADATION',
      'WARNING',
      format('Service %s response time is elevated: %sms', 
        NEW.service_name, 
        NEW.response_time_ms
      ),
      jsonb_build_object(
        'service_name', NEW.service_name,
        'response_time_ms', NEW.response_time_ms
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for system health monitoring
DROP TRIGGER IF EXISTS trigger_monitor_system_health ON public.system_health;
CREATE TRIGGER trigger_monitor_system_health
  AFTER INSERT ON public.system_health
  FOR EACH ROW
  EXECUTE FUNCTION public.monitor_system_health();

-- Create comprehensive test data for system health
INSERT INTO public.system_health (service_name, status, response_time_ms, error_message) VALUES
('API Gateway', 'healthy', 120, NULL),
('Trading Engine', 'healthy', 89, NULL),
('ML Engine', 'warning', 450, NULL),
('Database', 'healthy', 67, NULL),
('Notification Service', 'healthy', 134, NULL),
('Risk Management', 'healthy', 98, NULL),
('Market Data Feed', 'healthy', 156, NULL),
('WebSocket Service', 'warning', 289, NULL),
('Security Monitor', 'healthy', 78, NULL),
('Load Balancer', 'healthy', 45, NULL);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_health_service_status ON public.system_health(service_name, status);
CREATE INDEX IF NOT EXISTS idx_system_health_checked_at ON public.system_health(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_logs_category_level ON public.trading_logs(category, level);
CREATE INDEX IF NOT EXISTS idx_trading_logs_user_created ON public.trading_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_queue_priority ON public.notification_queue(priority, created_at DESC);