-- Fix critical security vulnerabilities in RLS policies

-- 1. Secure rate_limit_entries table - remove public read access
DROP POLICY IF EXISTS "Service role can manage rate limit entries" ON public.rate_limit_entries;

-- Create restrictive policy for rate limit entries (system only)
CREATE POLICY "System only can manage rate limit entries" 
ON public.rate_limit_entries 
FOR ALL 
USING (false) 
WITH CHECK (false);

-- 2. Secure system_health table - require authentication for read access
DROP POLICY IF EXISTS "System health is readable by authenticated users" ON public.system_health;

-- Create policy requiring authentication for system health
CREATE POLICY "Authenticated users can view system health" 
ON public.system_health 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 3. Review and tighten other potentially problematic policies
-- Update ml_feature_importance to require authentication for insert
DROP POLICY IF EXISTS "Allow public insert to ML feature importance" ON public.ml_feature_importance;
CREATE POLICY "Authenticated users can insert ML feature importance" 
ON public.ml_feature_importance 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Update ml_trading_signals to require authentication for insert  
DROP POLICY IF EXISTS "Allow public insert to ML trading signals" ON public.ml_trading_signals;
CREATE POLICY "Authenticated users can insert ML trading signals" 
ON public.ml_trading_signals 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Update ml_model_performance to require authentication
DROP POLICY IF EXISTS "Allow public insert/update to ML model performance" ON public.ml_model_performance;
CREATE POLICY "Authenticated users can manage ML model performance" 
ON public.ml_model_performance 
FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);