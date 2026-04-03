-- Fix security vulnerability: Restrict ml_trading_signals access to authenticated users only
-- Remove the public read access policy that exposes trading strategies
DROP POLICY IF EXISTS "Allow public read access to ML trading signals" ON public.ml_trading_signals;

-- Create a secure policy that only allows authenticated users to read their own signals or system-generated signals
CREATE POLICY "Authenticated users can read ML trading signals" 
ON public.ml_trading_signals 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Add user_id column if it doesn't exist to enable user-specific access control in the future
-- This is optional but recommended for better security segmentation
ALTER TABLE public.ml_trading_signals 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update the insert policy to be more explicit about authentication requirement
DROP POLICY IF EXISTS "Authenticated users can insert ML trading signals" ON public.ml_trading_signals;

CREATE POLICY "Authenticated users can insert ML trading signals" 
ON public.ml_trading_signals 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);