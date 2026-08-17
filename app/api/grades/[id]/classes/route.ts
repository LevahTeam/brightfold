import { NextResponse } from "next/server";
import { listClasses, createClass } from "@/lib/repo";
import { withAuth, readJson, requireString, requireInt, optionalString } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_user, _req, ctx) => {
  const gradeId = requireInt((await ctx.params).id, "Grade id");
  return NextResponse.json({ classes: listClasses(gradeId) });
});

export const POST = withAuth<Ctx>(async (_user, req, ctx) => {
  const gradeId = requireInt((await ctx.params).id, "Grade id");
  const body = await readJson(req);
  const label = requireString(body.label, "Class label");
  const teacher = optionalString(body.teacher_name);
  const sortOrder = typeof body.sort_order === "number" ? body.sort_order : 0;
  return NextResponse.json(
    { class: createClass(gradeId, label, teacher, sortOrder) },
    { status: 201 },
  );
});
