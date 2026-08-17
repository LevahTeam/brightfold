import { describe, it, expect } from "vitest";
import {
  extractJsonObject,
  normalizeSheet,
  resolveHeaderDate,
  ExtractionParseError,
} from "@/lib/vision/parse";

const OPTS = { startYear: 2025, startMonth: 8 };

describe("extractJsonObject", () => {
  it("parses a clean JSON reply", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a markdown fence", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("finds the object when the model adds prose around it", () => {
    expect(extractJsonObject('Here you go:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it("does not stop at a brace inside a string value", () => {
    const out = extractJsonObject('{"name":"a } b","n":2}') as Record<string, unknown>;
    expect(out.name).toBe("a } b");
    expect(out.n).toBe(2);
  });

  it("handles escaped quotes inside strings", () => {
    const out = extractJsonObject('{"name":"say \\"hi\\"","n":1}') as Record<string, unknown>;
    expect(out.name).toBe('say "hi"');
  });

  it("throws when there is no JSON at all", () => {
    expect(() => extractJsonObject("I could not read the image.")).toThrow(ExtractionParseError);
  });

  it("throws when the JSON is truncated", () => {
    expect(() => extractJsonObject('{"rows":[{"english_name":"Ara')).toThrow(
      ExtractionParseError,
    );
  });
});

describe("resolveHeaderDate", () => {
  it("maps an August header to the starting year", () => {
    expect(resolveHeaderDate("8/31", 2025, 8)).toBe("2025-08-31");
  });

  it("rolls a January header into the next calendar year", () => {
    expect(resolveHeaderDate("1/11", 2025, 8)).toBe("2026-01-11");
  });

  it("accepts a dash separator", () => {
    expect(resolveHeaderDate("12-7", 2025, 8)).toBe("2025-12-07");
  });

  it("rejects an impossible day", () => {
    expect(resolveHeaderDate("2/30", 2025, 8)).toBeNull();
  });

  it("returns null for a non-date header", () => {
    expect(resolveHeaderDate("Week 1", 2025, 8)).toBeNull();
  });
});

describe("normalizeSheet", () => {
  const good = {
    class_label: "A 5-2 (Korean)",
    teacher_name: "Ms. Ji Woo Park",
    columns: [{ header: "8/31" }, { header: "9/7" }],
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
    notes: ["margin notes ignored"],
  };

  it("normalizes a well-formed sheet", () => {
    const sheet = normalizeSheet(good, OPTS);
    expect(sheet.class_label).toBe("A 5-2 (Korean)");
    expect(sheet.teacher_name).toBe("Ms. Ji Woo Park");
    expect(sheet.columns).toEqual([
      { header: "8/31", date: "2025-08-31" },
      { header: "9/7", date: "2025-09-07" },
    ]);
    expect(sheet.rows[0].korean_name).toBe("최미나");
    expect(sheet.rows[0].cells[0]).toEqual({ attendance: "HERE", qt_pages: 6 });
  });

  it("preserves the digits Korean names carry for disambiguation", () => {
    const sheet = normalizeSheet(
      { ...good, rows: [{ ...good.rows[0], korean_name: "김하늘2" }] },
      OPTS,
    );
    expect(sheet.rows[0].korean_name).toBe("김하늘2");
  });

  it("pads a short cells array with flagged blanks rather than dropping the row", () => {
    const sheet = normalizeSheet(
      { ...good, rows: [{ english_name: "Leo Kang", korean_name: null, cells: [] }] },
      OPTS,
    );
    expect(sheet.rows[0].cells).toHaveLength(2);
    expect(sheet.rows[0].cells[0].uncertain).toBe(true);
    expect(sheet.rows[0].cells[0].attendance).toBe("ABSENT");
  });

  it("truncates a cells array longer than the column list", () => {
    const sheet = normalizeSheet(
      {
        ...good,
        rows: [
          {
            english_name: "Leo Kang",
            korean_name: null,
            cells: [
              { attendance: "HERE", qt_pages: 1 },
              { attendance: "HERE", qt_pages: 2 },
              { attendance: "HERE", qt_pages: 3 },
            ],
          },
        ],
      },
      OPTS,
    );
    expect(sheet.rows[0].cells).toHaveLength(2);
  });

  it("treats any non-HERE attendance as ABSENT", () => {
    const sheet = normalizeSheet(
      {
        ...good,
        rows: [
          {
            english_name: "X",
            korean_name: null,
            cells: [{ attendance: "maybe" }, { attendance: "here" }],
          },
        ],
      },
      OPTS,
    );
    expect(sheet.rows[0].cells[0].attendance).toBe("ABSENT");
    // Case-insensitive, so a lowercase "here" still counts as present.
    expect(sheet.rows[0].cells[1].attendance).toBe("HERE");
  });

  it("coerces messy qt_pages values", () => {
    const sheet = normalizeSheet(
      {
        ...good,
        columns: [{ header: "8/31" }, { header: "9/7" }],
        rows: [
          {
            english_name: "X",
            korean_name: null,
            cells: [
              { attendance: "HERE", qt_pages: "7 pages" },
              { attendance: "HERE", qt_pages: -3 },
            ],
          },
        ],
      },
      OPTS,
    );
    expect(sheet.rows[0].cells[0].qt_pages).toBe(7);
    expect(sheet.rows[0].cells[1].qt_pages).toBe(0);
  });

  it("caps an absurd page count that can only be a misread", () => {
    const sheet = normalizeSheet(
      {
        ...good,
        rows: [
          {
            english_name: "X",
            korean_name: null,
            cells: [{ attendance: "HERE", qt_pages: 99999 }, { attendance: "ABSENT" }],
          },
        ],
      },
      OPTS,
    );
    expect(sheet.rows[0].cells[0].qt_pages).toBe(999);
  });

  it("keeps a row that only has a Korean name and flags the missing English name", () => {
    const sheet = normalizeSheet(
      { ...good, rows: [{ english_name: "", korean_name: "유서준", cells: [] }] },
      OPTS,
    );
    expect(sheet.rows[0].english_name).toBe("유서준");
    expect(sheet.rows[0].uncertain_name).toBe(true);
  });

  it("carries the outside_grid flag through", () => {
    const sheet = normalizeSheet(
      {
        ...good,
        rows: [{ english_name: "Seojoon Yoo", korean_name: "유서준", cells: [], outside_grid: true }],
      },
      OPTS,
    );
    expect(sheet.rows[0].outside_grid).toBe(true);
  });

  it("drops fully blank rows", () => {
    const sheet = normalizeSheet(
      { ...good, rows: [...good.rows, { english_name: "", korean_name: "", cells: [] }] },
      OPTS,
    );
    expect(sheet.rows).toHaveLength(1);
  });

  it("throws when there are no columns", () => {
    expect(() => normalizeSheet({ ...good, columns: [] }, OPTS)).toThrow(ExtractionParseError);
  });

  it("throws when there are no usable rows", () => {
    expect(() => normalizeSheet({ ...good, rows: [] }, OPTS)).toThrow(ExtractionParseError);
  });

  it("accepts plain string column headers", () => {
    const sheet = normalizeSheet({ ...good, columns: ["8/31", "9/7"] }, OPTS);
    expect(sheet.columns[0].header).toBe("8/31");
  });
});
