import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the DB at a throwaway file before anything imports the module.
process.env.QT_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "qtp-")), "test.db");

const { getDb } = await import("@/lib/db");
const {
  createGrade,
  createClass,
  upsertKid,
  upsertWeek,
  setEntry,
  saveSheet,
  getRecords,
  listWeeks,
  archiveKid,
  getLoggedWeekLabels,
  assertWeekMatchesKid,
  ValidationError,
} = await import("@/lib/repo");

function reset() {
  const db = getDb();
  db.exec("DELETE FROM entries; DELETE FROM kids; DELETE FROM weeks; DELETE FROM classes; DELETE FROM grades;");
}

beforeEach(reset);

describe("grades and classes", () => {
  it("creating the same grade twice returns the same row", () => {
    const a = createGrade("5th Grade");
    const b = createGrade("5th Grade");
    expect(b.id).toBe(a.id);
  });

  it("rejects an empty grade name", () => {
    expect(() => createGrade("   ")).toThrow(ValidationError);
  });

  it("scopes class labels to a grade", () => {
    const g4 = createGrade("4th Grade");
    const g5 = createGrade("5th Grade");
    const a = createClass(g4.id, "A 1", null);
    const b = createClass(g5.id, "A 1", null);
    expect(a.id).not.toBe(b.id);
  });
});

describe("upsertKid name matching", () => {
  it("matches an existing kid case-insensitively instead of duplicating", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A 5-2", "Ms. Kim");

    const first = upsertKid(c.id, "Mina Choi", "최미나");
    const second = upsertKid(c.id, "mina choi", null);

    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("fills in a blank Korean name from a later scan", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A 5-2", null);
    const { id } = upsertKid(c.id, "Leo Kang", null);
    upsertKid(c.id, "Leo Kang", "강레오");

    const kid = getDb().prepare("SELECT korean_name FROM kids WHERE id = ?").get(id) as {
      korean_name: string;
    };
    expect(kid.korean_name).toBe("강레오");
  });

  it("never overwrites a Korean name a human already set", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A 5-2", null);
    const { id } = upsertKid(c.id, "Daniel Suh", "김하늘2");
    upsertKid(c.id, "Daniel Suh", "WRONG GUESS");

    const kid = getDb().prepare("SELECT korean_name FROM kids WHERE id = ?").get(id) as {
      korean_name: string;
    };
    expect(kid.korean_name).toBe("김하늘2");
  });

  it("treats same-named kids in different classes as different kids", () => {
    const g = createGrade("5th Grade");
    const c1 = createClass(g.id, "A 5-1", null);
    const c2 = createClass(g.id, "A 5-2", null);
    expect(upsertKid(c1.id, "Hana Lim", null).id).not.toBe(
      upsertKid(c2.id, "Hana Lim", null).id,
    );
  });
});

describe("weeks", () => {
  it("shares weeks across every class in a grade", () => {
    const g = createGrade("5th Grade");
    const a = upsertWeek(g.id, "8/31", "2025-08-31");
    const b = upsertWeek(g.id, "8/31", "2025-08-31");
    expect(b.id).toBe(a.id);
    expect(listWeeks(g.id)).toHaveLength(1);
  });

  it("orders weeks by their attendance date, not insertion order", () => {
    const g = createGrade("5th Grade");
    upsertWeek(g.id, "9/14", "2025-09-14");
    upsertWeek(g.id, "8/31", "2025-08-31");
    upsertWeek(g.id, "9/7", "2025-09-07");
    expect(listWeeks(g.id).map((w) => w.label)).toEqual(["8/31", "9/7", "9/14"]);
  });

  it("backfills a missing date when a later save supplies one", () => {
    const g = createGrade("5th Grade");
    upsertWeek(g.id, "8/31", null);
    const filled = upsertWeek(g.id, "8/31", "2025-08-31");
    expect(filled.attendance_date).toBe("2025-08-31");
  });
});

describe("setEntry", () => {
  it("rejects a negative page count", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A", null);
    const k = upsertKid(c.id, "X", null);
    const w = upsertWeek(g.id, "8/31", null);
    expect(() => setEntry(k.id, w.id, "HERE", -1, null)).toThrow(ValidationError);
  });

  it("overwrites rather than duplicating on a second save", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A", null);
    const k = upsertKid(c.id, "X", null);
    const w = upsertWeek(g.id, "8/31", null);

    setEntry(k.id, w.id, "HERE", 5, "volunteer");
    setEntry(k.id, w.id, "HERE", 9, "pastor");

    const rows = getDb()
      .prepare("SELECT qt_pages, updated_by FROM entries WHERE kid_id = ? AND week_id = ?")
      .all(k.id, w.id) as { qt_pages: number; updated_by: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].qt_pages).toBe(9);
    expect(rows[0].updated_by).toBe("pastor");
  });
});

describe("saveSheet", () => {
  function fixture() {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A 5-2 (Korean)", "Ms. Ji Woo Park");
    const weeks = [
      upsertWeek(g.id, "8/31", "2025-08-31"),
      upsertWeek(g.id, "9/7", "2025-09-07"),
    ];
    return { g, c, weeks };
  }

  it("creates kids and entries, and reports what it did", () => {
    const { c, weeks } = fixture();
    const result = saveSheet({
      classId: c.id,
      weekIds: weeks.map((w) => w.id),
      updatedBy: "volunteer",
      rows: [
        {
          english_name: "Mina Choi",
          korean_name: "최미나",
          cells: [
            { attendance: "HERE", qt_pages: 6 },
            { attendance: "ABSENT", qt_pages: 0 },
          ],
        },
      ],
    });

    expect(result).toEqual({ kidsCreated: 1, kidsMatched: 0, entriesWritten: 2 });
  });

  it("matches the same kid on a second import instead of duplicating", () => {
    const { c, weeks } = fixture();
    const rows = [
      {
        english_name: "Mina Choi",
        korean_name: "최미나",
        cells: [
          { attendance: "HERE" as const, qt_pages: 6 },
          { attendance: "HERE" as const, qt_pages: 5 },
        ],
      },
    ];
    saveSheet({ classId: c.id, weekIds: weeks.map((w) => w.id), rows, updatedBy: null });
    const second = saveSheet({
      classId: c.id,
      weekIds: weeks.map((w) => w.id),
      rows,
      updatedBy: null,
    });
    expect(second.kidsMatched).toBe(1);
    expect(second.kidsCreated).toBe(0);
  });

  it("refuses a week that belongs to a different grade", () => {
    const { c } = fixture();
    const other = createGrade("4th Grade");
    const foreign = upsertWeek(other.id, "8/31", null);

    expect(() =>
      saveSheet({
        classId: c.id,
        weekIds: [foreign.id],
        rows: [
          { english_name: "X", korean_name: null, cells: [{ attendance: "HERE", qt_pages: 1 }] },
        ],
        updatedBy: null,
      }),
    ).toThrow(ValidationError);
  });

  it("rolls the whole import back when one row is invalid", () => {
    const { c, weeks } = fixture();
    expect(() =>
      saveSheet({
        classId: c.id,
        weekIds: weeks.map((w) => w.id),
        updatedBy: null,
        rows: [
          {
            english_name: "Good Kid",
            korean_name: null,
            cells: [
              { attendance: "HERE", qt_pages: 4 },
              { attendance: "HERE", qt_pages: 4 },
            ],
          },
          // Empty name blows up partway through, after the first kid was written.
          { english_name: "   ", korean_name: null, cells: [] },
        ],
      }),
    ).toThrow(ValidationError);

    const kids = getDb().prepare("SELECT COUNT(*) AS n FROM kids").get() as { n: number };
    const entries = getDb().prepare("SELECT COUNT(*) AS n FROM entries").get() as { n: number };
    expect(kids.n).toBe(0);
    expect(entries.n).toBe(0);
  });
});

describe("getRecords", () => {
  it("sums total pages across every logged week", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A 5-2", null);
    const w1 = upsertWeek(g.id, "8/31", "2025-08-31");
    const w2 = upsertWeek(g.id, "9/7", "2025-09-07");
    const k = upsertKid(c.id, "Jun Park", "박서준3");

    setEntry(k.id, w1.id, "HERE", 10, null);
    setEntry(k.id, w2.id, "HERE", 7, null);

    const { rows } = getRecords(g.id);
    expect(rows[0].total_qt).toBe(17);
    expect(rows[0].korean_name).toBe("박서준3");
  });

  it("counts an absent week as zero without dropping the kid", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A", null);
    const w = upsertWeek(g.id, "8/31", null);
    const k = upsertKid(c.id, "Justina Kim", null);
    setEntry(k.id, w.id, "ABSENT", 0, null);

    const { rows } = getRecords(g.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].total_qt).toBe(0);
    expect(rows[0].cells[w.id].attendance).toBe("ABSENT");
  });

  it("includes a kid with no entries at all", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A", null);
    upsertKid(c.id, "New Kid", null);

    const { rows } = getRecords(g.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].total_qt).toBe(0);
  });

  it("narrows to a single class when asked", () => {
    const g = createGrade("5th Grade");
    const c1 = createClass(g.id, "A 5-1", null);
    const c2 = createClass(g.id, "A 5-2", null);
    upsertKid(c1.id, "Kid One", null);
    upsertKid(c2.id, "Kid Two", null);

    expect(getRecords(g.id).rows).toHaveLength(2);
    expect(getRecords(g.id, c1.id).rows).toHaveLength(1);
  });

  it("hides an archived kid but keeps their rows out of the totals", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A", null);
    const w = upsertWeek(g.id, "8/31", null);
    const k = upsertKid(c.id, "Left The Class", null);
    setEntry(k.id, w.id, "HERE", 5, null);

    archiveKid(k.id);
    expect(getRecords(g.id).rows).toHaveLength(0);
  });

  it("returns plain objects that React can serialize to a client component", () => {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A", null);
    upsertWeek(g.id, "8/31", null);
    upsertKid(c.id, "X", null);

    const { weeks, rows } = getRecords(g.id);
    // node:sqlite hands back null-prototype rows, which RSC refuses to pass
    // across the server/client boundary.
    expect(Object.getPrototypeOf(weeks[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
  });
});

describe("re-scan protection", () => {
  function classWithWeeks() {
    const g = createGrade("5th Grade");
    const c = createClass(g.id, "A 5-2", "Ms. Kim");
    const weeks = ["8/31", "9/7", "9/14"].map((l, i) =>
      upsertWeek(g.id, l, `2025-0${8 + Math.floor((i + 1) / 3)}-0${1 + i}`),
    );
    return { g, c, weeks };
  }

  it("reports only the weeks this class actually has entries for", () => {
    const { c, weeks } = classWithWeeks();
    const kid = upsertKid(c.id, "Mina Choi", "최미나");
    setEntry(kid.id, weeks[0].id, "HERE", 6, null);
    setEntry(kid.id, weeks[1].id, "ABSENT", 0, null);

    const logged = getLoggedWeekLabels(c.id);
    // An absent-with-zero week still counts as logged: it is a recorded fact,
    // and re-scanning must not silently overwrite it either.
    expect(logged.sort()).toEqual(["8/31", "9/7"]);
    expect(logged).not.toContain("9/14");
  });

  it("does not report another class's weeks as logged", () => {
    const { g, c, weeks } = classWithWeeks();
    const other = createClass(g.id, "A 5-6", null);
    const kid = upsertKid(c.id, "Mina Choi", null);
    setEntry(kid.id, weeks[0].id, "HERE", 6, null);

    expect(getLoggedWeekLabels(other.id)).toEqual([]);
  });

  it("ignores archived kids when deciding what has been logged", () => {
    const { c, weeks } = classWithWeeks();
    const kid = upsertKid(c.id, "Left The Class", null);
    setEntry(kid.id, weeks[0].id, "HERE", 5, null);
    archiveKid(kid.id);

    expect(getLoggedWeekLabels(c.id)).toEqual([]);
  });
});

describe("grade integrity", () => {
  function crossGradeFixture() {
    const g1 = createGrade("5th Grade");
    const g2 = createGrade("4th Grade");
    const c1 = createClass(g1.id, "A 5-1", null);
    const kid = upsertKid(c1.id, "Leo Kang", null);
    const ownWeek = upsertWeek(g1.id, "8/31", "2025-08-31");
    const foreignWeek = upsertWeek(g2.id, "8/31", "2025-08-31");
    return { g1, kid, ownWeek, foreignWeek };
  }

  it("accepts a week from the kid's own grade", () => {
    const { kid, ownWeek } = crossGradeFixture();
    expect(() => assertWeekMatchesKid(kid.id, ownWeek.id)).not.toThrow();
  });

  it("rejects a week from another grade", () => {
    const { kid, foreignWeek } = crossGradeFixture();
    expect(() => assertWeekMatchesKid(kid.id, foreignWeek.id)).toThrow(ValidationError);
  });

  it("rejects an unknown kid or week", () => {
    const { kid, ownWeek } = crossGradeFixture();
    expect(() => assertWeekMatchesKid(999999, ownWeek.id)).toThrow(ValidationError);
    expect(() => assertWeekMatchesKid(kid.id, 999999)).toThrow(ValidationError);
  });

  it("keeps a stray cross-grade entry out of the running total", () => {
    const { g1, kid, ownWeek, foreignWeek } = crossGradeFixture();
    setEntry(kid.id, ownWeek.id, "HERE", 6, null);
    // Written directly, bypassing the API guard, to simulate a stray row.
    setEntry(kid.id, foreignWeek.id, "HERE", 50, null);

    const { rows, weeks } = getRecords(g1.id);
    // The foreign week renders nowhere, so it must not be counted either —
    // otherwise a printed card's total disagrees with its own week list.
    expect(weeks.map((w) => w.id)).toEqual([ownWeek.id]);
    expect(rows[0].total_qt).toBe(6);
  });
});
