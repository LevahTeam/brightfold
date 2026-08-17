import { NextResponse } from "next/server";
import { authenticate, setSessionCookie } from "@/lib/auth";
import { readJson, toErrorResponse } from "@/lib/api";
import { checkLoginRate, clearLoginRate, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Deliberately not wrapped in withAuth — this is the one endpoint anonymous
 * visitors are allowed to reach, which is also why it is the one that needs
 * throttling.
 */
export async function POST(req: Request) {
  try {
    const key = clientKey(req);
    const rate = checkLoginRate(key);
    if (!rate.allowed) {
      const minutes = Math.ceil(rate.retryAfter / 60);
      return NextResponse.json(
        {
          error: `Too many sign-in attempts. Try again in about ${minutes} minute${
            minutes === 1 ? "" : "s"
          }.`,
        },
        { status: 429, headers: { "retry-after": String(rate.retryAfter) } },
      );
    }

    const body = await readJson(req);
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Enter both a username and a password." },
        { status: 400 },
      );
    }

    const user = await authenticate(username, password);
    if (!user) {
      // Same message either way — never reveal which half was wrong.
      return NextResponse.json(
        { error: "That username and password do not match." },
        { status: 401 },
      );
    }

    clearLoginRate(key);
    await setSessionCookie(user.id);
    return NextResponse.json({ user });
  } catch (err) {
    return toErrorResponse(err);
  }
}
