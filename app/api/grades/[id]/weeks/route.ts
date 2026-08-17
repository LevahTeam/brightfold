import { NextResponse } from "next/server";
import { listWeeks, upsertWeek } from "@/lib/repo";
import { withAuth, readJson, requireString, requireInt, optionalString } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_user, _req, ctx) => {
  const gradeId = requireInt((await ctx.params).id, "Grade id");
  return NextResponse.json({ weeks: await listWeeks(gradeId) });
});

export const POST = withAuth<Ctx>(async (_user, req, ctx) => {
  const gradeId = requireInt((await ctx.params).id, "Grade id");
  const body = await readJson(req);
  const label = requireString(body.label, "Week label");
  const date = optionalString(body.attendance_date);
  return NextResponse.json({ week: await upsertWeek(gradeId, label, date) }, { status: 201 });
});
