import { NextResponse } from "next/server";
import { getDb, queryOne } from "@/lib/db";
import { deleteWeek, ValidationError } from "@/lib/repo";
import { withAdmin, requireInt } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Remove a week and every entry in it. Admin only — this wipes a column from
 * every class in the grade, so it is not something to do by accident.
 *
 * Weeks are grade-scoped, so a column created by a mistyped label or an
 * interrupted save shows up in every class in that grade, on every Records
 * view and every printed card. Without this there was no way to take it back.
 */
export const DELETE = withAdmin<Ctx>(async (_user, _req, ctx) => {
  const weekId = requireInt((await ctx.params).id, "Week id");

  const week = queryOne<{ id: number; label: string }>(
    "SELECT id, label FROM weeks WHERE id = ?",
    weekId,
  );
  if (!week) throw new ValidationError("That week does not exist.");

  const count = queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM entries WHERE week_id = ?",
    weekId,
  );

  // Entries cascade via the foreign key, but report what went with it so the
  // caller can say so plainly rather than deleting silently.
  getDb().exec("PRAGMA foreign_keys = ON");
  deleteWeek(weekId);

  return NextResponse.json({ ok: true, label: week.label, entriesRemoved: count?.n ?? 0 });
});
