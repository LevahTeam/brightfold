import { execute, tx, queryAll, queryOne } from "./db";
import { recordAuditEvent } from "./audit";
import type {
  Attendance,
  ClassRow,
  Grade,
  Kid,
  RecordsKidRow,
  Week,
} from "./types";

// ------------------------------------------------------------------ grades

export async function listGrades(): Promise<Grade[]> {
  return queryAll<Grade>(
    "SELECT id, name, sort_order FROM grades ORDER BY sort_order, name",
  );
}

export async function getGrade(id: number): Promise<Grade | null> {
  return queryOne<Grade>("SELECT id, name, sort_order FROM grades WHERE id = ?", id);
}

/** Idempotent: re-creating an existing grade returns the existing row. */
export async function createGrade(name: string, sortOrder?: number): Promise<Grade> {
  const clean = name.trim();
  if (!clean) throw new ValidationError("Grade name cannot be empty.");

  const existing = await queryOne<Grade>(
    "SELECT id, name, sort_order FROM grades WHERE name = ?",
    clean,
  );
  if (existing) return existing;

  // A new grade goes to the end of the list unless told otherwise. Defaulting
  // to 0 would make every grade added later sort ahead of the existing ones
  // and silently become the default selection on Records and Print Cards.
  const order =
    sortOrder ??
    ((
      await queryOne<{ m: number }>("SELECT COALESCE(MAX(sort_order), 0) AS m FROM grades")
    )?.m ?? 0) + 10;

  await execute("INSERT INTO grades (name, sort_order) VALUES (?, ?)", clean, order);
  return (await queryOne<Grade>(
    "SELECT id, name, sort_order FROM grades WHERE name = ?",
    clean,
  ))!;
}

// ----------------------------------------------------------------- classes

const CLASS_COLS = "id, grade_id, label, teacher_name, sort_order";

export async function listClasses(gradeId: number): Promise<ClassRow[]> {
  return queryAll<ClassRow>(
    `SELECT ${CLASS_COLS} FROM classes WHERE grade_id = ? ORDER BY sort_order, label`,
    gradeId,
  );
}

export async function getClass(id: number): Promise<ClassRow | null> {
  return queryOne<ClassRow>(`SELECT ${CLASS_COLS} FROM classes WHERE id = ?`, id);
}

export async function createClass(
  gradeId: number,
  label: string,
  teacherName: string | null,
  sortOrder = 0,
): Promise<ClassRow> {
  const clean = label.trim();
  if (!clean) throw new ValidationError("Class label cannot be empty.");
  if (!(await getGrade(gradeId))) throw new ValidationError("That grade does not exist.");

  const existing = await queryOne<ClassRow>(
    `SELECT ${CLASS_COLS} FROM classes WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  );
  if (existing) return existing;

  await execute(
    "INSERT INTO classes (grade_id, label, teacher_name, sort_order) VALUES (?, ?, ?, ?)",
    gradeId,
    clean,
    teacherName?.trim() || null,
    sortOrder,
  );

  return (await queryOne<ClassRow>(
    `SELECT ${CLASS_COLS} FROM classes WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  ))!;
}

// -------------------------------------------------------------------- kids

export async function listKids(classId: number): Promise<Kid[]> {
  return queryAll<Kid>(
    `SELECT id, class_id, english_name, korean_name, sort_order, archived
       FROM kids WHERE class_id = ? AND archived = 0
      ORDER BY sort_order, english_name COLLATE NOCASE`,
    classId,
  );
}

export async function updateKid(
  kidId: number,
  fields: { english_name?: string; korean_name?: string | null },
  updatedBy: string | null = null,
): Promise<void> {
  await tx(async () => {
    const kid = await queryOne<Kid>(
      `SELECT id, class_id, english_name, korean_name, sort_order, archived
         FROM kids WHERE id = ?`,
      kidId,
    );
    if (!kid) throw new ValidationError("That kid does not exist.");

    const english = fields.english_name?.trim() ?? kid.english_name;
    if (!english) throw new ValidationError("English name cannot be empty.");

    const korean =
      fields.korean_name === undefined ? kid.korean_name : fields.korean_name?.trim() || null;

    await execute(
      "UPDATE kids SET english_name = ?, korean_name = ? WHERE id = ?",
      english,
      korean,
      kidId,
    );
    await recordAuditEvent({
      actor: updatedBy,
      action: "update",
      entityType: "kid",
      entityId: kidId,
      before: { english_name: kid.english_name, korean_name: kid.korean_name },
      after: { english_name: english, korean_name: korean },
    });
  });
}

/**
 * Match an incoming name against the class roster, case-insensitively, so a
 * kid photographed week after week stays one kid and keeps their history and
 * Korean name. Returns the existing id, or creates the kid.
 */
export async function upsertKid(
  classId: number,
  englishName: string,
  koreanName: string | null,
): Promise<{ id: number; created: boolean }> {
  const english = englishName.trim();
  if (!english) throw new ValidationError("English name cannot be empty.");
  const korean = koreanName?.trim() || null;

  const existing = await queryOne<{ id: number; korean_name: string | null }>(
    "SELECT id, korean_name FROM kids WHERE class_id = ? AND english_name = ? COLLATE NOCASE",
    classId,
    english,
  );

  if (existing) {
    // Only fill a blank Korean name; never overwrite one a human already
    // corrected with a fresh guess from a photo.
    if (korean && !existing.korean_name) {
      await execute("UPDATE kids SET korean_name = ? WHERE id = ?", korean, existing.id);
    }
    return { id: existing.id, created: false };
  }

  const max = await queryOne<{ m: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) AS m FROM kids WHERE class_id = ?",
    classId,
  );

  const write = await execute(
    "INSERT INTO kids (class_id, english_name, korean_name, sort_order) VALUES (?, ?, ?, ?)",
    classId,
    english,
    korean,
    (max?.m ?? 0) + 10,
  );

  return { id: write.lastInsertRowid, created: true };
}

export async function archiveKid(kidId: number, updatedBy: string | null = null): Promise<void> {
  await tx(async () => {
    const kid = await queryOne<Kid>(
      `SELECT id, class_id, english_name, korean_name, sort_order, archived
         FROM kids WHERE id = ?`,
      kidId,
    );
    if (!kid) throw new ValidationError("That kid does not exist.");
    await execute("UPDATE kids SET archived = 1 WHERE id = ?", kidId);
    await recordAuditEvent({
      actor: updatedBy,
      action: "archive",
      entityType: "kid",
      entityId: kidId,
      before: { english_name: kid.english_name, archived: kid.archived },
      after: { english_name: kid.english_name, archived: 1 },
    });
  });
}

// ------------------------------------------------------------------- weeks

const WEEK_COLS = "id, grade_id, label, attendance_date, sort_order";

export async function listWeeks(gradeId: number): Promise<Week[]> {
  return queryAll<Week>(
    `SELECT ${WEEK_COLS} FROM weeks WHERE grade_id = ?
      ORDER BY COALESCE(attendance_date, '9999-99-99'), sort_order, label`,
    gradeId,
  );
}

/** Weeks are shared across every class in a grade, mirroring the master sheet. */
export async function upsertWeek(
  gradeId: number,
  label: string,
  attendanceDate: string | null,
): Promise<Week> {
  const clean = label.trim();
  if (!clean) throw new ValidationError("Week label cannot be empty.");
  if (!(await getGrade(gradeId))) throw new ValidationError("That grade does not exist.");

  const existing = await queryOne<Week>(
    `SELECT ${WEEK_COLS} FROM weeks WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  );

  if (existing) {
    if (attendanceDate && !existing.attendance_date) {
      await execute(
        "UPDATE weeks SET attendance_date = ? WHERE id = ?",
        attendanceDate,
        existing.id,
      );
      return { ...existing, attendance_date: attendanceDate };
    }
    return existing;
  }

  const max = await queryOne<{ m: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) AS m FROM weeks WHERE grade_id = ?",
    gradeId,
  );

  await execute(
    "INSERT INTO weeks (grade_id, label, attendance_date, sort_order) VALUES (?, ?, ?, ?)",
    gradeId,
    clean,
    attendanceDate,
    (max?.m ?? 0) + 10,
  );

  return (await queryOne<Week>(
    `SELECT ${WEEK_COLS} FROM weeks WHERE grade_id = ? AND label = ?`,
    gradeId,
    clean,
  ))!;
}

export async function deleteWeek(
  weekId: number,
  updatedBy: string | null = null,
): Promise<{ label: string; entriesRemoved: number }> {
  return tx(async () => {
    const week = await queryOne<Week>(`SELECT ${WEEK_COLS} FROM weeks WHERE id = ?`, weekId);
    if (!week) throw new ValidationError("That week does not exist.");
    const count = await queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM entries WHERE week_id = ?",
      weekId,
    );
    const entriesRemoved = count?.n ?? 0;
    await execute("DELETE FROM weeks WHERE id = ?", weekId);
    await recordAuditEvent({
      actor: updatedBy,
      action: "delete",
      entityType: "week",
      entityId: weekId,
      before: { ...week, entries: entriesRemoved },
      after: null,
    });
    return { label: week.label, entriesRemoved };
  });
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
export async function getLoggedWeekLabels(classId: number): Promise<string[]> {
  const rows = await queryAll<{ label: string }>(
    `SELECT DISTINCT w.label
       FROM entries e
       JOIN kids k  ON k.id = e.kid_id AND k.archived = 0
       JOIN weeks w ON w.id = e.week_id
      WHERE k.class_id = ?`,
    classId,
  );
  return rows.map((r) => r.label);
}

// ----------------------------------------------------------------- entries

/**
 * A week belongs to a grade and a kid belongs to a class in a grade. Writing an
 * entry that crosses those would produce a row that `getRecords` counts in a
 * kid's total but never renders as a column — a printed card whose total does
 * not match its own week list. `saveSheet` checks this once per import; the
 * single-cell path has to check per call.
 */
export async function assertWeekMatchesKid(kidId: number, weekId: number): Promise<void> {
  const row = await queryOne<{ kid_grade: number | null; week_grade: number | null }>(
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

export async function setEntry(
  kidId: number,
  weekId: number,
  attendance: Attendance,
  qtPages: number,
  updatedBy: string | null,
): Promise<void> {
  if (!Number.isInteger(qtPages) || qtPages < 0) {
    throw new ValidationError("QT pages must be a whole number of zero or more.");
  }
  if (attendance !== "HERE" && attendance !== "ABSENT") {
    throw new ValidationError("Attendance must be HERE or ABSENT.");
  }
  await tx(async () => {
    const before = await queryOne<{ attendance: Attendance; qt_pages: number }>(
      "SELECT attendance, qt_pages FROM entries WHERE kid_id = ? AND week_id = ?",
      kidId,
      weekId,
    );
    await execute(
      `INSERT INTO entries (kid_id, week_id, attendance, qt_pages, updated_at, updated_by)
       VALUES (?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT (kid_id, week_id) DO UPDATE SET
         attendance = excluded.attendance,
         qt_pages   = excluded.qt_pages,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      kidId,
      weekId,
      attendance,
      qtPages,
      updatedBy,
    );
    if (updatedBy && updatedBy !== "seed") {
      await recordAuditEvent({
        actor: updatedBy,
        action: before ? "update" : "create",
        entityType: "entry",
        entityId: `${kidId}:${weekId}`,
        before,
        after: { attendance, qt_pages: qtPages },
      });
    }
  });
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
export async function saveSheet(input: SaveSheetInput): Promise<SaveSheetResult> {
  const cls = await getClass(input.classId);
  if (!cls) throw new ValidationError("That class does not exist.");

  for (const weekId of input.weekIds) {
    const week = await queryOne<{ grade_id: number }>(
      "SELECT grade_id FROM weeks WHERE id = ?",
      weekId,
    );
    if (!week) throw new ValidationError(`Week ${weekId} does not exist.`);
    if (week.grade_id !== cls.grade_id) {
      throw new ValidationError("A week from a different grade cannot be saved to this class.");
    }
  }

  return tx(async () => {
    let kidsCreated = 0;
    let kidsMatched = 0;
    let entriesWritten = 0;

    for (const row of input.rows) {
      const { id: kidId, created } = await upsertKid(
        input.classId,
        row.english_name,
        row.korean_name,
      );
      if (created) kidsCreated++;
      else kidsMatched++;

      for (const [i, weekId] of input.weekIds.entries()) {
        const cell = row.cells[i];
        if (!cell) continue;
        await setEntry(kidId, weekId, cell.attendance, cell.qt_pages, input.updatedBy);
        entriesWritten++;
      }
    }

    return { kidsCreated, kidsMatched, entriesWritten };
  });
}

// ----------------------------------------------------------------- records

/**
 * Build the spreadsheet view. `classId` narrows to one class; omit it for the
 * combined all-classes-in-a-grade view with class header rows.
 */
export async function getRecords(
  gradeId: number,
  classId?: number,
): Promise<{ weeks: Week[]; rows: RecordsKidRow[] }> {
  const weeks = await listWeeks(gradeId);

  const kidRows = await queryAll<{
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

  const entries = await queryAll<{
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
