"use client";

/**
 * Convert a phone photo into a practical vision-API upload in the browser.
 *
 * This handles two common problems:
 *
 * 1. HEIC. iPhones commonly produce HEIC files, which the configured vision
 *    APIs do not accept. Safari—and therefore iOS Chrome—can decode HEIC into
 *    a canvas, allowing the client to send the server a usable JPEG.
 *
 * 2. File size. A 12 MP image can exceed free-tier request limits. Restricting
 *    the long edge to 2400 px greatly reduces the upload while preserving
 *    legible handwriting on the tested sheet.
 *
 * On failure, return the original file and let server validation explain the
 * unsupported input to the user.
 */

const MAX_EDGE = 2400;
const QUALITY = 0.85;

export interface PreparedImage {
  file: File;
  /** True when the browser re-encoded the image. */
  converted: boolean;
  originalBytes: number;
}

export async function prepareSheetPhoto(input: File): Promise<PreparedImage> {
  const originalBytes = input.size;

  const bitmap = await decode(input);
  if (!bitmap) return { file: input, converted: false, originalBytes };

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return { file: input, converted: false, originalBytes };

    // JPEG cannot retain transparency. Paint white first so transparent input
    // does not receive a black background that obscures the writing.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return { file: input, converted: false, originalBytes };

    const name = input.name.replace(/\.[^.]+$/, "") || "sheet";
    return {
      file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }),
      converted: true,
      originalBytes,
    };
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

async function decode(file: File): Promise<ImageBitmap | null> {
  // Prefer createImageBitmap for formats the current browser can decode,
  // including HEIC in Safari.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> path */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img) return null;
    return await createImageBitmap(img);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
