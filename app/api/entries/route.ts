import { NextResponse } from "next/server";
import { setEntry, assertWeekMatchesKid } from "@/lib/repo";
import { withAuth, readJson, requireInt } from "@/lib/api";
import { ValidationError } from "@/lib/repo";
import type { Attendance } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Inline correction from the Records grid: fix one cell without re-uploading
 * a photo. Deliberately one cell per call — the grid saves on blur, and a
 * failed save should never take a neighbouring edit down with it.
 */
export const POST = withAuth(async (user, req) => {
  const body = await readJson(req);
  const kidId = requireInt(body.kid_id, "kid_id");
  const weekId = requireInt(body.week_id, "week_id");

  const attendance = body.attendance;
  if (attendance !== "HERE" && attendance !== "ABSENT") {
    throw new ValidationError("Attendance must be HERE or ABSENT.");
  }

  const qtPages = requireInt(body.qt_pages, "qt_pages");
  if (qtPages < 0) throw new ValidationError("QT pages cannot be negative.");

  assertWeekMatchesKid(kidId, weekId);
  setEntry(kidId, weekId, attendance as Attendance, qtPages, user.username);
  return NextResponse.json({ ok: true });
});
