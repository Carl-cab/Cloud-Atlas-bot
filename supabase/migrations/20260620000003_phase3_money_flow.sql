-- =============================================================================
-- PHASE 3: MONEY FLOW ARCHITECTURE
-- Deposit, Withdrawal, and Profit Tracking
-- =============================================================================
--
-- Architecture overview:
--
--   user_wallets        — one row per user; the authoritative balance record
--   transactions        — immutable double-entry ledger; every balance change
--                         is recorded here. No balance is ever updated without
--                         a corresponding transaction row.
--   withdrawal_requests — pending/approved/rejected withdrawal workflow
--   pnl_snapshots       — point-in-time P&L snapshots (hourly/daily)
--
-- Balance invariant (enforced by trigger):
--   available_balance = total_deposited - total_withdrawn
--                       + total_realized_pnl - locked_in_trades
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. USER WALLETS
--    One row per user. All monetary amounts are stored in USD.
--    locked_in_trades: funds currently reserved for open positions.
--    available_balance: funds available for new trades or withdrawal.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency              TEXT        NOT NULL DEFAULT 'USD',
  total_deposited       NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  total_withdrawn       NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  locked_in_trades      NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  total_realized_pnl    NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  total_fees_paid       NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  available_balance     NUMERIC(20,8) NOT NULL DEFAULT 0.00,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT uq_user_wallets_user_currency UNIQUE (user_id, currency),
  CONSTRAINT chk_total_deposited_non_negative    CHECK (total_deposited    >= 0),
  CONSTRAINT chk_total_withdrawn_non_negative    CHECK (total_withdrawn    >= 0),
  CONSTRAINT chk_locked_in_trades_non_negative   CHECK (locked_in_trades   >= 0),
  CONSTRAINT chk_total_fees_paid_non_negative    CHECK (total_fees_paid    >= 0),
  CONSTRAINT chk_available_balance_non_negative  CHECK (available_balance  >= 0)
);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wallet"
  ON public.user_wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Wallets are only written by service_role (edge functions)
-- Users cannot directly UPDATE their own wallet balance
CREATE POLICY "Service role can manage wallets"
  ON public.user_wallets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. TRANSACTIONS LEDGER (immutable)
--    Every balance change is recorded as an immutable row.
--    transaction_type values:
--      deposit          — funds added by user
--      withdrawal       — funds removed by user
--      trade_lock       — funds locked when a position is opened
--      trade_unlock     — funds released when a position is closed
--      realized_pnl     — profit/loss credited on position close
--      fee              — exchange fee debited
--      reconciliation   — manual adjustment after Kraken reconciliation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id         UUID        NOT NULL REFERENCES public.user_wallets(id),
  transaction_type  TEXT        NOT NULL,
  amount            NUMERIC(20,8) NOT NULL,
  currency          TEXT        NOT NULL DEFAULT 'USD',
  balance_before    NUMERIC(20,8) NOT NULL,
  balance_after     NUMERIC(20,8) NOT NULL,
  reference_id      UUID,        -- FK to position, trade, or withdrawal_request
  reference_type    TEXT,        -- 'position', 'trade', 'withdrawal_request'
  description       TEXT,
  metadata          JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT chk_transaction_type CHECK (transaction_type IN (
    'deposit', 'withdrawal', 'trade_lock', 'trade_unlock',
    'realized_pnl', 'fee', 'reconciliation'
  )),
  CONSTRAINT chk_amount_non_zero CHECK (amount != 0)
);

-- Transactions are immutable — no UPDATE or DELETE allowed
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- No UPDATE or DELETE policies — transactions are append-only

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON public.transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_reference
  ON public.transactions (reference_id, reference_type)
  WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_type
  ON public.transactions (user_id, transaction_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. WITHDRAWAL REQUESTS
--    Withdrawal workflow: pending → approved → completed | rejected
--    Funds are locked (deducted from available_balance) when a withdrawal
--    request is created, and released if the request is rejected.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id         UUID        NOT NULL REFERENCES public.user_wallets(id),
  amount            NUMERIC(20,8) NOT NULL,
  currency          TEXT        NOT NULL DEFAULT 'USD',
  destination       TEXT        NOT NULL,  -- Kraken withdrawal address or bank ref
  destination_type  TEXT        NOT NULL DEFAULT 'kraken',
  status            TEXT        NOT NULL DEFAULT 'pending',
  requested_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMP WITH TIME ZONE,
  completed_at      TIMESTAMP WITH TIME ZONE,
  rejection_reason  TEXT,
  kraken_ref_id     TEXT,        -- Kraken withdrawal reference ID
  notes             TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT chk_withdrawal_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_withdrawal_status CHECK (status IN (
    'pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled'
  )),
  CONSTRAINT chk_destination_type CHECK (destination_type IN (
    'kraken', 'bank', 'crypto_address'
  ))
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create withdrawal requests"
  ON public.withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only cancel their own pending requests
CREATE POLICY "Users can cancel pending withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- Service role handles approval and completion
CREATE POLICY "Service role can manage withdrawal requests"
  ON public.withdrawal_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_status
  ON public.withdrawal_requests (user_id, status, requested_at DESC);

-- ---------------------------------------------------------------------------
-- 4. P&L SNAPSHOTS
--    Point-in-time snapshots of portfolio value and P&L.
--    Written by the pnl-engine on position close and daily reconciliation.
--    snapshot_type: 'trade_close' | 'hourly' | 'daily'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pnl_snapshots (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_type         TEXT        NOT NULL DEFAULT 'daily',
  snapshot_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Wallet state at snapshot time
  available_balance     NUMERIC(20,8) NOT NULL,
  locked_in_trades      NUMERIC(20,8) NOT NULL,
  total_portfolio_value NUMERIC(20,8) NOT NULL,
  -- P&L components
  realized_pnl_today    NUMERIC(20,8) NOT NULL DEFAULT 0,
  realized_pnl_total    NUMERIC(20,8) NOT NULL DEFAULT 0,
  unrealized_pnl        NUMERIC(20,8) NOT NULL DEFAULT 0,
  total_pnl             NUMERIC(20,8) NOT NULL DEFAULT 0,
  -- Trade statistics
  open_positions        INTEGER       NOT NULL DEFAULT 0,
  trades_today          INTEGER       NOT NULL DEFAULT 0,
  winning_trades_today  INTEGER       NOT NULL DEFAULT 0,
  losing_trades_today   INTEGER       NOT NULL DEFAULT 0,
  -- Risk metrics
  max_drawdown_today    NUMERIC(8,4)  NOT NULL DEFAULT 0,
  daily_return_pct      NUMERIC(8,4)  NOT NULL DEFAULT 0,
  -- Reference
  position_id           UUID          REFERENCES public.trading_positions(id),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT chk_snapshot_type CHECK (snapshot_type IN ('trade_close', 'hourly', 'daily'))
);

ALTER TABLE public.pnl_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own P&L snapshots"
  ON public.pnl_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage P&L snapshots"
  ON public.pnl_snapshots FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_user_date
  ON public.pnl_snapshots (user_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_daily
  ON public.pnl_snapshots (user_id, snapshot_type, snapshot_at DESC)
  WHERE snapshot_type = 'daily';

-- ---------------------------------------------------------------------------
-- 5. RECONCILIATION LOG
--    Records the result of each daily Kraken balance reconciliation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_log (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reconciled_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  kraken_balance_usd    NUMERIC(20,8),
  internal_balance_usd  NUMERIC(20,8),
  discrepancy_usd       NUMERIC(20,8),
  status                TEXT        NOT NULL DEFAULT 'ok',
  notes                 TEXT,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT chk_reconciliation_status CHECK (status IN ('ok', 'discrepancy', 'error', 'skipped'))
);

ALTER TABLE public.reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reconciliation log"
  ON public.reconciliation_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage reconciliation log"
  ON public.reconciliation_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. WALLET BALANCE TRIGGER
--    Recomputes available_balance after every wallet UPDATE to maintain
--    the invariant:
--      available_balance = total_deposited - total_withdrawn
--                          + total_realized_pnl - locked_in_trades
--                          - total_fees_paid
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_available_balance()
RETURNS TRIGGER AS $$
BEGIN
  NEW.available_balance :=
    NEW.total_deposited
    - NEW.total_withdrawn
    + NEW.total_realized_pnl
    - NEW.locked_in_trades
    - NEW.total_fees_paid;

  -- Clamp to zero: available_balance must never go negative
  IF NEW.available_balance < 0 THEN
    RAISE EXCEPTION
      'Insufficient balance: available_balance would be % for user %',
      NEW.available_balance, NEW.user_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_available_balance ON public.user_wallets;
CREATE TRIGGER trg_recompute_available_balance
  BEFORE INSERT OR UPDATE ON public.user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_available_balance();

-- ---------------------------------------------------------------------------
-- 7. SEED: Create a default USD wallet for all existing users
--    (idempotent — uses ON CONFLICT DO NOTHING)
-- ---------------------------------------------------------------------------
INSERT INTO public.user_wallets (user_id, currency)
SELECT id, 'USD'
FROM auth.users
ON CONFLICT (user_id, currency) DO NOTHING;
