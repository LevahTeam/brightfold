/**
 * Change an account's password.
 *
 * The only supported way to recover a forgotten login. Hand-editing the
 * password_hash column is the alternative, and it is easy to get subtly wrong.
 *
 *   npx tsx scripts/set-password.ts volunteer 'the-new-password'
 *
 * Omit the password to have one generated and printed.
 */

import { randomBytes } from "node:crypto";
import { getDb } from "../lib/db";
import { hashPassword } from "../lib/password";

const [username, supplied] = process.argv.slice(2);

if (!username) {
  console.error(
    "\nUsage: npx tsx scripts/set-password.ts <username> [new-password]\n\n" +
      "Example: npx tsx scripts/set-password.ts pastor 'a-long-unique-password'\n",
  );
  process.exit(1);
}

const db = getDb();
const user = db
  .prepare("SELECT id, username FROM users WHERE username = ?")
  .get(username.trim()) as { id: number; username: string } | undefined;

if (!user) {
  const all = (db.prepare("SELECT username FROM users").all() as { username: string }[])
    .map((u) => u.username)
    .join(", ");
  console.error(`\nNo account called "${username}". Existing accounts: ${all || "(none)"}\n`);
  process.exit(1);
}

function generated(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars = [...randomBytes(16)].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

const password = supplied ?? generated();

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
