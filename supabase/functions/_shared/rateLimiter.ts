// Rate limiting utility for Supabase Edge Functions
//
// PHASE 1 FIX: IP Spoofing Prevention
//
// The original implementation trusted the x-forwarded-for header unconditionally,
// allowing any caller to set an arbitrary value and bypass rate limits entirely.
//
// The fix applies a defence-in-depth strategy:
//   1. For authenticated requests, rate-limit by verified user_id (unforgeable).
//   2. For unauthenticated requests (e.g., auth endpoints), use the LAST IP in
//      x-forwarded-for (the one appended by the Supabase/Cloudflare edge, which
//      the client cannot control), not the first (which the client can forge).
//   3. Validate the extracted IP against a strict IPv4/IPv6 regex before use;
//      fall back to 'unknown' if it does not match.
//   4. The keyGenerator in each config may override this with a user_id-based key
//      for authenticated endpoints.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (request: Request, userId?: string) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  message?: string;
}

// Strict IP validation — accepts IPv4 and IPv6 only
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$/;

function validateIP(ip: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  return IP_REGEX.test(trimmed) ? trimmed : null;
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
    config: RateLimitConfig,
    userId?: string
  ): Promise<RateLimitResult> {
    // PHASE 1 FIX: If a verified userId is provided (from JWT), use it as the
    // rate-limit key. This is unforgeable and scopes limits per user, not per IP.
    const key = config.keyGenerator
      ? config.keyGenerator(request, userId)
      : userId
        ? `user:${userId}`
        : this.getClientIP(request);

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
      // Fail open on DB errors to avoid blocking legitimate traffic,
      // but log for monitoring
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
    try {
      await this.supabase
        .from('rate_limit_entries')
        .insert({
          key,
          timestamp: now,
        });
    } catch (insertErr) {
      console.error('Rate limit insert error (non-fatal):', insertErr);
    }

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

  // PHASE 1 FIX: Extract the LAST IP in x-forwarded-for, not the first.
  //
  // The x-forwarded-for header is a comma-separated list of IPs appended by
  // each proxy in the chain: "client-ip, proxy1-ip, edge-ip".
  // The CLIENT controls the leftmost value (trivially forgeable).
  // The RIGHTMOST value is appended by the Supabase/Cloudflare edge and
  // cannot be forged by the client.
  //
  // We also validate the extracted IP against a strict regex to prevent
  // header injection attacks (e.g., "127.0.0.1, evil-value\r\nHeader: x").
  private getClientIP(request: Request): string {
    const xForwardedFor = request.headers.get('x-forwarded-for');
    if (xForwardedFor) {
      const ips = xForwardedFor.split(',');
      // Use the last (rightmost) IP — appended by the trusted edge proxy
      const lastIP = ips[ips.length - 1]?.trim() ?? null;
      const validated = validateIP(lastIP);
      if (validated) return validated;
    }

    // cf-connecting-ip is set by Cloudflare and is reliable when behind CF
    const cfIP = validateIP(request.headers.get('cf-connecting-ip'));
    if (cfIP) return cfIP;

    // x-real-ip is set by nginx/load balancers; validate before trusting
    const realIP = validateIP(request.headers.get('x-real-ip'));
    if (realIP) return realIP;

    return 'unknown';
  }
}

// Predefined rate limit configurations
// PHASE 1 FIX: auth and trading configs now accept userId for key generation
export const rateLimitConfigs = {
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests, please try again later'
    // No keyGenerator: defaults to user_id when provided, IP otherwise
  },
  auth: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: 'Too many login attempts, please try again later',
    // Auth endpoints are unauthenticated by definition; use validated IP
    keyGenerator: (request: Request, _userId?: string) => {
      const xForwardedFor = request.headers.get('x-forwarded-for');
      if (xForwardedFor) {
        const ips = xForwardedFor.split(',');
        const lastIP = ips[ips.length - 1]?.trim() ?? null;
        const validated = lastIP && IP_REGEX.test(lastIP) ? lastIP : null;
        if (validated) return `auth:${validated}`;
      }
      return `auth:unknown`;
    }
  },
  trading: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many trading requests, please slow down',
    // Trading is always authenticated; scope by user_id
    keyGenerator: (_request: Request, userId?: string) =>
      userId ? `trading:${userId}` : `trading:unknown`
  }
};

export async function applyRateLimit(
  request: Request,
  config: RateLimitConfig,
  userId?: string
): Promise<Response | null> {
  const rateLimiter = new RateLimiter();
  const result = await rateLimiter.checkRateLimit(request, config, userId);

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
