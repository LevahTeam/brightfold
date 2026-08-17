import { createClient, type Client, type InValue, type Transaction } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

/**
 * The app talks to libSQL, which is SQLite with a network option.
 *
 * That gives one code path for two very different deployments:
 *
 *   local / Fly demo   file:./data/qt-passport.db   a plain file on disk
 *   Vercel             libsql://…turso.io           a hosted database
 *
 * Vercel is the reason for the second. Serverless functions get a throwaway
 * filesystem, so a SQLite file there is wiped between invocations — the site
 * would look fine and lose every record silently. A hosted database is the
 * only way for the deployed app to keep anything.
 *
 * The cost of a network database is that every query is asynchronous, which is
 * why everything below returns a promise.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  -- 'admin' can delete; 'member' can log sheets and correct entries.
  role          TEXT NOT NULL DEFAULT 'member',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grades (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_id     INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  teacher_name TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (grade_id, label)
);

CREATE TABLE IF NOT EXISTS kids (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id      INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  english_name  TEXT NOT NULL,
  korean_name   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Name matching is case-insensitive within a class, which is what makes the
-- "same kid, new photo" merge work without creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS kids_class_name_unique
  ON kids (class_id, english_name COLLATE NOCASE);

-- Weeks belong to a grade: every class in a grade shares the same week
-- columns, mirroring the pastor's master sheet layout.
CREATE TABLE IF NOT EXISTS weeks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_id        INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  attendance_date TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (grade_id, label)
);

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  week_id    INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  attendance TEXT NOT NULL CHECK (attendance IN ('HERE', 'ABSENT')),
  qt_pages   INTEGER NOT NULL DEFAULT 0 CHECK (qt_pages >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  UNIQUE (kid_id, week_id)
);

CREATE INDEX IF NOT EXISTS entries_week_idx ON entries (week_id);
CREATE INDEX IF NOT EXISTS entries_kid_idx  ON entries (kid_id);
CREATE INDEX IF NOT EXISTS kids_class_idx   ON kids (class_id);
CREATE INDEX IF NOT EXISTS classes_grade_idx ON classes (grade_id);
CREATE INDEX IF NOT EXISTS weeks_grade_idx  ON weeks (grade_id);
`;

/** Where this process talks by default. */
function defaultUrl(): string {
  const hosted = process.env.TURSO_DATABASE_URL?.trim();
  if (hosted) return hosted;
  const file = process.env.QT_DB_PATH ?? path.join(process.cwd(), "data", "qt-passport.db");
  return file.startsWith("file:") ? file : `file:${file}`;
}

/**
 * Which database the current request is talking to.
 *
 * Normally there is exactly one. The demo gives every visitor their own so
 * they can edit freely without touching anyone else's copy, and this is how a
 * request says which one it means.
 */
const currentDbUrl = new AsyncLocalStorage<string>();

/**
 * The transaction a request is currently inside, if any.
 *
 * libSQL hands back a transaction as its own object, so a query sent to the
 * client instead of that object would quietly execute outside the transaction
 * and survive a rollback. Carrying it here means the helpers below route to
 * the right place on their own, and callers inside `tx` need no special care.
 */
const currentTx = new AsyncLocalStorage<Transaction>();

/** Connections, keyed by url. Opening is async, so the promise is cached. */
const clients = new Map<string, Promise<Client>>();

/**
 * Cap on simultaneously open demo databases. Each visitor's connection stays
 * open after their first request, so without a ceiling a busy demo would leak
 * connections until the process ran out.
 */
const MAX_OPEN = 24;

/** The database the current request is using. */
export function activeDbUrl(): string {
  return currentDbUrl.getStore() ?? defaultUrl();
}

/** Run `fn` against a specific database. */
export function runWithDb<T>(url: string, fn: () => T): T {
  return currentDbUrl.run(url.startsWith("file:") ? url : `file:${url}`, fn);
}

/**
 * Forget a connection.
 *
 * Deleting a database file is not enough on its own: the cached connection
 * still refers to the deleted file, so later reads and writes go somewhere
 * nobody can see. Demo resets delete the file, so they close it here too.
 */
export async function closeDb(url: string): Promise<void> {
  const key = url.startsWith("file:") ? url : `file:${url}`;
  const pending = clients.get(key);
  if (!pending) return;
  clients.delete(key);
  try {
    (await pending).close();
  } catch {
    /* already closed */
  }
}

async function connect(url: string): Promise<Client> {
  const token = process.env.TURSO_AUTH_TOKEN?.trim();
  // A token is meaningless for a local file and libSQL rejects the pairing.
  const client = url.startsWith("file:")
    ? createClient({ url })
    : createClient({ url, authToken: token });

  if (url.startsWith("file:")) {
    // Local files get the pragmas that make concurrent use safe. A hosted
    // database manages its own journalling and rejects these.
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(SCHEMA);
  await migrate(client);
  return client;
}

export function getDb(): Promise<Client> {
  const url = activeDbUrl();

  const open = clients.get(url);
  if (open) return open;

  // Evict the oldest connection rather than growing without limit. Map
  // iterates in insertion order, so the first key is the least recently opened.
  if (clients.size >= MAX_OPEN) {
    const oldest = clients.keys().next().value;
    if (oldest && oldest !== defaultUrl()) void closeDb(oldest);
  }

  const pending = connect(url).catch((err) => {
    // A failed connection must not be cached, or every later request reuses
    // the same rejection and the app never recovers.
    clients.delete(url);
    throw err;
  });
  clients.set(url, pending);
  return pending;
}

/**
 * Changes to tables that already exist.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a database created by an older
 * version, so a new column has to be added explicitly or existing installs
 * break on upgrade.
 */
async function migrate(client: Client): Promise<void> {
  const info = await client.execute("PRAGMA table_info(users)");
  const hasRole = info.rows.some((r) => (r as { name?: unknown }).name === "role");
  if (!hasRole) {
    // Existing installs predate roles. Everyone becomes an admin so nobody is
    // locked out of something they could do yesterday; the seed then sets the
    // intended roles for fresh installs.
    await client.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  }
}

/** Whichever of the connection or the open transaction a query belongs to. */
async function runner(): Promise<Client | Transaction> {
  return currentTx.getStore() ?? (await getDb());
}

export async function queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await (await runner()).execute({ sql, args: params as InValue[] });
  return res.rows.map((r) => ({ ...r })) as T[];
}

export async function queryOne<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  const res = await (await runner()).execute({ sql, args: params as InValue[] });
  const row = res.rows[0];
  return row === undefined ? null : ({ ...row } as T);
}

export interface WriteResult {
  /** Narrowed from libSQL's bigint, which no caller here needs. */
  lastInsertRowid: number;
  rowsAffected: number;
}

export async function execute(sql: string, ...params: unknown[]): Promise<WriteResult> {
  const res = await (await runner()).execute({ sql, args: params as InValue[] });
  return {
    lastInsertRowid: res.lastInsertRowid === undefined ? 0 : Number(res.lastInsertRowid),
    rowsAffected: res.rowsAffected,
  };
}

/**
 * Run `fn` inside a transaction, rolling back on any throw.
 *
 * Nested calls join the outer transaction rather than opening a second one,
 * which would deadlock against the write lock the first already holds.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (currentTx.getStore()) return fn();

  const db = await getDb();
  const transaction = await db.transaction("write");
  try {
    const result = await currentTx.run(transaction, fn);
    await transaction.commit();
    return result;
  } catch (err) {
    // A failing rollback must not replace the error that caused it — that
    // would turn a clear "duplicate name" into an opaque database message.
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error("[qt-passport] rollback failed after an error:", rollbackErr);
    }
    throw err;
  }
}
