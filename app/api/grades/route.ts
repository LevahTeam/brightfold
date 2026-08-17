import { NextResponse } from "next/server";
import { listGrades, createGrade, listClasses } from "@/lib/repo";
import { withAuth, readJson, requireString } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  const grades = await Promise.all(
    (await listGrades()).map(async (g) => ({ ...g, classes: await listClasses(g.id) })),
  );
  return NextResponse.json({ grades });
});

export const POST = withAuth(async (_user, req) => {
  const body = await readJson(req);
  const name = requireString(body.name, "Grade name");
  // Undefined, not 0, when the caller says nothing: `createGrade` appends to
  // the end of the list only when it is left to choose. Passing 0 here put
  // every new grade ahead of the existing ones, which silently changed the
  // default selection on Records and Print Cards.
  const sortOrder = typeof body.sort_order === "number" ? body.sort_order : undefined;
  return NextResponse.json({ grade: await createGrade(name, sortOrder) }, { status: 201 });
});
