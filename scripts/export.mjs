/**
 * Write the whole database out as a plain SQL file you can keep.
 *
 * Works against either database, chosen the same way the app chooses:
 *
 *   node scripts/export.mjs                          # the local file
 *   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/export.mjs
 *
 * This exists because `npm run db:backup` copies the local .db file, and a
 * hosted database has no such file to copy. Turso keeps its own point-in-time
 * backups, but those live in the same account as the data — a copy you hold
 * yourself is the one that survives losing access to that account.
 *
 * The output is ordinary SQL: restore it into a fresh database, or just read
 * it. Run it at the end of each term.
 */

import { createClient } from "@libsql/client";
import { writeFileSync } from "node:fs";
import path from "node:path";

const HOSTED = process.env.TURSO_DATABASE_URL?.trim();
const DB_PATH = process.env.QT_DB_PATH ?? path.join(process.cwd(), "data", "qt-passport.db");

// Parents before children, so restoring in this order never breaks a foreign key.
const TABLES = ["users", "grades", "classes", "kids", "weeks", "entries"];

const quote = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const db = HOSTED
  ? createClient({ url: HOSTED, authToken: process.env.TURSO_AUTH_TOKEN?.trim() })
  : createClient({ url: `file:${DB_PATH}` });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = process.argv[2] ?? `qt-passport-${stamp}.sql`;

const lines = [
  `-- QT Passport export, ${new Date().toISOString()}`,
  `-- Source: ${HOSTED ? HOSTED.replace(/\/\/.*@/, "//") : DB_PATH}`,
  "PRAGMA foreign_keys = OFF;",
  "BEGIN TRANSACTION;",
];

let total = 0;
for (const table of TABLES) {
  let rows;
  try {
    rows = (await db.execute(`SELECT * FROM ${table}`)).rows;
  } catch {
    console.warn(`  ${table}: not present, skipped`);
    continue;
  }
  console.log(`  ${table.padEnd(9)} ${rows.length}`);
  total += rows.length;
  for (const row of rows) {
    const cols = Object.keys(row);
    lines.push(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => quote(row[c])).join(", ")});`,
    );
  }
}

lines.push("COMMIT;", "PRAGMA foreign_keys = ON;", "");
writeFileSync(out, lines.join("\n"));
console.log(`\n${total} rows written to ${out}\n`);
console.log("This file contains real names. Keep it somewhere you would keep a paper register.\n");
