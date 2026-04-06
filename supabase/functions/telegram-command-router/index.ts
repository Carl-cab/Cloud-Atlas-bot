import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

function isAuthorized(chatId: string | number): boolean {
  const allowed = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!allowed) return false;
  return String(chatId) === String(allowed);
}

async function handleStart(_chatId: string): Promise<string> {
  return `🤖 <b>CloudAtlasBot</b> is connected.\n\nType /help to see available commands.`;
}

async function handleHelp(_chatId: string): Promise<string> {
  return `📋 <b>Available commands:</b>

/status — bot mode, P&amp;L, positions, last signal
/report — generate and send today's report
/positions — list all open positions
/alerts — latest 10 unresolved incidents
/pause — pause the bot (sets is_active=false)
/resume — resume the bot (paper mode only)
/paper — switch to paper mode and pause

⛔ /live is disabled for safety.`;
}

async function handleStatus(_chatId: string, userId: string): Promise<string> {
  const sb = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  const [configRes, pnlRes, posRes, signalRes] = await Promise.all([
    sb.from('bot_config')
      .select('mode,is_active,capital_cad,daily_stop_loss,max_positions')
      .eq('user_id', userId)
      .maybeSingle(),
    sb.from('daily_pnl')
      .select('total_pnl,win_rate,total_trades')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),
    sb.from('trading_positions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open'),
    sb.from('strategy_signals')
      .select('timestamp,signal_type,confidence')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const cfg = configRes.data;
  const pnl = pnlRes.data;
  const openCount = posRes.count ?? 0;
  const lastSignal = signalRes.data;

  if (!cfg) return '⚠️ Bot config not found for this user.';

  const statusEmoji = cfg.is_active ? '🟢' : '⏸';
  const pnlEmoji = (pnl?.total_pnl ?? 0) >= 0 ? '📈' : '📉';
  const lastSignalTime = lastSignal?.timestamp
    ? new Date(lastSignal.timestamp).toLocaleTimeString()
    : 'N/A';

  return `${statusEmoji} <b>Status — ${cfg.mode.toUpperCase()}</b>

💼 Capital: $${Number(cfg.capital_cad).toFixed(2)}
${pnlEmoji} Daily P&amp;L: $${(pnl?.total_pnl ?? 0).toFixed(2)}
📊 Win rate: ${(pnl?.win_rate ?? 0).toFixed(1)}% (${pnl?.total_trades ?? 0} trades)
📌 Open positions: ${openCount} / ${cfg.max_positions}
🛑 Daily stop loss: ${cfg.daily_stop_loss}%
⚡ Last signal: ${lastSignalTime}`;
}

async function handleReport(_chatId: string, userId: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('notification-engine', {
    body: {
      action: 'generate_report',
      user_id: userId,
      report_type: 'daily',
      send_telegram: true,
      send_email: false,
    },
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
  });
  if (error || !data?.success) {
    return `⚠️ Report generation failed: ${error?.message ?? data?.error ?? 'unknown error'}`;
  }
  return `✅ Daily report sent to Telegram.`;
}

async function handlePositions(_chatId: string, userId: string): Promise<string> {
  const sb = getSupabase();
  const { data: positions, error } = await sb
    .from('trading_positions')
    .select('symbol,side,quantity,entry_price,current_price,unrealized_pnl')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false });

  if (error) return `⚠️ Failed to load positions: ${error.message}`;
  if (!positions || positions.length === 0) return `📭 No open positions.`;

  const lines = positions.map((p: any) => {
    const pnlSign = (p.unrealized_pnl ?? 0) >= 0 ? '+' : '';
    return `• <b>${p.symbol}</b> ${p.side.toUpperCase()} qty=${Number(p.quantity).toFixed(4)} entry=$${Number(p.entry_price).toFixed(2)} cur=$${Number(p.current_price ?? 0).toFixed(2)} uPnL=${pnlSign}$${Number(p.unrealized_pnl ?? 0).toFixed(2)}`;
  });

  return `📌 <b>Open positions (${positions.length}):</b>\n\n${lines.join('\n')}`;
}

async function handleAlerts(_chatId: string, userId: string): Promise<string> {
  const sb = getSupabase();
  const { data: incidents, error } = await sb
    .from('agent_incidents')
    .select('severity,incident_type,title,detected_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('detected_at', { ascending: false })
    .limit(10);

  if (error) return `⚠️ Failed to load alerts: ${error.message}`;
  if (!incidents || incidents.length === 0) return `✅ No open incidents.`;

  const sevEmoji: Record<string, string> = { info: 'ℹ️', warning: '⚠️', critical: '🚨' };
  const lines = incidents.map((i: any) => {
    const emoji = sevEmoji[i.severity] ?? '❗';
    const time = new Date(i.detected_at).toLocaleTimeString();
    return `${emoji} <b>${i.title}</b> (${i.incident_type}) — ${time}`;
  });

  return `🔔 <b>Open incidents (${incidents.length}):</b>\n\n${lines.join('\n')}`;
}

async function handlePause(_chatId: string, userId: string): Promise<string> {
  const sb = getSupabase();
  const { error } = await sb
    .from('bot_config')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return `⚠️ Failed to pause bot: ${error.message}`;
  return `⏸ Bot paused. Use /resume to restart (paper mode only).`;
}

async function handleResume(_chatId: string, userId: string): Promise<string> {
  const sb = getSupabase();
  const { data: cfg } = await sb
    .from('bot_config')
    .select('mode')
    .eq('user_id', userId)
    .maybeSingle();

  if (!cfg) return `⚠️ Bot config not found.`;
  if (cfg.mode !== 'paper') {
    return `⛔ Resume is only allowed in paper mode. Current mode: ${cfg.mode}.\nUse /paper first.`;
  }

  const { error } = await sb
    .from('bot_config')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return `⚠️ Failed to resume bot: ${error.message}`;
  return `🟢 Bot resumed in paper mode.`;
}

async function handlePaper(_chatId: string, userId: string): Promise<string> {
  const sb = getSupabase();
  const { error } = await sb
    .from('bot_config')
    .update({ mode: 'paper', is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return `⚠️ Failed to switch to paper mode: ${error.message}`;
  return `📄 Switched to paper mode. Bot is paused.\nUse /resume to start trading in paper mode.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const message = body?.message;

    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatId = String(message.chat?.id ?? '');
    const text: string = (message.text ?? '').trim();

    if (!isAuthorized(chatId)) {
      console.warn(`Rejected message from unauthorized chat_id: ${chatId}`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = Deno.env.get('TELEGRAM_USER_ID') ?? '';
    if (!userId) {
      await sendTelegram(chatId, `⚠️ TELEGRAM_USER_ID secret not configured on this function.`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const command = text.split(' ')[0].replace(/@.*$/, '').toLowerCase();

    let reply: string;
    switch (command) {
      case '/start':     reply = await handleStart(chatId); break;
      case '/help':      reply = await handleHelp(chatId); break;
      case '/status':    reply = await handleStatus(chatId, userId); break;
      case '/report':    reply = await handleReport(chatId, userId); break;
      case '/positions': reply = await handlePositions(chatId, userId); break;
      case '/alerts':    reply = await handleAlerts(chatId, userId); break;
      case '/pause':     reply = await handlePause(chatId, userId); break;
      case '/resume':    reply = await handleResume(chatId, userId); break;
      case '/paper':     reply = await handlePaper(chatId, userId); break;
      case '/live':
        reply = `⛔ The /live command is disabled for safety. Switch modes via the dashboard.`;
        break;
      default:
        reply = `❓ Unknown command: <code>${command}</code>\n\nType /help to see available commands.`;
    }

    try {
      await sendTelegram(chatId, reply);
    } catch (sendErr) {
      console.error(`Failed to send Telegram reply for command "${command}":`, sendErr instanceof Error ? sendErr.message : String(sendErr));
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('telegram-command-router error:', error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
