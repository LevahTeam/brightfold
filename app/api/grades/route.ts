import { NextResponse } from "next/server";
import { listGrades, createGrade, listClasses } from "@/lib/repo";
import { withAuth, readJson, requireString } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  const grades = listGrades().map((g) => ({ ...g, classes: listClasses(g.id) }));
  return NextResponse.json({ grades });
});

export const POST = withAuth(async (_user, req) => {
  const body = await readJson(req);
  const name = requireString(body.name, "Grade name");
  const sortOrder = typeof body.sort_order === "number" ? body.sort_order : 0;
  return NextResponse.json({ grade: createGrade(name, sortOrder) }, { status: 201 });
});
