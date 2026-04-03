-- Create risk management tables

-- Risk settings table for user-specific risk parameters
CREATE TABLE public.risk_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  max_daily_loss NUMERIC NOT NULL DEFAULT 500.00,
  max_position_size NUMERIC NOT NULL DEFAULT 0.10,
  max_portfolio_risk NUMERIC NOT NULL DEFAULT 0.05,
  max_symbol_exposure NUMERIC NOT NULL DEFAULT 0.20,
  circuit_breaker_enabled BOOLEAN NOT NULL DEFAULT true,
  circuit_breaker_threshold NUMERIC NOT NULL DEFAULT 0.03,
  position_sizing_method TEXT NOT NULL DEFAULT 'kelly',
  max_correlation_exposure NUMERIC NOT NULL DEFAULT 0.30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Risk events table for logging risk incidents
CREATE TABLE public.risk_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  triggered_by JSONB,
  actions_taken TEXT[],
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Position sizing calculations table
CREATE TABLE public.position_sizing_calculations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  calculation_method TEXT NOT NULL,
  inputs JSONB NOT NULL,
  recommended_size NUMERIC NOT NULL,
  max_size NUMERIC NOT NULL,
  risk_score NUMERIC NOT NULL,
  confidence_level NUMERIC NOT NULL DEFAULT 0.95,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Risk limits monitoring table
CREATE TABLE public.risk_limits_monitoring (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  limit_type TEXT NOT NULL,
  current_value NUMERIC NOT NULL,
  limit_value NUMERIC NOT NULL,
  utilization_percentage NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'normal',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all risk management tables
ALTER TABLE public.risk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_sizing_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_limits_monitoring ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for risk_settings
CREATE POLICY "Users can view their own risk settings" 
ON public.risk_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk settings" 
ON public.risk_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own risk settings" 
ON public.risk_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for risk_events
CREATE POLICY "Users can view their own risk events" 
ON public.risk_events 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk events" 
ON public.risk_events 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for position_sizing_calculations
CREATE POLICY "Users can view their own position sizing calculations" 
ON public.position_sizing_calculations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own position sizing calculations" 
ON public.position_sizing_calculations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for risk_limits_monitoring
CREATE POLICY "Users can view their own risk limits monitoring" 
ON public.risk_limits_monitoring 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk limits monitoring" 
ON public.risk_limits_monitoring 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own risk limits monitoring" 
ON public.risk_limits_monitoring 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE TRIGGER update_risk_settings_updated_at
BEFORE UPDATE ON public.risk_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();