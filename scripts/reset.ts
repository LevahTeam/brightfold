/**
 * Destroys the database and re-seeds it.
 *
 * Guarded deliberately: this sits one character away from `db:seed` in
 * package.json, and running it by mistake would permanently delete a term's
 * worth of real children's records. It always takes a backup first and
 * refuses to proceed without an explicit --yes.
 *
 *   npx tsx scripts/reset.ts --yes [--demo]
 */

import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { backupDatabase } from "./backup";
import { queryOne } from "../lib/db";

const DB_PATH =
  process.env.QT_DB_PATH ?? path.join(process.cwd(), "data", "qt-passport.db");

const confirmed = process.argv.includes("--yes");

if (process.env.TURSO_DATABASE_URL?.trim()) {
  console.error(
    "\nnpm run db:reset deletes the local database file, but TURSO_DATABASE_URL is\n" +
      "set, so this project is pointed at a hosted database. Nothing was changed.\n\n" +
      "To wipe the hosted database, use Turso directly:\n" +
      "  turso db shell <name> \"DROP TABLE IF EXISTS entries;\"  (and so on)\n",
  );
  process.exit(1);
}

if (existsSync(DB_PATH)) {
  const counts = (await queryOne<{ kids: number; entries: number }>(
    `SELECT (SELECT COUNT(*) FROM kids WHERE archived = 0) AS kids,
            (SELECT COUNT(*) FROM entries) AS entries`,
  ))!;

  if (!confirmed) {
    console.error(
      `\nThis would permanently delete ${counts.kids} kids and ${counts.entries} entries.\n` +
        `\n  ${DB_PATH}\n` +
        `\nIf that is really what you want, run it again with --yes:\n` +
        `  npm run db:reset -- --yes\n` +
        `\nTo keep the data and just take a copy, run:\n` +
        `  npm run db:backup\n`,
    );
    process.exit(1);
  }

  if (counts.kids > 0 || counts.entries > 0) {
    await backupDatabase("pre-reset");
  }
}

for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${DB_PATH}${suffix}`, { force: true });
}
console.log("Database deleted.");

const args = ["tsx", "scripts/seed.ts", ...(process.argv.includes("--demo") ? ["--demo"] : [])];
const result = spawnSync("npx", args, { stdio: "inherit" });
process.exit(result.status ?? 0);
