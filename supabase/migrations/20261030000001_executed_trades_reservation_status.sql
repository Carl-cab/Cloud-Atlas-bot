-- Add reservation_status column to executed_trades for idempotency lifecycle tracking.
-- Values: 'pending' (in-flight, inserted before exchange call),
--         'confirmed' (Kraken accepted, kraken_order_id is set),
--         'failed' (rejected before or by exchange, safe to retry with same client_order_id),
--         'unconfirmed' (network/timeout — order may be live, reconciliation required).
ALTER TABLE public.executed_trades
  ADD COLUMN IF NOT EXISTS reservation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reservation_status IN ('pending', 'confirmed', 'failed', 'unconfirmed'));

-- Backfill: pre-migration rows already have a kraken_order_id (exchange confirmed).
-- The DEFAULT assigns them 'pending', but their true state is 'confirmed'.
UPDATE public.executed_trades
  SET reservation_status = 'confirmed'
  WHERE kraken_order_id IS NOT NULL AND reservation_status = 'pending';
