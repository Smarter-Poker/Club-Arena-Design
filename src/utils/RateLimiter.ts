/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RATE LIMITER — Client-side sliding window rate limiting
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Prevents abuse by rate-limiting actions on the client side.
 * Configurable per-action limits with sliding window.
 *
 * Usage:
 *   const limiter = new RateLimiter();
 *   const result = limiter.check('buy_in', userId, 5, 60000); // 5 per minute
 *   if (!result.allowed) {
 *     toast.warning(`Too many requests — try again in ${Math.ceil(result.retryAfterMs / 1000)}s`);
 *   }
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  total: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRESET LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

export const RATE_LIMITS = {
  BUY_IN: { maxPerWindow: 5, windowMs: 60_000 }, // 5 per minute
  WITHDRAW: { maxPerWindow: 3, windowMs: 60_000 }, // 3 per minute
  SEND_CHIPS: { maxPerWindow: 3, windowMs: 60_000 }, // 3 per minute
  TABLE_JOIN: { maxPerWindow: 10, windowMs: 60_000 }, // 10 per minute
  CHAT_MESSAGE: { maxPerWindow: 20, windowMs: 60_000 }, // 20 per minute
  REPORT_PLAYER: { maxPerWindow: 3, windowMs: 300_000 }, // 3 per 5 minutes
  CREDIT_REQUEST: { maxPerWindow: 5, windowMs: 300_000 }, // 5 per 5 minutes
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of expired entries every 60s
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Check if an action is allowed under rate limits
   */
  check(action: string, userId: string, maxPerWindow: number, windowMs: number): RateLimitResult {
    const key = `${action}:${userId}`;
    const now = Date.now();
    const entry = this.entries.get(key) || { timestamps: [] };

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxPerWindow) {
      // Rate limited — calculate retry time
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = windowMs - (now - oldestInWindow);

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, retryAfterMs),
        total: maxPerWindow,
      };
    }

    // Allowed — record this request
    entry.timestamps.push(now);
    this.entries.set(key, entry);

    return {
      allowed: true,
      remaining: maxPerWindow - entry.timestamps.length,
      retryAfterMs: 0,
      total: maxPerWindow,
    };
  }

  /**
   * Check using preset limits
   */
  checkPreset(action: RateLimitAction, userId: string): RateLimitResult {
    const limit = RATE_LIMITS[action];
    return this.check(action, userId, limit.maxPerWindow, limit.windowMs);
  }

  /**
   * Reset rate limit for a specific action/user
   */
  reset(action: string, userId: string): void {
    this.entries.delete(`${action}:${userId}`);
  }

  /**
   * Reset all rate limits for a user
   */
  resetUser(userId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.entries.keys()) {
      if (key.endsWith(`:${userId}`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.entries.delete(key);
    }
  }

  /**
   * Get current usage for an action/user
   */
  getUsage(action: string, userId: string, windowMs: number): number {
    const key = `${action}:${userId}`;
    const entry = this.entries.get(key);
    if (!entry) return 0;

    const now = Date.now();
    return entry.timestamps.filter((t) => now - t < windowMs).length;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 600_000; // 10 minutes max
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.entries.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < maxAge);
      if (entry.timestamps.length === 0) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.entries.delete(key);
    }
  }

  /**
   * Dispose — clear cleanup timer
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.entries.clear();
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

export default rateLimiter;
