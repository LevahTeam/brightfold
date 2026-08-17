import { NextResponse } from "next/server";
import { getRecords, getGrade, listClasses } from "@/lib/repo";
import { withAuth, requireInt } from "@/lib/api";
import { ValidationError } from "@/lib/repo";

export const runtime = "nodejs";

export const GET = withAuth(async (_user, req) => {
  const url = new URL(req.url);
  const gradeId = requireInt(url.searchParams.get("gradeId"), "gradeId");

  const grade = getGrade(gradeId);
  if (!grade) throw new ValidationError("That grade does not exist.");

  const rawClassId = url.searchParams.get("classId");
  const classId =
    rawClassId && rawClassId !== "all" ? requireInt(rawClassId, "classId") : undefined;

  const { weeks, rows } = getRecords(gradeId, classId);
  return NextResponse.json({ grade, classes: listClasses(gradeId), weeks, rows });
});
