/**
 * Admin tasks that must work inside the deployed container.
 *
 * Deliberately plain JavaScript with no imports beyond Node's own modules.
 * The TypeScript versions of these scripts need a TypeScript runner, and
 * relying on one being present in the runtime image turned out to be fragile —
 * a deploy without it leaves you unable to create the first accounts, with the
 * app already live and nobody able to sign in.
 *
 *   node scripts/admin.mjs seed
 *   node scripts/admin.mjs set-password pastor 'new-password'
 *   node scripts/admin.mjs set-role volunteer admin
 *   node scripts/admin.mjs list
 *
 * The password hashing here must stay byte-compatible with lib/password.ts.
 * tests/unit/admin-script.test.ts fails if the two ever drift apart.
 */

import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

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

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
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
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.some((c) => c.name === "role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  }
  return db;
}

function seed(db) {
  const wanted = [
    ["volunteer", "Volunteer", "member", process.env.QTP_SEED_VOLUNTEER_PW],
    ["pastor", "Pastor", "admin", process.env.QTP_SEED_PASTOR_PW],
  ];

  console.log("\nAccounts");
  for (const [username, display, role, supplied] of wanted) {
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      console.log(`  ${username.padEnd(10)} already exists — left alone`);
      continue;
    }
    const password = supplied ?? generatedPassword();
    db.prepare(
      "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
    ).run(username, display, hashPassword(password), role);

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

function setPassword(db, username, supplied) {
  const user = db.prepare("SELECT id, username FROM users WHERE username = ?").get(username);
  if (!user) return missing(db, username);

  const password = supplied ?? generatedPassword();
  if (password.length < 8) {
    console.error("\nThat password is too short. Use at least 8 characters.\n");
    process.exit(1);
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(password),
    user.id,
  );
  console.log(`\nPassword updated for ${user.username}.`);
  if (!supplied) console.log(`New password: ${password}`);
  console.log("Existing sessions stay signed in; rotate QTP_SESSION_SECRET to end them.\n");
}

function setRole(db, username, role) {
  if (role !== "admin" && role !== "member") {
    console.error("\nRole must be 'admin' or 'member'.\n");
    process.exit(1);
  }
  const user = db.prepare("SELECT id, username, role FROM users WHERE username = ?").get(username);
  if (!user) return missing(db, username);

  if (role === "member" && user.role === "admin") {
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
    if (n <= 1) {
      console.error(
        "\nThat is the only admin account. Promote someone else first, or nobody " +
          "will be able to delete a bad week.\n",
      );
      process.exit(1);
    }
  }
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
  console.log(`\n${user.username}: ${user.role} -> ${role}\n`);
}

function list(db) {
  const users = db.prepare("SELECT username, role FROM users ORDER BY username").all();
  console.log("\nAccounts");
  if (users.length === 0) console.log("  (none yet — run: node scripts/admin.mjs seed)");
  for (const u of users) console.log(`  ${u.username.padEnd(12)} ${u.role}`);
  console.log();
}

function missing(db, username) {
  const all = db.prepare("SELECT username FROM users").all().map((u) => u.username).join(", ");
  console.error(`\nNo account called "${username}". Existing: ${all || "(none)"}\n`);
  process.exit(1);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const db = open();

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
if (process.argv[1] && process.argv[1].endsWith("admin.mjs")) main();
