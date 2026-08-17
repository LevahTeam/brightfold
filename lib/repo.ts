import { getDb, tx, queryAll, queryOne } from "./db";
import type {
  Attendance,
  ClassRow,
  Grade,
  Kid,
  RecordsKidRow,
  Week,
} from "./types";

// ------------------------------------------------------------------ grades

export function listGrades(): Grade[] {
  return queryAll<Grade>(
    "SELECT id, name, sort_order FROM grades ORDER BY sort_order, name",
  );
}

export function getGrade(id: number): Grade | null {
  return queryOne<Grade>("SELECT id, name, sort_order FROM grades WHERE id = ?", id);
}

/** Idempotent: re-creating an existing grade returns the existing row. */
export function createGrade(name: string, sortOrder?: number): Grade {
  const clean = name.trim();
  if (!clean) throw new ValidationError("Grade name cannot be empty.");

  const existing = queryOne<Grade>(
    "SELECT id, name, sort_order FROM grades WHERE name = ?",
    clean,
  );
  if (existing) return existing;

  // A new grade goes to the end of the list unless told otherwise. Defaulting
  // to 0 would make every grade added later sort ahead of the existing ones
  // and silently become the default selection on Records and Print Cards.
  const order =
    sortOrder ??
    ((queryOne<{ m: number }>("SELECT COALESCE(MAX(sort_order), 0) AS m FROM grades")?.m ?? 0) +
      10);

  getDb().prepare("INSERT INTO grades (name, sort_order) VALUES (?, ?)").run(clean, order);
  return queryOne<Grade>(
    "SELECT id, name, sort_order FROM grades WHERE name = ?",
    clean,
  )!;
}

// ----------------------------------------------------------------- classes

const CLASS_COLS = "id, grade_id, label, teacher_name, sort_order";

export function listClasses(gradeId: number): ClassRow[] {
  return queryAll<ClassRow>(
    `SELECT ${CLASS_COLS} FROM classes WHERE grade_id = ? ORDER BY sort_order, label`,
    gradeId,
  );
}

export function getClass(id: number): ClassRow | null {
  return queryOne<ClassRow>(`SELECT ${CLASS_COLS} FROM classes WHERE id = ?`, id);
}

export function createClass(
  gradeId: number,
  label: string,
  teacherName: string | null,
  sortOrder = 0,
): ClassRow {
  const clean = label.trim();
  if (!clean) throw new ValidationError("Class label cannot be empty.");
  if (!getGrade(gradeId)) throw new ValidationError("That grade does not exist.");

  const existing = queryOne<ClassRow>(
    `SELECT ${CLASS_COLS} FROM classes WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  );
  if (existing) return existing;

  getDb()
    .prepare("INSERT INTO classes (grade_id, label, teacher_name, sort_order) VALUES (?, ?, ?, ?)")
    .run(gradeId, clean, teacherName?.trim() || null, sortOrder);

  return queryOne<ClassRow>(
    `SELECT ${CLASS_COLS} FROM classes WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  )!;
}

// -------------------------------------------------------------------- kids

export function listKids(classId: number): Kid[] {
  return queryAll<Kid>(
    `SELECT id, class_id, english_name, korean_name, sort_order, archived
       FROM kids WHERE class_id = ? AND archived = 0
      ORDER BY sort_order, english_name COLLATE NOCASE`,
    classId,
  );
}

export function updateKid(
  kidId: number,
  fields: { english_name?: string; korean_name?: string | null },
): void {
  const db = getDb();
  const kid = queryOne<Kid>("SELECT id, class_id, english_name FROM kids WHERE id = ?", kidId);
  if (!kid) throw new ValidationError("That kid does not exist.");

  const english = fields.english_name?.trim() ?? kid.english_name;
  if (!english) throw new ValidationError("English name cannot be empty.");

  const korean =
    fields.korean_name === undefined ? undefined : fields.korean_name?.trim() || null;

  if (korean === undefined) {
    db.prepare("UPDATE kids SET english_name = ? WHERE id = ?").run(english, kidId);
  } else {
    db.prepare("UPDATE kids SET english_name = ?, korean_name = ? WHERE id = ?").run(
      english,
      korean,
      kidId,
    );
  }
}

/**
 * Match an incoming name against the class roster, case-insensitively, so a
 * kid photographed week after week stays one kid and keeps their history and
 * Korean name. Returns the existing id, or creates the kid.
 */
export function upsertKid(
  classId: number,
  englishName: string,
  koreanName: string | null,
): { id: number; created: boolean } {
  const db = getDb();
  const english = englishName.trim();
  if (!english) throw new ValidationError("English name cannot be empty.");
  const korean = koreanName?.trim() || null;

  const existing = queryOne<{ id: number; korean_name: string | null }>(
    "SELECT id, korean_name FROM kids WHERE class_id = ? AND english_name = ? COLLATE NOCASE",
    classId,
    english,
  );

  if (existing) {
    // Only fill a blank Korean name; never overwrite one a human already
    // corrected with a fresh guess from a photo.
    if (korean && !existing.korean_name) {
      db.prepare("UPDATE kids SET korean_name = ? WHERE id = ?").run(korean, existing.id);
    }
    return { id: existing.id, created: false };
  }

  const max = queryOne<{ m: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) AS m FROM kids WHERE class_id = ?",
    classId,
  );

  db.prepare(
    "INSERT INTO kids (class_id, english_name, korean_name, sort_order) VALUES (?, ?, ?, ?)",
  ).run(classId, english, korean, (max?.m ?? 0) + 10);

  const row = queryOne<{ id: number }>(
    "SELECT id FROM kids WHERE class_id = ? AND english_name = ? COLLATE NOCASE",
    classId,
    english,
  )!;
  return { id: row.id, created: true };
}

export function archiveKid(kidId: number): void {
  getDb().prepare("UPDATE kids SET archived = 1 WHERE id = ?").run(kidId);
}

// ------------------------------------------------------------------- weeks

const WEEK_COLS = "id, grade_id, label, attendance_date, sort_order";

export function listWeeks(gradeId: number): Week[] {
  return queryAll<Week>(
    `SELECT ${WEEK_COLS} FROM weeks WHERE grade_id = ?
      ORDER BY COALESCE(attendance_date, '9999-99-99'), sort_order, label`,
    gradeId,
  );
}

/** Weeks are shared across every class in a grade, mirroring the master sheet. */
export function upsertWeek(
  gradeId: number,
  label: string,
  attendanceDate: string | null,
): Week {
  const db = getDb();
  const clean = label.trim();
  if (!clean) throw new ValidationError("Week label cannot be empty.");
  if (!getGrade(gradeId)) throw new ValidationError("That grade does not exist.");

  const existing = queryOne<Week>(
    `SELECT ${WEEK_COLS} FROM weeks WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  );

  if (existing) {
    if (attendanceDate && !existing.attendance_date) {
      db.prepare("UPDATE weeks SET attendance_date = ? WHERE id = ?").run(
        attendanceDate,
        existing.id,
      );
      return { ...existing, attendance_date: attendanceDate };
    }
    return existing;
  }

  const max = queryOne<{ m: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) AS m FROM weeks WHERE grade_id = ?",
    gradeId,
  );

  db.prepare(
    "INSERT INTO weeks (grade_id, label, attendance_date, sort_order) VALUES (?, ?, ?, ?)",
  ).run(gradeId, clean, attendanceDate, (max?.m ?? 0) + 10);

  return queryOne<Week>(
    `SELECT ${WEEK_COLS} FROM weeks WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  )!;
}

export function deleteWeek(weekId: number): void {
  getDb().prepare("DELETE FROM weeks WHERE id = ?").run(weekId);
}

/**
 * Week labels in this class's grade that already hold entries for this class.
 *
 * Teachers keep one accumulating sheet for the whole term, so every photo
 * re-contains every earlier week. Without this, saving a week-10 photo would
 * rewrite weeks 1-9 from that scan — throwing away any correction someone had
 * already made by hand. The review table uses this to leave already-logged
 * columns unticked by default.
 */
export function getLoggedWeekLabels(classId: number): string[] {
  return queryAll<{ label: string }>(
    `SELECT DISTINCT w.label
       FROM entries e
       JOIN kids k  ON k.id = e.kid_id AND k.archived = 0
       JOIN weeks w ON w.id = e.week_id
      WHERE k.class_id = ?`,
    classId,
  ).map((r) => r.label);
}

// ----------------------------------------------------------------- entries

/**
 * A week belongs to a grade and a kid belongs to a class in a grade. Writing an
 * entry that crosses those would produce a row that `getRecords` counts in a
 * kid's total but never renders as a column — a printed card whose total does
 * not match its own week list. `saveSheet` checks this once per import; the
 * single-cell path has to check per call.
 */
export function assertWeekMatchesKid(kidId: number, weekId: number): void {
  const row = queryOne<{ kid_grade: number | null; week_grade: number | null }>(
    `SELECT (SELECT c.grade_id FROM kids k JOIN classes c ON c.id = k.class_id
              WHERE k.id = ?) AS kid_grade,
            (SELECT grade_id FROM weeks WHERE id = ?) AS week_grade`,
    kidId,
    weekId,
  );
  if (!row?.kid_grade) throw new ValidationError("That kid does not exist.");
  if (!row.week_grade) throw new ValidationError("That week does not exist.");
  if (row.kid_grade !== row.week_grade) {
    throw new ValidationError("That week belongs to a different grade.");
  }
}

export function setEntry(
  kidId: number,
  weekId: number,
  attendance: Attendance,
  qtPages: number,
  updatedBy: string | null,
): void {
  if (!Number.isInteger(qtPages) || qtPages < 0) {
    throw new ValidationError("QT pages must be a whole number of zero or more.");
  }
  if (attendance !== "HERE" && attendance !== "ABSENT") {
    throw new ValidationError("Attendance must be HERE or ABSENT.");
  }
  getDb()
    .prepare(
      `INSERT INTO entries (kid_id, week_id, attendance, qt_pages, updated_at, updated_by)
       VALUES (?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT (kid_id, week_id) DO UPDATE SET
         attendance = excluded.attendance,
         qt_pages   = excluded.qt_pages,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .run(kidId, weekId, attendance, qtPages, updatedBy);
}

export interface SaveSheetInput {
  classId: number;
  /** Week ids in the same order as each row's cells array. */
  weekIds: number[];
  rows: {
    english_name: string;
    korean_name: string | null;
    cells: { attendance: Attendance; qt_pages: number }[];
  }[];
  updatedBy: string | null;
}

export interface SaveSheetResult {
  kidsCreated: number;
  kidsMatched: number;
  entriesWritten: number;
}

/**
 * Commit a reviewed grid. All-or-nothing: a bad row aborts the whole import
 * rather than leaving a class half-updated.
 */
export function saveSheet(input: SaveSheetInput): SaveSheetResult {
  const cls = getClass(input.classId);
  if (!cls) throw new ValidationError("That class does not exist.");

  for (const weekId of input.weekIds) {
    const week = queryOne<{ grade_id: number }>(
      "SELECT grade_id FROM weeks WHERE id = ?",
      weekId,
    );
    if (!week) throw new ValidationError(`Week ${weekId} does not exist.`);
    if (week.grade_id !== cls.grade_id) {
      throw new ValidationError("A week from a different grade cannot be saved to this class.");
    }
  }

  return tx(() => {
    let kidsCreated = 0;
    let kidsMatched = 0;
    let entriesWritten = 0;

    for (const row of input.rows) {
      const { id: kidId, created } = upsertKid(input.classId, row.english_name, row.korean_name);
      if (created) kidsCreated++;
      else kidsMatched++;

      input.weekIds.forEach((weekId, i) => {
        const cell = row.cells[i];
        if (!cell) return;
        setEntry(kidId, weekId, cell.attendance, cell.qt_pages, input.updatedBy);
        entriesWritten++;
      });
    }

    return { kidsCreated, kidsMatched, entriesWritten };
  });
}

// ----------------------------------------------------------------- records

/**
 * Build the spreadsheet view. `classId` narrows to one class; omit it for the
 * combined all-classes-in-a-grade view with class header rows.
 */
export function getRecords(
  gradeId: number,
  classId?: number,
): { weeks: Week[]; rows: RecordsKidRow[] } {
  const weeks = listWeeks(gradeId);

  const kidRows = queryAll<{
    kid_id: number;
    english_name: string;
    korean_name: string | null;
    class_id: number;
    class_label: string;
  }>(
    `SELECT k.id AS kid_id, k.english_name, k.korean_name,
            c.id AS class_id, c.label AS class_label
       FROM kids k
       JOIN classes c ON c.id = k.class_id
      WHERE c.grade_id = ? AND k.archived = 0
        AND (? IS NULL OR c.id = ?)
      ORDER BY c.sort_order, c.label, k.sort_order, k.english_name COLLATE NOCASE`,
    gradeId,
    classId ?? null,
    classId ?? null,
  );

  const entries = queryAll<{
    kid_id: number;
    week_id: number;
    attendance: Attendance;
    qt_pages: number;
  }>(
    // Joining weeks keeps the running total in step with the columns actually
    // rendered: an entry pointing at another grade's week is excluded from
    // both, rather than silently inflating the total on a printed card.
    `SELECT e.kid_id, e.week_id, e.attendance, e.qt_pages
       FROM entries e
       JOIN kids k    ON k.id = e.kid_id
       JOIN classes c ON c.id = k.class_id
       JOIN weeks w   ON w.id = e.week_id AND w.grade_id = c.grade_id
      WHERE c.grade_id = ? AND k.archived = 0
        AND (? IS NULL OR c.id = ?)`,
    gradeId,
    classId ?? null,
    classId ?? null,
  );

  const byKid = new Map<number, RecordsKidRow>();
  for (const k of kidRows) {
    byKid.set(k.kid_id, {
      kid_id: k.kid_id,
      english_name: k.english_name,
      korean_name: k.korean_name,
      class_id: k.class_id,
      class_label: k.class_label,
      cells: {},
      total_qt: 0,
    });
  }

  for (const e of entries) {
    const row = byKid.get(e.kid_id);
    if (!row) continue;
    row.cells[e.week_id] = { attendance: e.attendance, qt_pages: e.qt_pages };
    // Total is the running sum across every logged week, matching the
    // pastor's Total column. Points = pages, no weighting.
    row.total_qt += e.qt_pages;
  }

  return { weeks, rows: [...byKid.values()] };
}

// --------------------------------------------------------------------- err

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
