-- =============================================================================
-- BROKER ABSTRACTION LAYER — Additive Migration
--
-- Creates normalized tables for multi-broker support. Does NOT modify
-- existing tables. Existing data (executed_trades.kraken_order_id, etc.)
-- remains intact and will be used alongside the new schema during migration.
--
-- Tables created:
--   broker_accounts       — per-user broker configuration
--   broker_capabilities   — what each broker supports (system-managed)
--   broker_health         — latest health check per broker
--   broker_orders         — broker-agnostic order log
--   broker_positions      — broker-agnostic position tracking
--   broker_balances       — broker-agnostic balance snapshots
--   broker_transactions   — broker-agnostic trade/fill log
--   broker_failures       — error log for broker operations
-- =============================================================================

-- ---------------------------------------------------------------------------
-- broker_accounts: per-user broker configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_id TEXT NOT NULL,  -- 'kraken', 'alpaca', 'paper', etc.
  display_name TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper', 'live')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, broker_id)
);

ALTER TABLE public.broker_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broker accounts"
  ON public.broker_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own broker accounts"
  ON public.broker_accounts FOR ALL
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- broker_capabilities: what each broker supports (populated by adapters)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_capabilities (
  broker_id TEXT NOT NULL PRIMARY KEY,
  broker_name TEXT NOT NULL,
  supported_asset_classes TEXT[] NOT NULL DEFAULT '{}',
  supported_order_types TEXT[] NOT NULL DEFAULT '{}',
  supports_paper_trading BOOLEAN NOT NULL DEFAULT false,
  supports_websocket BOOLEAN NOT NULL DEFAULT false,
  supports_stop_loss BOOLEAN NOT NULL DEFAULT true,
  supports_take_profit BOOLEAN NOT NULL DEFAULT true,
  supports_margin BOOLEAN NOT NULL DEFAULT false,
  max_orders_per_second INTEGER NOT NULL DEFAULT 1,
  supported_currencies TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with known brokers
INSERT INTO public.broker_capabilities (broker_id, broker_name, supported_asset_classes, supported_order_types, supports_paper_trading, supports_websocket, supported_currencies)
VALUES
  ('kraken', 'Kraken', '{crypto}', '{market,limit,stop_loss,take_profit,stop_limit}', false, true, '{USD,CAD,EUR,GBP}'),
  ('paper', 'Paper Trading (Simulated)', '{crypto,stock,etf,forex,option,future,metal}', '{market,limit,stop_loss,take_profit,stop_limit}', true, false, '{USD}')
ON CONFLICT (broker_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- broker_health: latest health check per broker
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down', 'maintenance')),
  latency_ms INTEGER,
  rate_limit_remaining INTEGER,
  rate_limit_total INTEGER,
  message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_health_broker_id ON public.broker_health(broker_id, checked_at DESC);

-- ---------------------------------------------------------------------------
-- broker_orders: broker-agnostic order log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_id TEXT NOT NULL,
  broker_order_id TEXT,
  client_order_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  quantity DECIMAL(20,8) NOT NULL,
  filled_quantity DECIMAL(20,8) NOT NULL DEFAULT 0,
  price DECIMAL(20,8),
  stop_price DECIMAL(20,8),
  average_fill_price DECIMAL(20,8),
  fee DECIMAL(20,8) NOT NULL DEFAULT 0,
  fee_currency TEXT NOT NULL DEFAULT 'USD',
  time_in_force TEXT DEFAULT 'GTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.broker_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broker orders"
  ON public.broker_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_broker_orders_user ON public.broker_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_orders_broker ON public.broker_orders(broker_id, status);

-- ---------------------------------------------------------------------------
-- broker_positions: broker-agnostic position tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  quantity DECIMAL(20,8) NOT NULL,
  average_entry_price DECIMAL(20,8) NOT NULL,
  current_price DECIMAL(20,8),
  unrealized_pnl DECIMAL(20,8),
  realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

ALTER TABLE public.broker_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broker positions"
  ON public.broker_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_broker_positions_user ON public.broker_positions(user_id, status);

-- ---------------------------------------------------------------------------
-- broker_balances: balance snapshots per broker
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  total DECIMAL(20,8) NOT NULL,
  available DECIMAL(20,8) NOT NULL,
  locked DECIMAL(20,8) NOT NULL DEFAULT 0,
  total_equity_usd DECIMAL(20,8),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_balances_user ON public.broker_balances(user_id, broker_id, snapshot_at DESC);

-- ---------------------------------------------------------------------------
-- broker_transactions: fill/trade log per broker
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_id TEXT NOT NULL,
  order_id UUID REFERENCES public.broker_orders(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity DECIMAL(20,8) NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  fee DECIMAL(20,8) NOT NULL DEFAULT 0,
  fee_currency TEXT NOT NULL DEFAULT 'USD',
  realized_pnl DECIMAL(20,8),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.broker_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broker transactions"
  ON public.broker_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_broker_transactions_user ON public.broker_transactions(user_id, executed_at DESC);

-- ---------------------------------------------------------------------------
-- broker_failures: error log for debugging and monitoring
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  broker_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  retryable BOOLEAN DEFAULT false,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_failures_broker ON public.broker_failures(broker_id, occurred_at DESC);
