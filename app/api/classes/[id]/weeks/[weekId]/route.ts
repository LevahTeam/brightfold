import { NextResponse } from "next/server";
import { withAuth, requireInt } from "@/lib/api";
import { clearClassWeekEntries } from "@/lib/repo";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; weekId: string }> };

export const DELETE = withAuth<Ctx>(async (user, _req, ctx) => {
  const params = await ctx.params;
  const classId = requireInt(params.id, "Class id");
  const weekId = requireInt(params.weekId, "Week id");
  return NextResponse.json({
    ok: true,
    ...(await clearClassWeekEntries(classId, weekId, user.username)),
  });
});
