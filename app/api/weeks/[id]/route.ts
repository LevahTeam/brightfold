import { NextResponse } from "next/server";
import { deleteWeek } from "@/lib/repo";
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
export const DELETE = withAdmin<Ctx>(async (user, _req, ctx) => {
  const weekId = requireInt((await ctx.params).id, "Week id");
  const result = await deleteWeek(weekId, user.username);
  return NextResponse.json({ ok: true, ...result });
});
