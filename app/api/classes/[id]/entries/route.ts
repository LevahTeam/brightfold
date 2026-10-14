import { NextResponse } from "next/server";
import { withAuth, requireInt } from "@/lib/api";
import { clearClassEntries } from "@/lib/repo";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>(async (user, _req, ctx) => {
  const classId = requireInt((await ctx.params).id, "Class id");
  return NextResponse.json({ ok: true, ...(await clearClassEntries(classId, user.username)) });
});
