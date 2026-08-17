import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-side gate.
 *
 * It only checks that a session cookie is present and roughly well formed. The
 * signature is verified in `requireUser()` on the Node runtime, where the HMAC
 * secret and the database are available. The job here is to send anonymous
 * visitors to /login before a page renders.
 *
 * In demo mode there is no sign-in at all, so instead it hands each visitor an
 * id that identifies their own private copy of the sample data.
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const DEMO_COOKIE = "qtp_demo";

function isDemo(): boolean {
  return process.env.DEMO_MODE === "1";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (isDemo()) {
    const res = NextResponse.next();
    if (!/^[a-f0-9]{32}$/i.test(req.cookies.get(DEMO_COOKIE)?.value ?? "")) {
      // A fresh visitor gets their own workspace. Not a security boundary —
      // it only keeps one visitor's edits out of another's view.
      res.cookies.set(DEMO_COOKIE, crypto.randomUUID().replace(/-/g, ""), {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 6,
      });
    }
    return res;
  }

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get("qtp_session")?.value;
  if (token && token.includes(".")) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
