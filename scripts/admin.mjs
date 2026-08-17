/**
 * Admin tasks, run against whichever database this project points at.
 *
 * Deliberately plain JavaScript: the TypeScript versions need a TypeScript
 * runner, and relying on one being present in a deployed image turned out to be
 * fragile — a deploy without it leaves you unable to create the first accounts,
 * with the app already live and nobody able to sign in.
 *
 * Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to manage the hosted database
 * from your own machine; with neither set it uses the local file. This is the
 * only way to manage accounts on Vercel, where there is no shell to log in to.
 *
 *   node scripts/admin.mjs seed
 *   node scripts/admin.mjs set-password pastor 'new-password'
 *   node scripts/admin.mjs set-role volunteer admin
 *   node scripts/admin.mjs list
 *
 * The password hashing here must stay byte-compatible with lib/password.ts.
 * tests/unit/admin-script.test.ts fails if the two ever drift apart.
 */

import { createClient } from "@libsql/client";
import { scryptSync, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const HOSTED = process.env.TURSO_DATABASE_URL?.trim();
const DB_PATH = process.env.QT_DB_PATH ?? path.join(process.cwd(), "data", "qt-passport.db");

/** Same format lib/password.ts writes and reads: scrypt$<salt b64>$<hash b64>. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function generatedPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars = [...randomBytes(16)].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

async function open() {
  let db;
  if (HOSTED) {
    db = createClient({ url: HOSTED, authToken: process.env.TURSO_AUTH_TOKEN?.trim() });
  } else {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = createClient({ url: `file:${DB_PATH}` });
    await db.execute("PRAGMA journal_mode = WAL");
  }
  await db.execute("PRAGMA foreign_keys = ON");
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // A database created before roles existed has no role column.
  const cols = await db.execute("PRAGMA table_info(users)");
  if (!cols.rows.some((c) => c.name === "role")) {
    await db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  }
  return db;
}

/** Small helpers so the commands below read the way they did before. */
const one = async (db, sql, ...args) => (await db.execute({ sql, args })).rows[0] ?? null;
const all = async (db, sql, ...args) => (await db.execute({ sql, args })).rows;
const run = async (db, sql, ...args) => db.execute({ sql, args });

async function seed(db) {
  const wanted = [
    ["volunteer", "Volunteer", "member", process.env.QTP_SEED_VOLUNTEER_PW],
    ["pastor", "Pastor", "admin", process.env.QTP_SEED_PASTOR_PW],
  ];

  console.log("\nAccounts");
  for (const [username, display, role, supplied] of wanted) {
    const existing = await one(db, "SELECT id FROM users WHERE username = ?", username);
    if (existing) {
      console.log(`  ${username.padEnd(10)} already exists — left alone`);
      continue;
    }
    const password = supplied ?? generatedPassword();
    await run(
      db,
      "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
      username,
      display,
      hashPassword(password),
      role,
    );

    const tag = role === "admin" ? "admin — can delete" : "can log sheets, cannot delete";
    if (supplied) {
      console.log(`  ${username.padEnd(10)} created (${tag}; password you supplied)`);
    } else {
      console.log(`  ${username.padEnd(10)} created (${tag})`);
      console.log(`  ${" ".repeat(10)} PASSWORD: ${password}`);
    }
  }
  console.log("\nWrite any printed passwords down now — they are not shown again.\n");
}

async function setPassword(db, username, supplied) {
  const user = await one(db, "SELECT id, username FROM users WHERE username = ?", username);
  if (!user) return await missing(db, username);

  const password = supplied ?? generatedPassword();
  if (password.length < 8) {
    console.error("\nThat password is too short. Use at least 8 characters.\n");
    process.exit(1);
  }
  await run(db, "UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), user.id);
  console.log(`\nPassword updated for ${user.username}.`);
  if (!supplied) console.log(`New password: ${password}`);
  console.log("Existing sessions stay signed in; rotate QTP_SESSION_SECRET to end them.\n");
}

async function setRole(db, username, role) {
  if (role !== "admin" && role !== "member") {
    console.error("\nRole must be 'admin' or 'member'.\n");
    process.exit(1);
  }
  const user = await one(db, "SELECT id, username, role FROM users WHERE username = ?", username);
  if (!user) return await missing(db, username);

  if (role === "member" && user.role === "admin") {
    const { n } = await one(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
    if (n <= 1) {
      console.error(
        "\nThat is the only admin account. Promote someone else first, or nobody " +
          "will be able to delete a bad week.\n",
      );
      process.exit(1);
    }
  }
  await run(db, "UPDATE users SET role = ? WHERE id = ?", role, user.id);
  console.log(`\n${user.username}: ${user.role} -> ${role}\n`);
}

async function list(db) {
  const users = await all(db, "SELECT username, role FROM users ORDER BY username");
  console.log("\nAccounts");
  if (users.length === 0) console.log("  (none yet — run: node scripts/admin.mjs seed)");
  for (const u of users) console.log(`  ${u.username.padEnd(12)} ${u.role}`);
  console.log();
}

async function missing(db, username) {
  const names = (await all(db, "SELECT username FROM users")).map((u) => u.username).join(", ");
  console.error(`\nNo account called "${username}". Existing: ${names || "(none)"}\n`);
  process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const db = await open();

  switch (command) {
    case "seed":
      return seed(db);
    case "set-password":
      if (!rest[0]) return usage();
      return setPassword(db, rest[0], rest[1]);
    case "set-role":
      if (!rest[0] || !rest[1]) return usage();
      return setRole(db, rest[0], rest[1]);
    case "list":
      return list(db);
    default:
      return usage();
  }
}

function usage() {
  console.error(
    "\nUsage:\n" +
      "  node scripts/admin.mjs seed\n" +
      "  node scripts/admin.mjs set-password <username> [password]\n" +
      "  node scripts/admin.mjs set-role <username> <admin|member>\n" +
      "  node scripts/admin.mjs list\n",
  );
  process.exit(1);
}

// Only run when invoked directly, so the test can import hashPassword.
if (process.argv[1] && process.argv[1].endsWith("admin.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
