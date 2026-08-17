import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DEMO_MODE, DEMO_COOKIE, resetDemo } from "@/lib/demo";

export const runtime = "nodejs";

/** Throws away this visitor's demo copy; the next page load reseeds it. */
export async function POST() {
  if (!DEMO_MODE) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  if (id) await resetDemo(id);
  return NextResponse.json({ ok: true });
}
