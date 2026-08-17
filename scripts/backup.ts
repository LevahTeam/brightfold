/**
 * Write a timestamped database copy under data/backups/.
 *
 * Entries are replaced in place, with neither an undo command nor a history
 * table, so these copies provide the recovery path. Run the command on a
 * schedule during the ministry year and before destructive maintenance.
 *
 *   npx tsx scripts/backup.ts
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execute } from "../lib/db";

/** These commands act on a local file; a hosted database has no such file. */
function refuseIfHosted(command: string): void {
  if (process.env.TURSO_DATABASE_URL?.trim()) {
    console.error(
      `\n${command} works on the local database file, but TURSO_DATABASE_URL is set,\n` +
        "so this project is pointed at a hosted database. Nothing was changed.\n\n" +
        "For the hosted database use Turso's own tooling:\n" +
        "  turso db shell <name> .dump > backup.sql\n",
    );
    process.exit(1);
  }
}

const DB_PATH =
  process.env.QT_DB_PATH ?? path.join(process.cwd(), "data", "qt-passport.db");

/**
 * Where copies go. Point QTP_BACKUP_DIR at a Google Drive or iCloud folder and
 * every backup syncs off this machine automatically — which matters here,
 * because the live database is the only copy and it lives on one computer.
 */
function backupDir(): string {
  const configured = process.env.QTP_BACKUP_DIR?.trim();
  if (configured) return configured.replace(/^~(?=$|\/)/, homedir());
  return path.join(path.dirname(DB_PATH), "backups");
}

export async function backupDatabase(label = "manual"): Promise<string | null> {
  refuseIfHosted("npm run db:backup");

  if (!existsSync(DB_PATH)) {
    console.log(`No database at ${DB_PATH} — nothing to back up.`);
    return null;
  }

  // Flush WAL changes before copying; otherwise, the .db file may omit recent
  // writes that still live in its -wal companion.
  try {
    await execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (err) {
    console.warn(`Could not checkpoint the WAL (${(err as Error).message}); copying anyway.`);
  }

  const dir = backupDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(
      `Could not write to ${dir} (${(err as Error).message}).\n` +
        "Check QTP_BACKUP_DIR in .env.local, or unset it to use data/backups/.",
    );
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(dir, `qt-passport-${stamp}-${label}.db`);
  copyFileSync(DB_PATH, dest);

  const size = (statSync(dest).size / 1024).toFixed(0);
  console.log(`Backed up to ${dest} (${size} KB)`);
  return dest;
}

function listRecent(): void {
  const dir = backupDir();
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith(".db")).sort().reverse();
  if (files.length > 1) {
    console.log(`\n${files.length} backups on disk. Most recent:`);
    for (const f of files.slice(0, 5)) console.log(`  ${f}`);
  }
}

// Keep imports side-effect free so `db:reset` can call the function itself.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await backupDatabase(process.argv[2] ?? "manual");
  listRecent();
}
