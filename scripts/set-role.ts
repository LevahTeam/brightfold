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

import { execute, queryAll, queryOne } from "../lib/db";

const [username, role] = process.argv.slice(2);

if (!username || (role !== "admin" && role !== "member")) {
  console.error(
    "\nUsage: npx tsx scripts/set-role.ts <username> <admin|member>\n\n" +
      "Example: npx tsx scripts/set-role.ts pastor admin\n",
  );
  process.exit(1);
}

const user = await queryOne<{ id: number; username: string; role: string }>(
  "SELECT id, username, role FROM users WHERE username = ?",
  username.trim(),
);

if (!user) {
  const all = (await queryAll<{ username: string }>("SELECT username FROM users"))
    .map((u) => u.username)
    .join(", ");
  console.error(`\nNo account called "${username}". Existing accounts: ${all || "(none)"}\n`);
  process.exit(1);
}

if (role === "member") {
  const admins = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'",
  );
  if (user.role === "admin" && (admins?.n ?? 0) <= 1) {
    console.error(
      "\nThat is the only admin account. Promoting someone else first avoids " +
        "leaving nobody able to delete a bad week.\n",
    );
    process.exit(1);
  }
}

await execute("UPDATE users SET role = ? WHERE id = ?", role, user.id);
console.log(`\n${user.username}: ${user.role} -> ${role}\n`);
