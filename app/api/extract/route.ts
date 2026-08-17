import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { ValidationError } from "@/lib/repo";
import {
  readVisionConfig,
  callVision,
  visionKeyPresent,
  VisionNotConfiguredError,
} from "@/lib/vision/providers";
import { extractJsonObject, normalizeSheet } from "@/lib/vision/parse";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 12 * 1024 * 1024;

const ACCEPTED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Photos straight off an iPhone are often HEIC, which no vision API accepts. */
const HEIC = new Set(["image/heic", "image/heif", "image/heic-sequence"]);

/**
 * Accepts a photo, sends it to whichever vision provider is configured, and
 * returns the parsed grid. It never writes to the database — the human
 * reviews and edits the result first, then POSTs to /api/sheets.
 */
export const POST = withAuth(async (_user, req) => {
  const cfg = readVisionConfig();
  if (cfg.provider === "none") {
    throw new VisionNotConfiguredError(
      "Photo scanning is turned off. Set VISION_PROVIDER in .env.local, or fill the table in by hand.",
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ValidationError("Upload the photo as multipart form data.");
  }

  const file = form.get("photo");
  if (!(file instanceof File)) {
    throw new ValidationError("No photo was attached.");
  }
  if (file.size === 0) {
    throw new ValidationError("That file was empty.");
  }
  if (file.size > MAX_BYTES) {
    throw new ValidationError(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please keep it under 12 MB.`,
    );
  }

  const mime = (file.type || "").toLowerCase();
  if (HEIC.has(mime)) {
    throw new ValidationError(
      "This photo is in HEIC format and your browser could not convert it. On iPhone: Settings → Camera → Formats → Most Compatible, then retake the photo — or fill the table in by hand.",
    );
  }
  if (!ACCEPTED.has(mime)) {
    throw new ValidationError(
      `Unsupported image type${mime ? ` (${mime})` : ""}. Use JPEG, PNG or WebP.`,
    );
  }

  const startYearRaw = form.get("start_year");
  const startYear =
    typeof startYearRaw === "string" && /^\d{4}$/.test(startYearRaw)
      ? Number(startYearRaw)
      : new Date().getFullYear();

  const startMonthRaw = form.get("start_month");
  const startMonth =
    typeof startMonthRaw === "string" && /^\d{1,2}$/.test(startMonthRaw)
      ? Math.min(12, Math.max(1, Number(startMonthRaw)))
      : 8;

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const normalizedMime = mime === "image/jpg" ? "image/jpeg" : mime;

  const reply = await callVision(base64, normalizedMime, cfg);
  const sheet = normalizeSheet(extractJsonObject(reply), { startYear, startMonth });

  return NextResponse.json({ sheet, provider: cfg.provider, model: cfg.model });
});

/** Lets the UI show the right empty state without exposing any key material. */
export const GET = withAuth(async () => {
  const cfg = readVisionConfig();
  return NextResponse.json({
    // "Configured a provider" and "actually has a key" are different things.
    // Reporting the first as enabled would show the dropzone and only fail
    // after someone had already taken the photo.
    enabled: cfg.provider !== "none" && visionKeyPresent(cfg),
    provider: cfg.provider,
    model: cfg.model || null,
  });
});
