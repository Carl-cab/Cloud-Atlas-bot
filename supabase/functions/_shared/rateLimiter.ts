// Rate limiting utility for Supabase Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (request: Request) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  message?: string;
}

export class RateLimiter {
  private supabase: any;

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  async checkRateLimit(
    request: Request,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const key = config.keyGenerator ? 
      config.keyGenerator(request) : 
      this.getClientIP(request);
    
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Clean up old entries
    await this.cleanupOldEntries(key, windowStart);
    
    // Get current count
    const { data: entries, error } = await this.supabase
      .from('rate_limit_entries')
      .select('*')
      .eq('key', key)
      .gte('timestamp', windowStart);

    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true, remaining: config.max, resetTime: now + config.windowMs };
    }

    const currentCount = entries?.length || 0;
    
    if (currentCount >= config.max) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + config.windowMs,
        message: config.message
      };
    }

    // Record this request
    await this.supabase
      .from('rate_limit_entries')
      .insert({
        key,
        timestamp: now,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || ''
      });

    return {
      allowed: true,
      remaining: config.max - currentCount - 1,
      resetTime: now + config.windowMs
    };
  }

  private async cleanupOldEntries(key: string, windowStart: number): Promise<void> {
    await this.supabase
      .from('rate_limit_entries')
      .delete()
      .eq('key', key)
      .lt('timestamp', windowStart);
  }

  private getClientIP(request: Request): string {
    return request.headers.get('x-forwarded-for') ||
           request.headers.get('x-real-ip') ||
           request.headers.get('cf-connecting-ip') ||
           'unknown';
  }
}

// Predefined rate limit configurations
export const rateLimitConfigs = {
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later'
  },
  auth: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: 'Too many login attempts, please try again later',
    keyGenerator: (request: Request) => {
      const body = request.body;
      return `auth:${request.headers.get('x-forwarded-for') || 'unknown'}`;
    }
  },
  trading: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many trading requests, please slow down'
  }
};

export async function applyRateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<Response | null> {
  const rateLimiter = new RateLimiter();
  const result = await rateLimiter.checkRateLimit(request, config);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: result.message,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': config.max.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.toString(),
          'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString()
        }
      }
    );
  }

  return null; // Rate limit passed
}