-- WP-2B: Atomic wallet transaction ledger
--
-- Replaces the two-step INSERT+UPDATE in wallet-engine's recordTransaction() with
-- a single PL/pgSQL function that runs both writes inside one implicit transaction.
-- A partial failure (e.g. wallet update fails after transaction insert) can no longer
-- leave the ledger in an inconsistent state.

CREATE OR REPLACE FUNCTION record_wallet_transaction(
  p_user_id        UUID,
  p_wallet_id      UUID,
  p_type           TEXT,
  p_amount         NUMERIC,
  p_wallet_update  JSONB,
  p_balance_before NUMERIC,
  p_balance_after  NUMERIC,
  p_reference_id   TEXT    DEFAULT NULL,
  p_reference_type TEXT    DEFAULT NULL,
  p_description    TEXT    DEFAULT NULL,
  p_metadata       JSONB   DEFAULT '{}'::JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  -- 1. Insert immutable transaction record
  INSERT INTO transactions (
    user_id,
    wallet_id,
    transaction_type,
    amount,
    currency,
    balance_before,
    balance_after,
    reference_id,
    reference_type,
    description,
    metadata
  ) VALUES (
    p_user_id,
    p_wallet_id,
    p_type,
    p_amount,
    'USD',
    p_balance_before,
    p_balance_after,
    p_reference_id,
    p_reference_type,
    p_description,
    p_metadata
  );

  -- 2. Update wallet columns present in p_wallet_update; leave others unchanged.
  --    COALESCE falls back to the current column value when a key is absent from the JSON.
  UPDATE user_wallets
  SET
    available_balance  = COALESCE((p_wallet_update->>'available_balance')::NUMERIC,  available_balance),
    locked_in_trades   = COALESCE((p_wallet_update->>'locked_in_trades')::NUMERIC,   locked_in_trades),
    total_deposited    = COALESCE((p_wallet_update->>'total_deposited')::NUMERIC,     total_deposited),
    total_withdrawn    = COALESCE((p_wallet_update->>'total_withdrawn')::NUMERIC,     total_withdrawn),
    total_realized_pnl = COALESCE((p_wallet_update->>'total_realized_pnl')::NUMERIC, total_realized_pnl),
    total_fees_paid    = COALESCE((p_wallet_update->>'total_fees_paid')::NUMERIC,     total_fees_paid)
  WHERE id      = p_wallet_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- 3. Guard: if the wallet row was not found the transaction insert above would leave
  --    an orphaned record — abort the entire function (and roll back the insert).
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Wallet not found or user mismatch (wallet_id=%, user_id=%)',
      p_wallet_id, p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION record_wallet_transaction(
  UUID, UUID, TEXT, NUMERIC, JSONB, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, JSONB
) TO authenticated, service_role, anon;
