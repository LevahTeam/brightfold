import { createHash } from "node:crypto";
import { execute, queryOne, tx } from "./db";

/**
 * Database-backed login throttling.
 *
 * A public serverless deployment can run many short-lived processes. An
 * in-memory counter resets on cold starts and differs between instances, so it
 * cannot enforce a real lockout. This table-backed version is shared by every
 * instance and stores only a one-way hash of the client address.
 */

interface Bucket {
  hits: number;
  reset_at: number;
  blocked_until: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const BLOCK_MS = 30 * 60 * 1000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining: number;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function checkLoginRate(
  key: string,
  now = Date.now(),
): Promise<RateLimitResult> {
  const keyHash = hashKey(key);

  return tx(async () => {
    await execute(
      "DELETE FROM login_rate_limits WHERE reset_at < ? AND blocked_until < ?",
      now,
      now,
    );

    const bucket = await queryOne<Bucket>(
      "SELECT hits, reset_at, blocked_until FROM login_rate_limits WHERE key_hash = ?",
      keyHash,
    );

    if (bucket?.blocked_until && bucket.blocked_until > now) {
      return {
        allowed: false,
        retryAfter: Math.ceil((bucket.blocked_until - now) / 1000),
        remaining: 0,
      };
    }

    if (!bucket || bucket.reset_at < now) {
      await execute(
        `INSERT INTO login_rate_limits
           (key_hash, hits, reset_at, blocked_until, updated_at)
         VALUES (?, 1, ?, 0, datetime('now'))
         ON CONFLICT (key_hash) DO UPDATE SET
           hits = 1,
           reset_at = excluded.reset_at,
           blocked_until = 0,
           updated_at = excluded.updated_at`,
        keyHash,
        now + WINDOW_MS,
      );
      return { allowed: true, retryAfter: 0, remaining: MAX_ATTEMPTS - 1 };
    }

    const hits = bucket.hits + 1;
    const blockedUntil = hits > MAX_ATTEMPTS ? now + BLOCK_MS : 0;
    await execute(
      `UPDATE login_rate_limits
          SET hits = ?, blocked_until = ?, updated_at = datetime('now')
        WHERE key_hash = ?`,
      hits,
      blockedUntil,
      keyHash,
    );

    if (blockedUntil) {
      return { allowed: false, retryAfter: Math.ceil(BLOCK_MS / 1000), remaining: 0 };
    }
    return { allowed: true, retryAfter: 0, remaining: MAX_ATTEMPTS - hits };
  });
}

export async function clearLoginRate(key: string): Promise<void> {
  await execute("DELETE FROM login_rate_limits WHERE key_hash = ?", hashKey(key));
}

/** Test and maintenance hook. */
export async function resetAllLoginRates(): Promise<void> {
  await execute("DELETE FROM login_rate_limits");
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
