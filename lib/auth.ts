import { timingSafeEqual, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { queryOne } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { ConfigError } from "./errors";
import { DEMO_MODE, DEMO_USER } from "./demo";
import type { User } from "./types";

export { hashPassword, verifyPassword };

const COOKIE_NAME = "qtp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/**
 * A signed cookie carries the session instead of a database row. The app has
 * only two users and does not need individual remote revocation; rotating
 * QTP_SESSION_SECRET remains available when every session must be invalidated.
 */
function secret(): string {
  const s = process.env.QTP_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new ConfigError(
      "QTP_SESSION_SECRET is not set (or is too short). Generate one with " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` +
        " and put it in .env.local, then restart.",
    );
  }
  return s;
}

interface SessionPayload {
  uid: number;
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(userId: number): string {
  const payload: SessionPayload = { uid: userId, exp: Date.now() + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const a = Buffer.from(mac);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.uid !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- request-side

export async function getCurrentUser(): Promise<User | null> {
  // The demo has no sign-in: every visitor is the same synthetic admin, and
  // the data they see is their own private copy.
  if (DEMO_MODE) return DEMO_USER;

  const store = await cookies();
  const payload = readSessionToken(store.get(COOKIE_NAME)?.value);
  if (!payload) return null;

  return queryOne<User>(
    "SELECT id, username, display_name, role FROM users WHERE id = ?",
    payload.uid,
  );
}

/** Require a signed-in user before a route reads or changes children's data. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

/** Raised when a signed-in user lacks the role an action requires. */
export class ForbiddenError extends Error {
  constructor(message = "Only the pastor's account can do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws unless the signed-in user is an admin. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}

/**
 * Determine whether this request reached the app through HTTPS.
 *
 * NODE_ENV is not enough here. The pastor may open
 * `http://192.168.1.x:3000` from a phone on the church network, and browsers
 * reject Secure cookies sent over plain HTTP to non-localhost hosts. Login
 * would seem successful, then immediately return to the login screen. Reading
 * the forwarded protocol keeps local HTTP working while enabling Secure as
 * soon as an HTTPS proxy is added.
 */
async function requestIsHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
  return false;
}

export async function setSessionCookie(userId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: await requestIsHttps(),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Fixed fallback hash that makes unknown users cost roughly as much as bad passwords. */
const DUMMY_HASH = hashPassword("qt-passport-constant-time-placeholder");

export function authenticate(username: string, password: string): User | null {
  const row = queryOne<User & { password_hash: string }>(
    "SELECT id, username, display_name, role, password_hash FROM users WHERE username = ?",
    username.trim(),
  );

  if (!row) {
    verifyPassword(password, DUMMY_HASH);
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) return null;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
  };
}

export { COOKIE_NAME };
