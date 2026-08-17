import { NextResponse } from "next/server";
import { updateKid, archiveKid } from "@/lib/repo";
import { withAuth, withAdmin, readJson, requireInt, requireString } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAuth<Ctx>(async (_user, req, ctx) => {
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

  await updateKid(kidId, fields);
  return NextResponse.json({ ok: true });
});

export const DELETE = withAdmin<Ctx>(async (_user, _req, ctx) => {
  const kidId = requireInt((await ctx.params).id, "Kid id");
  // Archive rather than delete: their past weeks stay intact for totals and
  // for any card already printed.
  await archiveKid(kidId);
  return NextResponse.json({ ok: true });
});
