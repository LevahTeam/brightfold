import type { ExtractedSheet, ExtractedRow, ExtractedCell, Attendance } from "../types";

/**
 * Models occasionally wrap JSON in prose or a markdown fence even when asked
 * not to, and they sometimes return a cells array that is a column short.
 * Everything here is about turning a plausible-but-imperfect reply into a
 * shape the review table can render, rather than throwing the whole scan away.
 */

export class ExtractionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionParseError";
  }
}

/** Pull the first balanced JSON object out of a possibly-chatty reply. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to brace scanning */
  }

  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new ExtractionParseError("The model did not return any JSON.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch (err) {
          throw new ExtractionParseError(
            `The model's reply was not valid JSON: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  throw new ExtractionParseError("The model's JSON reply was cut off before it finished.");
}

function asAttendance(value: unknown): Attendance {
  if (typeof value === "string" && value.trim().toUpperCase() === "HERE") return "HERE";
  return "ABSENT";
}

function asPages(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.replace(/[^\d-]/g, ""), 10)
        : 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  // A hand-written QT count in the hundreds is a misread, not a real value.
  return Math.min(Math.trunc(n), 999);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

/**
 * Resolve a "8/31"-style header to an ISO date. Ministry years run across a
 * calendar boundary, so months from `startMonth` onward belong to
 * `startYear` and earlier months roll into the next year.
 */
export function resolveHeaderDate(
  header: string,
  startYear: number,
  startMonth: number,
): string | null {
  const m = header.trim().match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = month >= startMonth ? startYear : startYear + 1;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== day) return null;
  return iso;
}

export interface NormalizeOptions {
  /** First calendar year of the ministry year, e.g. 2025 for a 2025–26 term. */
  startYear: number;
  /** Month the ministry year begins, 1-indexed. August by default. */
  startMonth?: number;
}

export function normalizeSheet(raw: unknown, opts: NormalizeOptions): ExtractedSheet {
  if (typeof raw !== "object" || raw === null) {
    throw new ExtractionParseError("The model returned something that was not an object.");
  }
  const obj = raw as Record<string, unknown>;
  const startMonth = opts.startMonth ?? 8;

  const rawColumns = Array.isArray(obj.columns) ? obj.columns : [];
  const columns = rawColumns
    .map((c) => {
      const header =
        typeof c === "string"
          ? c
          : asTrimmedString((c as Record<string, unknown> | null)?.header);
      if (!header) return null;
      return { header, date: resolveHeaderDate(header, opts.startYear, startMonth) };
    })
    .filter((c): c is { header: string; date: string | null } => c !== null);

  if (columns.length === 0) {
    throw new ExtractionParseError(
      "No dated columns were found on the sheet. Try a sharper, straighter photo, or fill the table in by hand.",
    );
  }

  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  const rows: ExtractedRow[] = [];

  for (const r of rawRows) {
    if (typeof r !== "object" || r === null) continue;
    const row = r as Record<string, unknown>;

    const english = asTrimmedString(row.english_name);
    const korean = asTrimmedString(row.korean_name);
    if (!english && !korean) continue;

    const rawCells = Array.isArray(row.cells) ? row.cells : [];
    const cells: ExtractedCell[] = columns.map((_, i) => {
      const c = rawCells[i];
      if (typeof c !== "object" || c === null) {
        // A short or ragged cells array means the model lost its place. Fill
        // the gap with a flagged blank so the reviewer sees it needs a look
        // rather than silently recording an absence.
        return { attendance: "ABSENT", qt_pages: 0, uncertain: true };
      }
      const cell = c as Record<string, unknown>;
      const out: ExtractedCell = {
        attendance: asAttendance(cell.attendance),
        qt_pages: asPages(cell.qt_pages),
      };
      if (cell.uncertain === true) out.uncertain = true;
      return out;
    });

    rows.push({
      english_name: english ?? korean ?? "",
      korean_name: korean,
      cells,
      outside_grid: row.outside_grid === true,
      uncertain_name: row.uncertain_name === true || !english,
    });
  }

  if (rows.length === 0) {
    throw new ExtractionParseError(
      "No kid rows were found on the sheet. Try a sharper, straighter photo, or fill the table in by hand.",
    );
  }

  const notes = Array.isArray(obj.notes)
    ? obj.notes.map(asTrimmedString).filter((n): n is string => n !== null).slice(0, 10)
    : [];

  return {
    class_label: asTrimmedString(obj.class_label),
    teacher_name: asTrimmedString(obj.teacher_name),
    columns,
    rows,
    notes,
  };
}
