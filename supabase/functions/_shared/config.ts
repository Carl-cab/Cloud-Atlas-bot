// Shared configuration for all edge functions
// Accesses Supabase secrets instead of .env variables

export interface TradingConfig {
  jwtSecret: string;
  dbUrl: string;
  exchange: {
    apiKey: string;
    secret: string;
  };
  email: {
    sendgridApiKey: string;
    fromEmail: string;
  };
  telegram: {
    botToken: string;
    chatId: string;
  };
}

export function getConfig(): TradingConfig {
  return {
    jwtSecret: Deno.env.get('JWT_SECRET') || '',
    dbUrl: Deno.env.get('SUPABASE_DB_URL') || '',
    exchange: {
      apiKey: Deno.env.get('BINANCE_API_KEY') || '',
      secret: Deno.env.get('BINANCE_SECRET') || '',
    },
    email: {
      sendgridApiKey: Deno.env.get('SENDGRID_API_KEY') || '',
      fromEmail: Deno.env.get('EMAIL_FROM') || 'trading@yourapp.com',
    },
    telegram: {
      botToken: Deno.env.get('TELEGRAM_BOT_TOKEN') || '',
      chatId: Deno.env.get('TELEGRAM_CHAT_ID') || '',
    },
  };
}

export function validateConfig(config: TradingConfig): void {
  const requiredFields = [
    { key: 'jwtSecret', value: config.jwtSecret },
    { key: 'dbUrl', value: config.dbUrl },
    { key: 'exchange.apiKey', value: config.exchange.apiKey },
    { key: 'exchange.secret', value: config.exchange.secret },
  ];

  const missing = requiredFields.filter(field => !field.value);
  
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.map(f => f.key).join(', ')}`);
  }
}