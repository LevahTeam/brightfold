import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The whole app runs off one SQLite file. Two users share it, so writes are
 * rare and contention is a non-issue; WAL keeps reads from blocking the
 * occasional write anyway.
 *
 * node:sqlite is built into Node 22+, so there is no native module to compile.
 */

const DB_PATH =
  process.env.QT_DB_PATH ?? path.join(process.cwd(), "data", "qt-passport.db");

/**
 * Which database file the current request is talking to.
 *
 * Normally there is exactly one. Demo mode gives every visitor their own file
 * so they can edit freely without touching anyone else's copy, and this is how
 * a request says which one it means. Unset falls back to DB_PATH.
 */
const currentDbPath = new AsyncLocalStorage<string>();

/** Open handles, keyed by file path. */
const instances = new Map<string, DatabaseSync>();

/**
 * Cap on simultaneously open demo databases. Each visitor's file stays open
 * after their first request, so without a ceiling a busy demo would leak file
 * handles until the process ran out.
 */
const MAX_OPEN = 24;

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

/** Run `fn` against a specific database file. */
export function runWithDb<T>(dbPath: string, fn: () => T): T {
  return currentDbPath.run(dbPath, fn);
}

/**
 * Forget an open handle.
 *
 * Deleting a database file is not enough on its own: the cached handle still
 * refers to the deleted file, so later reads and writes go to a file nobody
 * can see. Demo resets delete the file, so they have to close it here too.
 */
export function closeDb(dbPath: string): void {
  const open = instances.get(dbPath);
  if (!open) return;
  try {
    open.close();
  } catch {
    /* already closed */
  }
  instances.delete(dbPath);
}

/** The file the current request is using. */
export function activeDbPath(): string {
  return currentDbPath.getStore() ?? DB_PATH;
}

export function getDb(): DatabaseSync {
  const dbPath = activeDbPath();

  const open = instances.get(dbPath);
  if (open) return open;

  // Evict the oldest handle rather than growing without limit. Map iterates in
  // insertion order, so the first key is the least recently opened.
  if (instances.size >= MAX_OPEN) {
    const oldest = instances.keys().next().value;
    if (oldest && oldest !== DB_PATH) {
      try {
        instances.get(oldest)?.close();
      } catch {
        /* already closed */
      }
      instances.delete(oldest);
    }
  }

  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  migrate(db);
  instances.set(dbPath, db);
  return db;
}

/**
 * Changes to tables that already exist.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a database created by an older
 * version, so a new column has to be added explicitly or existing installs
 * break on upgrade.
 */
function migrate(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "role")) {
    // Existing installs predate roles. Everyone becomes an admin so nobody is
    // locked out of something they could do yesterday; the seed then sets the
    // intended roles for fresh installs.
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  }
}

/**
 * node:sqlite hands back rows with a null prototype. React Server Components
 * refuse to serialize those across the server/client boundary ("Only plain
 * objects ... can be passed to Client Components"), so every read goes through
 * these helpers and comes back as a plain object.
 */
export function queryAll<T>(sql: string, ...params: unknown[]): T[] {
  const rows = getDb()
    .prepare(sql)
    .all(...(params as never[]));
  return rows.map((r) => ({ ...r })) as T[];
}

export function queryOne<T>(sql: string, ...params: unknown[]): T | null {
  const row = getDb()
    .prepare(sql)
    .get(...(params as never[]));
  return row === undefined ? null : ({ ...row } as T);
}

/** Run `fn` inside a transaction, rolling back on any throw. */
export function tx<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    // A failing ROLLBACK must not replace the error that caused it — that
    // would turn a clear "duplicate name" into an opaque SQLite message.
    try {
      db.exec("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[qt-passport] rollback failed after an error:", rollbackErr);
    }
    throw err;
  }
}
