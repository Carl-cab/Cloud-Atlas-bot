-- Create a demo user profile with proper UUID and fix immediate issues
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'demo@cloudatlasbot.com',
    crypt('demo123456', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"display_name": "Demo User", "email": "demo@cloudatlasbot.com"}'
) ON CONFLICT (id) DO NOTHING;

-- Create bot config for demo user
INSERT INTO public.bot_config (
    user_id,
    capital_cad,
    risk_per_trade,
    daily_stop_loss,
    max_positions,
    is_active
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    100.00,
    0.5,
    2.0,
    4,
    false
) ON CONFLICT (user_id) DO UPDATE SET
    capital_cad = EXCLUDED.capital_cad,
    risk_per_trade = EXCLUDED.risk_per_trade,
    daily_stop_loss = EXCLUDED.daily_stop_loss,
    max_positions = EXCLUDED.max_positions,
    updated_at = now();

-- Create initial daily P&L record
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
    0.00,
    0,
    0.00,
    100.00,
    100.00,
    0.00,
    0.00,
    0,
    0,
    0.00,
    0.00
) ON CONFLICT (user_id, date) DO NOTHING;