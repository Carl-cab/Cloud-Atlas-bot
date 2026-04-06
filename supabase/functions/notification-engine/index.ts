import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface IncidentAlert {
  severity: 'info' | 'warning' | 'critical';
  incident_type: string;
  title: string;
  description?: string;
  mode: string;
  is_active: boolean;
  daily_pnl: number;
  actions_taken: string[];
}

interface NotificationRequest {
  action: 'send_test' | 'generate_report' | 'send_alert' | 'send_incident_alert';
  type?: 'telegram' | 'email';
  user_id: string;
  email?: string;
  message?: string;
  report_type?: string;
  send_telegram?: boolean;
  send_email?: boolean;
  incident?: IncidentAlert;
}

class NotificationEngine {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  // Get decrypted notification settings for a user
  async getSecureNotificationSettings(userId: string): Promise<{ 
    email?: string; 
    telegram_chat_id?: string; 
    settings?: any;
    success: boolean;
  }> {
    try {
      const { data, error } = await this.supabase.functions.invoke('secure-notification-settings', {
        body: { action: 'get_for_notifications' },
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        }
      });

      if (error || !data?.success) {
        console.error('Failed to get secure notification settings:', error || data?.error);
        return { success: false };
      }

      return {
        success: true,
        email: data.email,
        telegram_chat_id: data.telegram_chat_id,
        settings: data.settings
      };
    } catch (error) {
      console.error('Error getting secure notification settings:', error);
      return { success: false };
    }
  }

  // Send Telegram message
  async sendTelegramMessage(message: string, chatId?: string): Promise<boolean> {
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const defaultChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    
    if (!telegramToken) {
      throw new Error('Telegram bot token not configured');
    }

    const targetChatId = chatId || defaultChatId;
    if (!targetChatId) {
      throw new Error('Telegram chat ID not configured');
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Telegram API error: ${error}`);
      }

      return true;
    } catch (error) {
      console.error('Telegram send error:', error);
      throw error;
    }
  }

  // Send email via Resend
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const { data, error } = await resend.emails.send({
        from: 'CloudAtlasBot <notifications@resend.dev>',
        to: [to],
        subject,
        html,
      });

      if (error) {
        throw error;
      }

      console.log('Email sent successfully:', data);
      return true;
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }

  // Generate trading report HTML
  generateReportHTML(stats: any, reportType: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 30px 20px; }
            .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
            .metric { padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center; }
            .metric-value { font-size: 24px; font-weight: bold; color: #333; }
            .metric-label { font-size: 12px; color: #666; margin-top: 5px; }
            .positive { color: #28a745; }
            .negative { color: #dc3545; }
            .warning { color: #ffc107; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
            .alert { padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🤖 CloudAtlasBot ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report</h1>
              <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <div class="content">
              <div class="metric-grid">
                <div class="metric">
                  <div class="metric-value ${stats.daily_pnl >= 0 ? 'positive' : 'negative'}">
                    $${Math.abs(stats.daily_pnl || 0).toFixed(2)}
                  </div>
                  <div class="metric-label">Daily P&L</div>
                </div>
                
                <div class="metric">
                  <div class="metric-value">${(stats.win_rate || 0).toFixed(1)}%</div>
                  <div class="metric-label">Win Rate</div>
                </div>
                
                <div class="metric">
                  <div class="metric-value">$${(stats.portfolio_value || 0).toFixed(2)}</div>
                  <div class="metric-label">Portfolio Value</div>
                </div>
                
                <div class="metric">
                  <div class="metric-value ${stats.risk_score <= 5 ? 'positive' : stats.risk_score <= 7 ? 'warning' : 'negative'}">
                    ${(stats.risk_score || 0).toFixed(1)}/10
                  </div>
                  <div class="metric-label">Risk Score</div>
                </div>
              </div>

              <h3>📊 Trading Summary</h3>
              <ul>
                <li>Total Trades: <strong>${stats.total_trades || 0}</strong></li>
                <li>Successful Trades: <strong>${stats.successful_trades || 0}</strong></li>
                <li>Average Trade Duration: <strong>${stats.avg_trade_duration || 'N/A'}</strong></li>
                <li>Total P&L: <strong class="${stats.total_pnl >= 0 ? 'positive' : 'negative'}">$${(stats.total_pnl || 0).toFixed(2)}</strong></li>
              </ul>

              ${stats.risk_score > 7 ? `
                <div class="alert">
                  <strong>⚠️ Risk Alert:</strong> Your current risk score is ${stats.risk_score}/10, which is considered high. Consider reducing position sizes or reviewing your strategy.
                </div>
              ` : ''}

              <h3>📋 Session Summary</h3>
              <ul>
                <li>Mode: <strong>${stats.mode || 'paper'}</strong> ${stats.is_active ? '(Active)' : '(Paused)'}</li>
                <li>Realized P&L: <strong class="${(stats.realized_pnl || 0) >= 0 ? 'positive' : 'negative'}">$${(stats.realized_pnl || 0).toFixed(2)}</strong></li>
                <li>Unrealized P&L: <strong class="${(stats.unrealized_pnl || 0) >= 0 ? 'positive' : 'negative'}">$${(stats.unrealized_pnl || 0).toFixed(2)}</strong></li>
                <li>Winning trades: <strong>${stats.winning_trades || 0}</strong> / Losing: <strong>${stats.losing_trades || 0}</strong></li>
                <li>Max drawdown: <strong>${(stats.max_drawdown || 0).toFixed(2)}%</strong></li>
                <li>Open positions: <strong>${stats.open_positions || 0}</strong></li>
                <li>Risk events today: <strong>${stats.risk_events || 0}</strong></li>
              </ul>
            </div>
            
            <div class="footer">
              <p>Generated by CloudAtlasBot • ${new Date().toLocaleString()}</p>
              <p>This is an automated report. Trading involves risk and past performance does not guarantee future results.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // Generate Telegram message
  generateTelegramReport(stats: any, reportType: string): string {
    const pnlEmoji = (stats.daily_pnl ?? 0) >= 0 ? '📈' : '📉';
    const statusEmoji = stats.is_active ? '🟢' : '⏸';
    const modeLabel = (stats.mode || 'paper').toUpperCase();

    return `🤖 <b>CloudAtlasBot ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report</b>
📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

${statusEmoji} Mode: <b>${modeLabel}</b> ${stats.is_active ? '(Active)' : '(Paused)'}

💰 <b>P&amp;L:</b>
${pnlEmoji} Daily P&amp;L: <b>$${(stats.daily_pnl || 0).toFixed(2)}</b>
📊 Realized: <b>$${(stats.realized_pnl || 0).toFixed(2)}</b>
📐 Unrealized: <b>$${(stats.unrealized_pnl || 0).toFixed(2)}</b>
💼 Balance: <b>$${(stats.portfolio_value || 0).toFixed(2)}</b>

📈 <b>Trades:</b>
• Total: ${stats.total_trades || 0} | Won: ${stats.winning_trades || 0} | Lost: ${stats.losing_trades || 0}
• Win rate: ${(stats.win_rate || 0).toFixed(1)}%
• Max drawdown: ${(stats.max_drawdown || 0).toFixed(2)}%
• Open positions: ${stats.open_positions || 0}
• Risk events: ${stats.risk_events || 0}

<i>Generated at ${new Date().toLocaleTimeString()}</i>`.trim();
  }

  generateIncidentTelegramAlert(incident: IncidentAlert): string {
    const sevEmoji: Record<string, string> = { info: 'ℹ️', warning: '⚠️', critical: '🚨' };
    const emoji = sevEmoji[incident.severity] || '❗';
    const pnlSign = incident.daily_pnl >= 0 ? '+' : '';
    const actions = incident.actions_taken.length > 0
      ? incident.actions_taken.map(a => `  • ${a}`).join('\n')
      : '  • none';

    return `${emoji} <b>[${incident.severity.toUpperCase()}] ${incident.title}</b>

<b>Type:</b> ${incident.incident_type}
<b>Mode:</b> ${incident.mode.toUpperCase()} ${incident.is_active ? '(Active)' : '(Paused)'}
<b>Daily P&amp;L:</b> ${pnlSign}$${incident.daily_pnl.toFixed(2)}
${incident.description ? `<b>Details:</b> ${incident.description}\n` : ''}<b>Actions taken:</b>
${actions}

<i>${new Date().toLocaleTimeString()}</i>`.trim();
  }

  generateIncidentEmailHTML(incident: IncidentAlert): string {
    const severityColor: Record<string, string> = {
      info: '#17a2b8',
      warning: '#ffc107',
      critical: '#dc3545',
    };
    const color = severityColor[incident.severity] || '#6c757d';
    const actions = incident.actions_taken.length > 0
      ? incident.actions_taken.map(a => `<li>${a}</li>`).join('')
      : '<li>none</li>';

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#f8f9fa}
.container{max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1)}
.header{background:${color};color:white;padding:24px 20px}
.content{padding:24px 20px}.footer{background:#f8f9fa;padding:16px;text-align:center;font-size:12px;color:#666}
.label{font-weight:bold;color:#555}.value{margin-left:6px}</style></head>
<body><div class="container">
<div class="header"><h2>${incident.severity.toUpperCase()}: ${incident.title}</h2></div>
<div class="content">
<p><span class="label">Incident type:</span><span class="value">${incident.incident_type}</span></p>
<p><span class="label">Mode:</span><span class="value">${incident.mode.toUpperCase()} ${incident.is_active ? '(Active)' : '(Paused)'}</span></p>
<p><span class="label">Daily P&amp;L:</span><span class="value">$${incident.daily_pnl.toFixed(2)}</span></p>
${incident.description ? `<p><span class="label">Details:</span><span class="value">${incident.description}</span></p>` : ''}
<h3>Actions taken</h3><ul>${actions}</ul>
<p style="font-size:12px;color:#999">Detected at ${new Date().toLocaleString()}</p>
</div><div class="footer">CloudAtlasBot monitoring system</div>
</div></body></html>`;
  }

  // Get trading statistics from real DB tables
  async getTradingStats(userId: string): Promise<any> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [pnlRes, posRes, riskRes, configRes] = await Promise.all([
        this.supabase
          .from('daily_pnl')
          .select('starting_balance,ending_balance,realized_pnl,unrealized_pnl,total_pnl,total_trades,winning_trades,losing_trades,win_rate,max_drawdown')
          .eq('user_id', userId)
          .eq('date', today)
          .maybeSingle(),

        this.supabase
          .from('trading_positions')
          .select('unrealized_pnl')
          .eq('user_id', userId)
          .eq('status', 'open'),

        this.supabase
          .from('risk_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

        this.supabase
          .from('bot_config')
          .select('mode,is_active,capital_cad')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (pnlRes.error) console.error('daily_pnl query error:', pnlRes.error.message);
      if (posRes.error) console.error('trading_positions query error:', posRes.error.message);
      if (riskRes.error) console.error('risk_events query error:', riskRes.error.message);
      if (configRes.error) console.error('bot_config query error:', configRes.error.message);

      const pnl = pnlRes.data;
      const openPositions = posRes.data ?? [];
      const riskEventsCount = riskRes.count ?? 0;
      const config = configRes.data;

      const unrealizedTotal = openPositions.reduce(
        (sum: number, p: any) => sum + Number(p.unrealized_pnl ?? 0),
        0,
      );

      return {
        starting_balance: Number(pnl?.starting_balance ?? 0),
        ending_balance:   Number(pnl?.ending_balance   ?? config?.capital_cad ?? 0),
        realized_pnl:     Number(pnl?.realized_pnl     ?? 0),
        unrealized_pnl:   unrealizedTotal,
        total_pnl:        Number(pnl?.realized_pnl     ?? 0) + unrealizedTotal,
        daily_pnl:        Number(pnl?.total_pnl        ?? 0),
        total_trades:     Number(pnl?.total_trades      ?? 0),
        winning_trades:   Number(pnl?.winning_trades    ?? 0),
        losing_trades:    Number(pnl?.losing_trades     ?? 0),
        win_rate:         Number(pnl?.win_rate          ?? 0),
        max_drawdown:     Number(pnl?.max_drawdown      ?? 0),
        open_positions:   openPositions.length,
        risk_events:      riskEventsCount,
        portfolio_value:  Number(pnl?.ending_balance    ?? config?.capital_cad ?? 0),
        mode:             config?.mode                  ?? 'paper',
        is_active:        config?.is_active             ?? false,
      };
    } catch (error) {
      console.error('Error fetching trading stats:', error);
      // Return zero-filled defaults so callers don't render undefined
      return {
        starting_balance: 0, ending_balance: 0, realized_pnl: 0,
        unrealized_pnl: 0, total_pnl: 0, daily_pnl: 0,
        total_trades: 0, winning_trades: 0, losing_trades: 0,
        win_rate: 0, max_drawdown: 0, open_positions: 0,
        risk_events: 0, portfolio_value: 0,
        mode: 'paper', is_active: false,
      };
    }
  }

  // Log notification event
  async logNotification(userId: string, type: string, status: string, details: any): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notification_logs')
        .insert({
          user_id: userId,
          notification_type: type,
          status,
          details,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error logging notification:', error);
      }
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: NotificationRequest = await req.json();
    const engine = new NotificationEngine();

    switch (request.action) {
      case 'send_test': {
        if (request.type === 'telegram') {
          const message = request.message || 'This is a test notification from CloudAtlasBot! 🤖';
          await engine.sendTelegramMessage(message);
          
          await engine.logNotification(request.user_id, 'test_telegram', 'sent', { message });
          
          return new Response(JSON.stringify({
            success: true,
            message: 'Test Telegram message sent successfully'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (request.type === 'email' && request.email) {
          const subject = 'Test Email from CloudAtlasBot';
          const html = `
            <h2>🤖 CloudAtlasBot Test Email</h2>
            <p>This is a test email to verify your notification settings are working correctly.</p>
            <p><strong>Message:</strong> ${request.message || 'Default test message'}</p>
            <p><em>Sent at: ${new Date().toLocaleString()}</em></p>
            <hr>
            <p style="color: #666; font-size: 12px;">This email was sent from CloudAtlasBot notification system.</p>
          `;
          
          await engine.sendEmail(request.email, subject, html);
          
          await engine.logNotification(request.user_id, 'test_email', 'sent', { 
            email: request.email, 
            message: request.message 
          });
          
          return new Response(JSON.stringify({
            success: true,
            message: 'Test email sent successfully'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        throw new Error('Invalid test notification type or missing parameters');
      }

      case 'generate_report': {
        const stats = await engine.getTradingStats(request.user_id);
        const reportType = request.report_type || 'daily';
        
        // Get secure notification settings
        const userSettings = await engine.getSecureNotificationSettings(request.user_id);
        if (!userSettings.success) {
          throw new Error('Failed to retrieve user notification settings');
        }
        
        const results = [];

        if (request.send_telegram && userSettings.settings?.telegram_enabled && userSettings.telegram_chat_id) {
          const telegramMessage = engine.generateTelegramReport(stats, reportType);
          await engine.sendTelegramMessage(telegramMessage, userSettings.telegram_chat_id);
          results.push('telegram');
          
          await engine.logNotification(request.user_id, `${reportType}_report_telegram`, 'sent', { stats });
        }

        if (request.send_email && userSettings.settings?.email_enabled && userSettings.email) {
          const subject = `CloudAtlasBot ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;
          const html = engine.generateReportHTML(stats, reportType);
          
          await engine.sendEmail(userSettings.email, subject, html);
          results.push('email');
          
          await engine.logNotification(request.user_id, `${reportType}_report_email`, 'sent', { 
            email_masked: userSettings.email.substring(0, 3) + '***@***', 
            stats 
          });
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Report generated and sent via: ${results.join(', ')}`,
          sent_to: results
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'send_alert': {
        // This would be called by other systems to send real-time alerts
        const alertMessage = request.message || 'Trading alert from CloudAtlasBot';
        
        // Get secure notification settings
        const userSettings = await engine.getSecureNotificationSettings(request.user_id);
        if (!userSettings.success) {
          throw new Error('Failed to retrieve user notification settings');
        }
        
        if (request.send_telegram && userSettings.settings?.telegram_enabled && userSettings.telegram_chat_id) {
          await engine.sendTelegramMessage(`🚨 <b>Alert:</b> ${alertMessage}`, userSettings.telegram_chat_id);
        }

        if (request.send_email && userSettings.settings?.email_enabled && userSettings.email) {
          const html = `
            <h2>🚨 CloudAtlasBot Alert</h2>
            <p><strong>${alertMessage}</strong></p>
            <p><em>Time: ${new Date().toLocaleString()}</em></p>
          `;
          await engine.sendEmail(userSettings.email, 'CloudAtlasBot Alert', html);
        }

        await engine.logNotification(request.user_id, 'alert', 'sent', { message: alertMessage });

        return new Response(JSON.stringify({
          success: true,
          message: 'Alert sent successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'send_incident_alert': {
        if (!request.incident) {
          throw new Error('Missing incident payload for send_incident_alert');
        }
        const inc = request.incident;

        const userSettings = await engine.getSecureNotificationSettings(request.user_id);
        if (!userSettings.success) {
          throw new Error('Failed to retrieve user notification settings');
        }

        const sent: string[] = [];

        if (userSettings.settings?.telegram_enabled && userSettings.telegram_chat_id) {
          const msg = engine.generateIncidentTelegramAlert(inc);
          await engine.sendTelegramMessage(msg, userSettings.telegram_chat_id);
          sent.push('telegram');
        }

        if (userSettings.settings?.email_enabled && userSettings.email) {
          const subject = `[${inc.severity.toUpperCase()}] ${inc.title}`;
          const html = engine.generateIncidentEmailHTML(inc);
          await engine.sendEmail(userSettings.email, subject, html);
          sent.push('email');
        }

        await engine.logNotification(request.user_id, 'incident_alert', 'sent', {
          severity: inc.severity,
          incident_type: inc.incident_type,
          sent_via: sent,
        });

        return new Response(JSON.stringify({ success: true, sent_via: sent }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

  } catch (error) {
    console.error('Notification Engine Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});