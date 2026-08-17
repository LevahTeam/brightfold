import { NextResponse } from "next/server";
import { getLoggedWeekLabels, getClass, ValidationError } from "@/lib/repo";
import { withAuth, requireInt } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Which week labels this class already has data for. The review table calls
 * this before showing a scanned grid so it can leave those columns unticked
 * rather than silently overwriting corrected history.
 */
export const GET = withAuth<Ctx>(async (_user, _req, ctx) => {
  const classId = requireInt((await ctx.params).id, "Class id");
  if (!(await getClass(classId))) throw new ValidationError("That class does not exist.");
  return NextResponse.json({ labels: await getLoggedWeekLabels(classId) });
});
