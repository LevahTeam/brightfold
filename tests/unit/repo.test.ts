import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the DB at a throwaway file before anything imports the module.
process.env.QT_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "qtp-")), "test.db");

const { execute, queryAll, queryOne } = await import("@/lib/db");
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

async function reset() {
  for (const table of ["entries", "kids", "weeks", "classes", "grades"]) {
    await execute(`DELETE FROM ${table}`);
  }
}

beforeEach(reset);

describe("grades and classes", () => {
  it("creating the same grade twice returns the same row", async () => {
    const a = await createGrade("5th Grade");
    const b = await createGrade("5th Grade");
    expect(b.id).toBe(a.id);
  });

  it("rejects an empty grade name", async () => {
    await expect(createGrade("   ")).rejects.toThrow(ValidationError);
  });

  it("scopes class labels to a grade", async () => {
    const g4 = await createGrade("4th Grade");
    const g5 = await createGrade("5th Grade");
    const a = await createClass(g4.id, "A 1", null);
    const b = await createClass(g5.id, "A 1", null);
    expect(a.id).not.toBe(b.id);
  });
});

describe("upsertKid name matching", () => {
  it("matches an existing kid case-insensitively instead of duplicating", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A 5-2", "Ms. Kim");

    const first = await upsertKid(c.id, "Mina Choi", "최미나");
    const second = await upsertKid(c.id, "mina choi", null);

    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("fills in a blank Korean name from a later scan", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A 5-2", null);
    const { id } = await upsertKid(c.id, "Leo Kang", null);
    await upsertKid(c.id, "Leo Kang", "강레오");

    const kid = await queryOne("SELECT korean_name FROM kids WHERE id = ?", id) as {
      korean_name: string;
    };
    expect(kid.korean_name).toBe("강레오");
  });

  it("never overwrites a Korean name a human already set", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A 5-2", null);
    const { id } = await upsertKid(c.id, "Daniel Suh", "김하늘2");
    await upsertKid(c.id, "Daniel Suh", "WRONG GUESS");

    const kid = await queryOne("SELECT korean_name FROM kids WHERE id = ?", id) as {
      korean_name: string;
    };
    expect(kid.korean_name).toBe("김하늘2");
  });

  it("treats same-named kids in different classes as different kids", async () => {
    const g = await createGrade("5th Grade");
    const c1 = await createClass(g.id, "A 5-1", null);
    const c2 = await createClass(g.id, "A 5-2", null);
    expect((await upsertKid(c1.id, "Hana Lim", null)).id).not.toBe(
      (await upsertKid(c2.id, "Hana Lim", null)).id,
    );
  });
});

describe("weeks", () => {
  it("shares weeks across every class in a grade", async () => {
    const g = await createGrade("5th Grade");
    const a = await upsertWeek(g.id, "8/31", "2025-08-31");
    const b = await upsertWeek(g.id, "8/31", "2025-08-31");
    expect(b.id).toBe(a.id);
    expect(await listWeeks(g.id)).toHaveLength(1);
  });

  it("orders weeks by their attendance date, not insertion order", async () => {
    const g = await createGrade("5th Grade");
    await upsertWeek(g.id, "9/14", "2025-09-14");
    await upsertWeek(g.id, "8/31", "2025-08-31");
    await upsertWeek(g.id, "9/7", "2025-09-07");
    expect((await listWeeks(g.id)).map((w) => w.label)).toEqual(["8/31", "9/7", "9/14"]);
  });

  it("backfills a missing date when a later save supplies one", async () => {
    const g = await createGrade("5th Grade");
    await upsertWeek(g.id, "8/31", null);
    const filled = await upsertWeek(g.id, "8/31", "2025-08-31");
    expect(filled.attendance_date).toBe("2025-08-31");
  });
});

describe("setEntry", () => {
  it("rejects a negative page count", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A", null);
    const k = await upsertKid(c.id, "X", null);
    const w = await upsertWeek(g.id, "8/31", null);
    await expect(setEntry(k.id, w.id, "HERE", -1, null)).rejects.toThrow(ValidationError);
  });

  it("overwrites rather than duplicating on a second save", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A", null);
    const k = await upsertKid(c.id, "X", null);
    const w = await upsertWeek(g.id, "8/31", null);

    await setEntry(k.id, w.id, "HERE", 5, "volunteer");
    await setEntry(k.id, w.id, "HERE", 9, "pastor");

    const rows = await queryAll<{ qt_pages: number; updated_by: string }>(
      "SELECT qt_pages, updated_by FROM entries WHERE kid_id = ? AND week_id = ?",
      k.id,
      w.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].qt_pages).toBe(9);
    expect(rows[0].updated_by).toBe("pastor");
  });
});

describe("saveSheet", () => {
  async function fixture() {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A 5-2 (Korean)", "Ms. Ji Woo Park");
    const weeks = [
      await upsertWeek(g.id, "8/31", "2025-08-31"),
      await upsertWeek(g.id, "9/7", "2025-09-07"),
    ];
    return { g, c, weeks };
  }

  it("creates kids and entries, and reports what it did", async () => {
    const { c, weeks } = await fixture();
    const result = await saveSheet({
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

  it("matches the same kid on a second import instead of duplicating", async () => {
    const { c, weeks } = await fixture();
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
    await saveSheet({ classId: c.id, weekIds: weeks.map((w) => w.id), rows, updatedBy: null });
    const second = await saveSheet({
      classId: c.id,
      weekIds: weeks.map((w) => w.id),
      rows,
      updatedBy: null,
    });
    expect(second.kidsMatched).toBe(1);
    expect(second.kidsCreated).toBe(0);
  });

  it("refuses a week that belongs to a different grade", async () => {
    const { c } = await fixture();
    const other = await createGrade("4th Grade");
    const foreign = await upsertWeek(other.id, "8/31", null);

    await expect(saveSheet({
        classId: c.id,
        weekIds: [foreign.id],
        rows: [
          { english_name: "X", korean_name: null, cells: [{ attendance: "HERE", qt_pages: 1 }] },
        ],
        updatedBy: null,
      })).rejects.toThrow(ValidationError);
  });

  it("rolls the whole import back when one row is invalid", async () => {
    const { c, weeks } = await fixture();
    await expect(saveSheet({
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
      })).rejects.toThrow(ValidationError);

    const kids = await queryOne("SELECT COUNT(*) AS n FROM kids") as { n: number };
    const entries = await queryOne("SELECT COUNT(*) AS n FROM entries") as { n: number };
    expect(kids.n).toBe(0);
    expect(entries.n).toBe(0);
  });
});

describe("getRecords", () => {
  it("sums total pages across every logged week", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A 5-2", null);
    const w1 = await upsertWeek(g.id, "8/31", "2025-08-31");
    const w2 = await upsertWeek(g.id, "9/7", "2025-09-07");
    const k = await upsertKid(c.id, "Jun Park", "박서준3");

    await setEntry(k.id, w1.id, "HERE", 10, null);
    await setEntry(k.id, w2.id, "HERE", 7, null);

    const { rows } = await getRecords(g.id);
    expect(rows[0].total_qt).toBe(17);
    expect(rows[0].korean_name).toBe("박서준3");
  });

  it("counts an absent week as zero without dropping the kid", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A", null);
    const w = await upsertWeek(g.id, "8/31", null);
    const k = await upsertKid(c.id, "Justina Kim", null);
    await setEntry(k.id, w.id, "ABSENT", 0, null);

    const { rows } = await getRecords(g.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].total_qt).toBe(0);
    expect(rows[0].cells[w.id].attendance).toBe("ABSENT");
  });

  it("includes a kid with no entries at all", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A", null);
    await upsertKid(c.id, "New Kid", null);

    const { rows } = await getRecords(g.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].total_qt).toBe(0);
  });

  it("narrows to a single class when asked", async () => {
    const g = await createGrade("5th Grade");
    const c1 = await createClass(g.id, "A 5-1", null);
    const c2 = await createClass(g.id, "A 5-2", null);
    await upsertKid(c1.id, "Kid One", null);
    await upsertKid(c2.id, "Kid Two", null);

    expect((await getRecords(g.id)).rows).toHaveLength(2);
    expect((await getRecords(g.id, c1.id)).rows).toHaveLength(1);
  });

  it("hides an archived kid but keeps their rows out of the totals", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A", null);
    const w = await upsertWeek(g.id, "8/31", null);
    const k = await upsertKid(c.id, "Left The Class", null);
    await setEntry(k.id, w.id, "HERE", 5, null);

    await archiveKid(k.id);
    expect((await getRecords(g.id)).rows).toHaveLength(0);
  });

  it("returns plain objects that React can serialize to a client component", async () => {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A", null);
    await upsertWeek(g.id, "8/31", null);
    await upsertKid(c.id, "X", null);

    const { weeks, rows } = await getRecords(g.id);
    // node:sqlite hands back null-prototype rows, which RSC refuses to pass
    // across the server/client boundary.
    expect(Object.getPrototypeOf(weeks[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
  });
});

describe("re-scan protection", () => {
  async function classWithWeeks() {
    const g = await createGrade("5th Grade");
    const c = await createClass(g.id, "A 5-2", "Ms. Kim");
    const weeks = [];
    for (const [i, l] of ["8/31", "9/7", "9/14"].entries()) {
      weeks.push(await upsertWeek(g.id, l, `2025-0${8 + Math.floor((i + 1) / 3)}-0${1 + i}`));
    }
    return { g, c, weeks };
  }

  it("reports only the weeks this class actually has entries for", async () => {
    const { c, weeks } = await classWithWeeks();
    const kid = await upsertKid(c.id, "Mina Choi", "최미나");
    await setEntry(kid.id, weeks[0].id, "HERE", 6, null);
    await setEntry(kid.id, weeks[1].id, "ABSENT", 0, null);

    const logged = await getLoggedWeekLabels(c.id);
    // An absent-with-zero week still counts as logged: it is a recorded fact,
    // and re-scanning must not silently overwrite it either.
    expect(logged.sort()).toEqual(["8/31", "9/7"]);
    expect(logged).not.toContain("9/14");
  });

  it("does not report another class's weeks as logged", async () => {
    const { g, c, weeks } = await classWithWeeks();
    const other = await createClass(g.id, "A 5-6", null);
    const kid = await upsertKid(c.id, "Mina Choi", null);
    await setEntry(kid.id, weeks[0].id, "HERE", 6, null);

    expect(await getLoggedWeekLabels(other.id)).toEqual([]);
  });

  it("ignores archived kids when deciding what has been logged", async () => {
    const { c, weeks } = await classWithWeeks();
    const kid = await upsertKid(c.id, "Left The Class", null);
    await setEntry(kid.id, weeks[0].id, "HERE", 5, null);
    await archiveKid(kid.id);

    expect(await getLoggedWeekLabels(c.id)).toEqual([]);
  });
});

describe("grade integrity", () => {
  async function crossGradeFixture() {
    const g1 = await createGrade("5th Grade");
    const g2 = await createGrade("4th Grade");
    const c1 = await createClass(g1.id, "A 5-1", null);
    const kid = await upsertKid(c1.id, "Leo Kang", null);
    const ownWeek = await upsertWeek(g1.id, "8/31", "2025-08-31");
    const foreignWeek = await upsertWeek(g2.id, "8/31", "2025-08-31");
    return { g1, kid, ownWeek, foreignWeek };
  }

  it("accepts a week from the kid's own grade", async () => {
    const { kid, ownWeek } = await crossGradeFixture();
    await expect(assertWeekMatchesKid(kid.id, ownWeek.id)).resolves.not.toThrow();
  });

  it("rejects a week from another grade", async () => {
    const { kid, foreignWeek } = await crossGradeFixture();
    await expect(assertWeekMatchesKid(kid.id, foreignWeek.id)).rejects.toThrow(ValidationError);
  });

  it("rejects an unknown kid or week", async () => {
    const { kid, ownWeek } = await crossGradeFixture();
    await expect(assertWeekMatchesKid(999999, ownWeek.id)).rejects.toThrow(ValidationError);
    await expect(assertWeekMatchesKid(kid.id, 999999)).rejects.toThrow(ValidationError);
  });

  it("keeps a stray cross-grade entry out of the running total", async () => {
    const { g1, kid, ownWeek, foreignWeek } = await crossGradeFixture();
    await setEntry(kid.id, ownWeek.id, "HERE", 6, null);
    // Written directly, bypassing the API guard, to simulate a stray row.
    await setEntry(kid.id, foreignWeek.id, "HERE", 50, null);

    const { rows, weeks } = await getRecords(g1.id);
    // The foreign week renders nowhere, so it must not be counted either —
    // otherwise a printed card's total disagrees with its own week list.
    expect(weeks.map((w) => w.id)).toEqual([ownWeek.id]);
    expect(rows[0].total_qt).toBe(6);
  });
});
