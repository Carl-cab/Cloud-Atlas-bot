-- Create rate limiting table for tracking requests
CREATE TABLE IF NOT EXISTS public.rate_limit_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_key_timestamp ON public.rate_limit_entries(key, timestamp);
CREATE INDEX IF NOT EXISTS idx_rate_limit_timestamp ON public.rate_limit_entries(timestamp);

-- Enable RLS
ALTER TABLE public.rate_limit_entries ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access only (edge functions)
CREATE POLICY "Service role can manage rate limit entries" 
ON public.rate_limit_entries 
FOR ALL 
USING (true)
WITH CHECK (true);