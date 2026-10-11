import { afterEach, describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "@/lib/api";
import { VisionCallError } from "@/lib/vision/providers";

afterEach(() => {
  vi.useRealTimers();
});

describe("vision API error responses", () => {
  it("returns a machine-readable localizable retry time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T16:00:00.000Z"));

    const response = toErrorResponse(
      new VisionCallError("Gemini rate limit reached.", 429, 90),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    await expect(response.json()).resolves.toEqual({
      error: "Gemini rate limit reached.",
      code: "vision_rate_limited",
      retryAt: "2026-10-11T16:01:30.000Z",
      retryAfterSeconds: 90,
    });
  });

  it("does not invent a reset time for depleted credits", async () => {
    const response = toErrorResponse(
      new VisionCallError("Credits do not reset automatically.", 402),
    );

    expect(response.status).toBe(402);
    expect(response.headers.get("retry-after")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Credits do not reset automatically.",
      code: "vision_credits_depleted",
    });
  });
});
