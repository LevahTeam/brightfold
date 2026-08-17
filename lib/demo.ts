import { cookies } from "next/headers";
import { readdirSync, statSync, rmSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runWithDb, getDb, closeDb } from "./db";
import { hashPassword } from "./password";
import type { User } from "./types";

/**
 * Demo mode.
 *
 * Set DEMO_MODE=1 and the app runs as a public, sign-in-free showcase. It is
 * meant to be deployed as its own instance: the real records are not in that
 * process at all, so no bug here can expose them.
 *
 * Each visitor gets a private database seeded with obviously fictional data,
 * so they can add kids, correct cells and print cards without disturbing
 * anyone else's copy.
 */

export const DEMO_MODE = process.env.DEMO_MODE === "1";

export const DEMO_COOKIE = "qtp_demo";

/** Old visitor databases are swept after this long. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function demoRoot(): string {
  const base = process.env.QT_DB_PATH
    ? path.dirname(process.env.QT_DB_PATH)
    : path.join(process.cwd(), "data");
  return path.join(base, "demo");
}

/** Visitor ids come from middleware; never trust one as a filename unchecked. */
export function isValidDemoId(id: string | undefined): id is string {
  return typeof id === "string" && /^[a-f0-9]{16,64}$/i.test(id);
}

export function demoDbPath(id: string): string {
  return path.join(demoRoot(), `${id}.db`);
}

/** The synthetic account a demo visitor is signed in as. */
export const DEMO_USER: User = {
  id: -1,
  username: "demo",
  display_name: "Demo visitor",
  role: "admin",
};

/**
 * The database for this request: the visitor's own file in demo mode, or the
 * real one otherwise.
 */
export async function resolveDbPath(): Promise<string | null> {
  if (!DEMO_MODE) return null;
  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!isValidDemoId(id)) return null;
  return demoDbPath(id);
}

/**
 * Run `fn` against the right database for this request.
 *
 * Every page and route goes through this. Outside demo mode it is a
 * pass-through, so normal operation is unchanged.
 */
export async function withRequestDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dbPath = await resolveDbPath();
  if (!dbPath) return fn();

  if (!existsSync(dbPath)) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    // Drop any stale handle from a previous copy at this path before seeding.
    closeDb(dbPath);
    runWithDb(dbPath, () => seedDemoData());
    sweepOldDemos();
  }
  return runWithDb(dbPath, fn);
}

/** Delete this visitor's database so their next request starts fresh. */
export function resetDemo(id: string): void {
  if (!isValidDemoId(id)) return;
  const dbPath = demoDbPath(id);
  // Close before deleting, or the cached handle keeps writing to the removed
  // file and the reseed fails on rows only that handle can still see.
  closeDb(dbPath);
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

/** Remove databases from visitors who have long since left. */
function sweepOldDemos(): void {
  const root = demoRoot();
  if (!existsSync(root)) return;
  const cutoff = Date.now() - MAX_AGE_MS;
  try {
    for (const file of readdirSync(root)) {
      const full = path.join(root, file);
      if (statSync(full).mtimeMs >= cutoff) continue;
      if (full.endsWith(".db")) closeDb(full);
      rmSync(full, { force: true });
    }
  } catch {
    /* a sweep failure must never break a page load */
  }
}

/**
 * Fictional data for a fresh demo.
 *
 * Every name here is invented. Nothing from a real class is used, which is the
 * whole point — a public demo must not carry a real child's name.
 */
function seedDemoData(): void {
  const db = getDb();

  db.prepare(
    "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
  ).run("demo", "Demo visitor", hashPassword("demo-not-a-real-account"), "admin");

  db.prepare("INSERT INTO grades (name, sort_order) VALUES (?, ?)").run("5th Grade", 50);
  db.prepare("INSERT INTO grades (name, sort_order) VALUES (?, ?)").run("4th Grade", 40);

  const grade5 = 1;
  const grade4 = 2;

  const classes: [number, string, string][] = [
    [grade5, "A 5-1 (Sample)", "Ms. Rivera"],
    [grade5, "A 5-2 (Sample)", "Mr. Okafor"],
    [grade4, "A 4-1 (Sample)", "Ms. Lindqvist"],
  ];
  for (const [gradeId, label, teacher] of classes) {
    db.prepare(
      "INSERT INTO classes (grade_id, label, teacher_name, sort_order) VALUES (?, ?, ?, ?)",
    ).run(gradeId, label, teacher, 10);
  }

  // Eight Sundays, so the grid is wide enough to show the running total and
  // the horizontal scroll doing their job.
  const weeks = [
    ["9/7", "2025-09-07"],
    ["9/14", "2025-09-14"],
    ["9/21", "2025-09-21"],
    ["9/28", "2025-09-28"],
    ["10/5", "2025-10-05"],
    ["10/12", "2025-10-12"],
    ["10/19", "2025-10-19"],
    ["10/26", "2025-10-26"],
  ];
  for (const gradeId of [grade5, grade4]) {
    weeks.forEach(([label, date], i) => {
      db.prepare(
        "INSERT INTO weeks (grade_id, label, attendance_date, sort_order) VALUES (?, ?, ?, ?)",
      ).run(gradeId, label, date, (i + 1) * 10);
    });
  }

  const roster: [number, string, string | null][] = [
    [1, "Amelia Fontaine", "폰테인"],
    [1, "Noah Berhane", null],
    [1, "Priya Raghunathan", "라구나탄"],
    [1, "Tomas Iglesias", "이글레시아스"],
    [1, "Wren Kowalczyk", null],
    [2, "Ida Sørensen", "쇠렌센"],
    [2, "Kofi Mensah", null],
    [2, "Lucia Marchetti", "마르케티"],
    [3, "Hana Takahashi", "다카하시"],
    [3, "Elias Nkemdirim", null],
  ];

  for (const [classId, english, korean] of roster) {
    db.prepare(
      "INSERT INTO kids (class_id, english_name, korean_name, sort_order) VALUES (?, ?, ?, ?)",
    ).run(classId, english, korean, 10);
  }

  // A believable spread: most weeks attended, a few missed, page counts that
  // vary the way real ones do.
  const kids = db.prepare("SELECT id, class_id FROM kids").all() as {
    id: number;
    class_id: number;
  }[];
  const weekRows = db.prepare("SELECT id, grade_id FROM weeks").all() as {
    id: number;
    grade_id: number;
  }[];

  let n = 0;
  for (const kid of kids) {
    const gradeId = kid.class_id === 3 ? grade4 : grade5;
    for (const week of weekRows.filter((w) => w.grade_id === gradeId)) {
      n += 1;
      const absent = n % 7 === 0;
      const pages = absent ? 0 : [3, 5, 6, 4, 7, 5, 8, 6][n % 8];
      db.prepare(
        `INSERT INTO entries (kid_id, week_id, attendance, qt_pages, updated_by)
         VALUES (?, ?, ?, ?, 'demo')`,
      ).run(kid.id, week.id, absent ? "ABSENT" : "HERE", pages);
    }
  }
}
