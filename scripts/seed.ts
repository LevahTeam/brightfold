/**
 * Creates the two accounts and, with --demo, a small set of obviously-fake
 * sample data so the app can be clicked through before any real sheet exists.
 *
 *   node --experimental-strip-types scripts/seed.ts
 *   node --experimental-strip-types scripts/seed.ts --demo
 *
 * Passwords come from QTP_SEED_VOLUNTEER_PW / QTP_SEED_PASTOR_PW when set,
 * otherwise a random one is generated and printed once. Deliberately no
 * default password — this app holds children's names.
 */

import { randomBytes } from "node:crypto";
import { execute, queryOne } from "../lib/db";
import { hashPassword } from "../lib/password";
import { createGrade, createClass, upsertWeek, upsertKid, setEntry } from "../lib/repo";

const demo = process.argv.includes("--demo");

function generatedPassword(): string {
  // Readable but not guessable: 4 groups of 4 base32-ish chars.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

async function seedUser(
  username: string,
  displayName: string,
  envVar: string,
  role: "admin" | "member",
): Promise<void> {
  const existing = await queryOne("SELECT id FROM users WHERE username = ?", username);
  if (existing) {
    console.log(`  ${username.padEnd(10)} already exists — left alone`);
    return;
  }
  const supplied = process.env[envVar];
  const password = supplied ?? generatedPassword();
  await execute(
    "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
    username,
    displayName,
    hashPassword(password),
    role,
  );

  const tag = role === "admin" ? "admin" : "can log sheets, cannot delete";
  if (supplied) {
    console.log(`  ${username.padEnd(10)} created (${tag}; password from ${envVar})`);
  } else {
    console.log(`  ${username.padEnd(10)} created (${tag}) — password: ${password}`);
  }
}

async function main(): Promise<void> {
  console.log("\nAccounts");
  // The pastor is the admin: only that account can delete a week or remove a
  // child. The volunteer can log sheets and correct entries.
  await seedUser("volunteer", "Volunteer", "QTP_SEED_VOLUNTEER_PW", "member");
  await seedUser("pastor", "Pastor", "QTP_SEED_PASTOR_PW", "admin");

  if (demo) {
    console.log("\nDemo data");
    const grade = await createGrade("5th Grade", 50);
    const cls = await createClass(grade.id, "A 5-1 (Demo)", "Ms. Demo Teacher", 10);

    const weekLabels: [string, string][] = [
      ["8/31", "2025-08-31"],
      ["9/7", "2025-09-07"],
      ["9/14", "2025-09-14"],
    ];
    const weeks = [];
    for (const [label, date] of weekLabels) {
      weeks.push(await upsertWeek(grade.id, label, date));
    }

    const kids: [string, string | null, (number | null)[]][] = [
      ["Sample Kid One", "샘플원", [6, 5, null]],
      ["Sample Kid Two", "샘플투", [null, 7, 7]],
      ["Sample Kid Three", null, [4, 4, 6]],
      // Deliberately never edited by any test, so its total (6) is a stable
      // fixture for assertions no matter what order the suites run in.
      ["Sample Kid Stable", "샘플안정", [1, 2, 3]],
    ];

    for (const [english, korean, pages] of kids) {
      const { id } = await upsertKid(cls.id, english, korean);
      for (const [i, pg] of pages.entries()) {
        await setEntry(id, weeks[i].id, pg === null ? "ABSENT" : "HERE", pg ?? 0, "seed");
      }
    }
    console.log(`  ${grade.name} / ${cls.label}: ${kids.length} kids, ${weeks.length} weeks`);
  }

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
