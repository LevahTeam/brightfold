/**
 * Login throttling.
 *
 * On a LAN this barely mattered. On a public URL it does: two accounts with
 * human-chosen passwords behind an unthrottled login form is a guessable
 * target, and scrypt is deliberately slow enough that unbounded attempts are
 * also a cheap way to peg the CPU.
 *
 * In-memory on purpose — one process, two users, and a restart clearing the
 * counters is an acceptable trade for having no dependency.
 */

interface Bucket {
  hits: number;
  /** When the current window ends (ms since epoch). */
  resetAt: number;
  /** Set once a bucket trips, so the block outlives the window it tripped in. */
  blockedUntil: number;
}

/** How long failures are counted for. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
/**
 * Deliberately longer than the counting window. If the two were equal, a
 * lockout would lapse the moment its own window rolled over, and an attacker
 * could simply retry in bursts forever.
 */
const BLOCK_MS = 30 * 60 * 1000;

const buckets = new Map<string, Bucket>();

/** Drop stale buckets so a long-running process does not grow unbounded. */
function sweep(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, b] of buckets) {
    if (b.resetAt < now && b.blockedUntil < now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may try again. Only meaningful when blocked. */
  retryAfter: number;
  remaining: number;
}

export function checkLoginRate(key: string, now = Date.now()): RateLimitResult {
  sweep(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    if (bucket && bucket.blockedUntil > now) {
      return {
        allowed: false,
        retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
        remaining: 0,
      };
    }
    buckets.set(key, { hits: 1, resetAt: now + WINDOW_MS, blockedUntil: 0 });
    return { allowed: true, retryAfter: 0, remaining: MAX_ATTEMPTS - 1 };
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
      remaining: 0,
    };
  }

  bucket.hits += 1;
  if (bucket.hits > MAX_ATTEMPTS) {
    bucket.blockedUntil = now + BLOCK_MS;
    return { allowed: false, retryAfter: Math.ceil(BLOCK_MS / 1000), remaining: 0 };
  }

  return { allowed: true, retryAfter: 0, remaining: MAX_ATTEMPTS - bucket.hits };
}

/** Called after a correct password, so one success clears the counter. */
export function clearLoginRate(key: string): void {
  buckets.delete(key);
}

/** Test hook. */
export function resetAllLoginRates(): void {
  buckets.clear();
}

/**
 * Best-effort client identity. Behind a proxy the first `x-forwarded-for` hop
 * is the real client; direct connections fall back to a single shared bucket,
 * which still bounds total attempts.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
