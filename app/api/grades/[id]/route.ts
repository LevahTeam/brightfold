import { NextResponse } from "next/server";
import { withAuth, requireInt } from "@/lib/api";
import { deleteEmptyGrade } from "@/lib/repo";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Delete an unused grade without risking class rosters or attendance history. */
export const DELETE = withAuth<Ctx>(async (user, _req, ctx) => {
  const gradeId = requireInt((await ctx.params).id, "Grade id");
  const result = await deleteEmptyGrade(gradeId, user.username);
  return NextResponse.json({ ok: true, ...result });
});
