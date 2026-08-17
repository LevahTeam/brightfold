import { NextResponse } from "next/server";
import { requireUser, requireAdmin, UnauthorizedError, ForbiddenError } from "./auth";
import { withRequestDb } from "./demo";
import { ValidationError } from "./repo";
import { ConfigError } from "./errors";
import { VisionNotConfiguredError, VisionCallError } from "./vision/providers";
import { ExtractionParseError } from "./vision/parse";
import type { User } from "./types";

/**
 * Wraps a route handler so every data endpoint is authenticated by default and
 * failures come back as a consistent `{ error }` shape rather than a stack
 * trace. Forgetting the wrapper is the only way to ship an open endpoint, and
 * every route in this app uses it.
 */
export function withAuth<T>(
  handler: (user: User, req: Request, ctx: T) => Promise<NextResponse> | NextResponse,
) {
  return async (req: Request, ctx: T): Promise<NextResponse> => {
    try {
      // withRequestDb points this request at the right database: the real one
      // normally, the visitor's own private copy in demo mode.
      return await withRequestDb(async () => {
        const user = await requireUser();
        return handler(user, req, ctx);
      });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Same as withAuth, but the action also requires the admin role. */
export function withAdmin<T>(
  handler: (user: User, req: Request, ctx: T) => Promise<NextResponse> | NextResponse,
) {
  return async (req: Request, ctx: T): Promise<NextResponse> => {
    try {
      return await withRequestDb(async () => {
        const user = await requireAdmin();
        return handler(user, req, ctx);
      });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message, code: "forbidden" }, { status: 403 });
  }
  if (err instanceof ConfigError) {
    console.error("[qt-passport] configuration error:", err.message);
    return NextResponse.json({ error: err.message, code: "misconfigured" }, { status: 500 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof VisionNotConfiguredError) {
    return NextResponse.json({ error: err.message, code: "vision_not_configured" }, { status: 503 });
  }
  if (err instanceof VisionCallError) {
    return NextResponse.json(
      { error: err.message, code: "vision_failed" },
      { status: err.status === 429 ? 429 : 502 },
    );
  }
  if (err instanceof ExtractionParseError) {
    return NextResponse.json({ error: err.message, code: "extraction_unreadable" }, { status: 422 });
  }

  console.error("[qt-passport] unhandled route error:", err);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}

/** Parse a JSON body, rejecting anything that is not an object. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body was not valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function requireInt(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n)) throw new ValidationError(`${field} must be a whole number.`);
  return n;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}
