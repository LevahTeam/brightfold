import { NextResponse } from "next/server";
import { updateKid, deleteKid } from "@/lib/repo";
import { withAuth, readJson, requireInt, requireString } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAuth<Ctx>(async (user, req, ctx) => {
  const kidId = requireInt((await ctx.params).id, "Kid id");
  const body = await readJson(req);

  const fields: { english_name?: string; korean_name?: string | null } = {};
  if (body.english_name !== undefined) {
    fields.english_name = requireString(body.english_name, "English name");
  }
  if (body.korean_name !== undefined) {
    fields.korean_name =
      typeof body.korean_name === "string" ? body.korean_name.trim() || null : null;
  }

  await updateKid(kidId, fields, user.username);
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth<Ctx>(async (user, _req, ctx) => {
  const kidId = requireInt((await ctx.params).id, "Kid id");
  return NextResponse.json({ ok: true, ...(await deleteKid(kidId, user.username)) });
});
