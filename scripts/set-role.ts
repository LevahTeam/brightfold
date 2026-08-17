/**
 * Change an account's role.
 *
 *   npx tsx scripts/set-role.ts pastor admin
 *   npx tsx scripts/set-role.ts volunteer member
 *
 * 'admin' may delete weeks and remove children; 'member' may do everything
 * else. Existing databases created before roles existed default everyone to
 * admin on upgrade, so nobody loses access unexpectedly — use this to narrow
 * that down afterwards.
 */

import { getDb } from "../lib/db";

const [username, role] = process.argv.slice(2);

if (!username || (role !== "admin" && role !== "member")) {
  console.error(
    "\nUsage: npx tsx scripts/set-role.ts <username> <admin|member>\n\n" +
      "Example: npx tsx scripts/set-role.ts pastor admin\n",
  );
  process.exit(1);
}

const db = getDb();
const user = db.prepare("SELECT id, username, role FROM users WHERE username = ?").get(
  username.trim(),
) as { id: number; username: string; role: string } | undefined;

if (!user) {
  const all = (db.prepare("SELECT username FROM users").all() as { username: string }[])
    .map((u) => u.username)
    .join(", ");
  console.error(`\nNo account called "${username}". Existing accounts: ${all || "(none)"}\n`);
  process.exit(1);
}

if (role === "member") {
  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as {
    n: number;
  };
  if (user.role === "admin" && admins.n <= 1) {
    console.error(
      "\nThat is the only admin account. Promoting someone else first avoids " +
        "leaving nobody able to delete a bad week.\n",
    );
    process.exit(1);
  }
}

db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
console.log(`\n${user.username}: ${user.role} -> ${role}\n`);
