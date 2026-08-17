import { NextResponse } from "next/server";
import { saveSheet, ValidationError } from "@/lib/repo";
import { withAuth, readJson, requireInt } from "@/lib/api";
import type { Attendance } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Commit a reviewed grid. The client sends whatever the human approved in the
 * review table, not the raw model output — this endpoint never talks to the
 * vision provider.
 */
export const POST = withAuth(async (user, req) => {
  const body = await readJson(req);
  const classId = requireInt(body.class_id, "class_id");

  if (!Array.isArray(body.week_ids) || body.week_ids.length === 0) {
    throw new ValidationError("Pick at least one week to save.");
  }
  const weekIds = body.week_ids.map((w) => requireInt(w, "week_ids entry"));

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    throw new ValidationError("There are no rows to save.");
  }

  const rows = body.rows.map((raw, rowIndex) => {
    if (typeof raw !== "object" || raw === null) {
      throw new ValidationError(`Row ${rowIndex + 1} is malformed.`);
    }
    const r = raw as Record<string, unknown>;

    const english = typeof r.english_name === "string" ? r.english_name.trim() : "";
    if (!english) {
      throw new ValidationError(`Row ${rowIndex + 1} is missing an English name.`);
    }

    const korean = typeof r.korean_name === "string" ? r.korean_name.trim() || null : null;

    const rawCells = Array.isArray(r.cells) ? r.cells : [];
    if (rawCells.length !== weekIds.length) {
      throw new ValidationError(
        `Row ${rowIndex + 1} has ${rawCells.length} values but ${weekIds.length} weeks were selected.`,
      );
    }

    const cells = rawCells.map((c, colIndex) => {
      const cell = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>;
      const attendance = cell.attendance === "HERE" ? "HERE" : "ABSENT";
      const pages = requireInt(cell.qt_pages ?? 0, `Row ${rowIndex + 1} column ${colIndex + 1}`);
      if (pages < 0) {
        throw new ValidationError(
          `Row ${rowIndex + 1} column ${colIndex + 1}: QT pages cannot be negative.`,
        );
      }
      return { attendance: attendance as Attendance, qt_pages: pages };
    });

    return { english_name: english, korean_name: korean, cells };
  });

  const result = saveSheet({ classId, weekIds, rows, updatedBy: user.username });
  return NextResponse.json(result);
});
