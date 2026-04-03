-- Create demo data for bot configuration and P&L tracking

-- Insert demo bot configuration
INSERT INTO public.bot_config (
    user_id,
    capital_cad,
    risk_per_trade,
    daily_stop_loss,
    max_positions,
    is_active,
    notification_enabled,
    mode,
    symbols,
    retraining_frequency
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    100.00,
    0.5,
    2.0,
    4,
    false,
    true,
    'paper',
    ARRAY['BTCUSD', 'ETHUSD'],
    'daily'
) ON CONFLICT (user_id) DO UPDATE SET
    capital_cad = EXCLUDED.capital_cad,
    risk_per_trade = EXCLUDED.risk_per_trade,
    daily_stop_loss = EXCLUDED.daily_stop_loss,
    max_positions = EXCLUDED.max_positions,
    updated_at = now();

-- Insert demo daily P&L record
INSERT INTO public.daily_pnl (
    user_id,
    date,
    total_pnl,
    total_trades,
    win_rate,
    starting_balance,
    ending_balance,
    realized_pnl,
    unrealized_pnl,
    winning_trades,
    losing_trades,
    risk_used,
    max_drawdown
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    CURRENT_DATE,
    2.50,
    8,
    62.5,
    100.00,
    102.50,
    2.50,
    0.00,
    5,
    3,
    1.2,
    -0.8
) ON CONFLICT (user_id, date) DO UPDATE SET
    total_pnl = EXCLUDED.total_pnl,
    total_trades = EXCLUDED.total_trades,
    win_rate = EXCLUDED.win_rate,
    ending_balance = EXCLUDED.ending_balance,
    realized_pnl = EXCLUDED.realized_pnl,
    unrealized_pnl = EXCLUDED.unrealized_pnl,
    winning_trades = EXCLUDED.winning_trades,
    losing_trades = EXCLUDED.losing_trades,
    risk_used = EXCLUDED.risk_used,
    max_drawdown = EXCLUDED.max_drawdown;

-- Insert demo notification settings
INSERT INTO public.notification_settings (
    user_id,
    telegram_enabled,
    email_enabled,
    daily_reports,
    trade_alerts,
    risk_alerts,
    performance_summary,
    email_address,
    telegram_chat_id
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    false,
    false,
    true,
    true,
    true,
    true,
    'demo@cloudatlasbot.com',
    '123456789'
) ON CONFLICT (user_id) DO UPDATE SET
    updated_at = now();

-- Insert system health monitoring data
INSERT INTO public.system_health (service_name, status, response_time_ms, checked_at) VALUES
('Kraken API', 'healthy', 120, now()),
('ML Model', 'healthy', 45, now()),
('WebSocket Feed', 'healthy', 25, now()),
('Risk Engine', 'healthy', 35, now()),
('Notification Service', 'healthy', 89, now());

-- Insert some trading logs for demo
SELECT public.log_trading_event(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'INFO',
    'SYSTEM',
    'Trading bot initialized successfully',
    '{"version": "1.0", "mode": "demo"}'::jsonb
);

SELECT public.log_trading_event(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'INFO',
    'MARKET_DATA',
    'Real-time data feed connected',
    '{"exchange": "kraken", "symbols": ["BTCUSD", "ETHUSD"]}'::jsonb
);