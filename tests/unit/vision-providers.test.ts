import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callVision,
  readVisionConfig,
  VisionCallError,
  VisionNotConfiguredError,
} from "@/lib/vision/providers";

const ORIGINAL_ENV = {
  provider: process.env.VISION_PROVIDER,
  model: process.env.VISION_MODEL,
  key: process.env.GEMINI_API_KEY,
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.VISION_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key-do-not-return";
  delete process.env.VISION_MODEL;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEnv("VISION_PROVIDER", ORIGINAL_ENV.provider);
  restoreEnv("VISION_MODEL", ORIGINAL_ENV.model);
  restoreEnv("GEMINI_API_KEY", ORIGINAL_ENV.key);
});

describe("Gemini photo extraction provider", () => {
  it("defaults to an available image-capable model and honors an explicit override", () => {
    expect(readVisionConfig()).toEqual({ provider: "gemini", model: "gemini-3.5-flash-lite" });

    process.env.VISION_MODEL = "custom-vision-model";
    expect(readVisionConfig()).toEqual({ provider: "gemini", model: "custom-vision-model" });
  });

  it("uses the default for blank model settings and trims a nonblank override", () => {
    for (const setting of ["", "   "]) {
      process.env.VISION_MODEL = setting;
      expect(readVisionConfig()).toEqual({ provider: "gemini", model: "gemini-3.5-flash-lite" });
    }

    process.env.VISION_MODEL = "  custom-vision-model  ";
    expect(readVisionConfig()).toEqual({ provider: "gemini", model: "custom-vision-model" });
  });

  it("sends the photo to the selected model and returns its JSON text", async () => {
    process.env.VISION_MODEL = "custom-vision-model";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ candidates: [{ content: { parts: [{ text: '{"rows":[]}' }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(callVision("image-data", "image/jpeg", readVisionConfig())).resolves.toBe(
      '{"rows":[]}',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/custom-vision-model:generateContent",
    );
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "test-key-do-not-return",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].parts[0].inline_data).toEqual({
      mime_type: "image/jpeg",
      data: "image-data",
    });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("omits deprecated temperature for the default model but keeps legacy override behavior", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: '{"rows":[]}' }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callVision("image-data", "image/jpeg", readVisionConfig());
    const defaultBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(defaultBody.generationConfig).not.toHaveProperty("temperature");

    process.env.VISION_MODEL = "gemini-2.5-flash";
    await callVision("image-data", "image/jpeg", readVisionConfig());
    const legacyBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(legacyBody.generationConfig.temperature).toBe(0);
  });

  it("explains a 404 model-access failure without leaking the key, photo, or provider body", async () => {
    process.env.VISION_MODEL = "secret-model-token-do-not-return";
    const secretBody = "provider-error-secret-body";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(secretBody, { status: 404 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    let error: unknown;
    try {
      await callVision("private-photo-data", "image/png", readVisionConfig());
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(VisionCallError);
    expect(error).toMatchObject({ status: 404 });
    const message = (error as Error).message;
    expect(message).toMatch(/VISION_MODEL|model access/i);
    expect(message).not.toContain("secret-model-token-do-not-return");
    expect(message).not.toContain(secretBody);
    expect(message).not.toContain("test-key-do-not-return");
    expect(message).not.toContain("private-photo-data");
  });

  it.each([
    [401, /API key/i],
    [429, /rate limit/i],
    [503, /temporarily unavailable/i],
  ])("keeps HTTP %i failures distinct from a missing model", async (status, explanation) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(callVision("image-data", "image/jpeg", readVisionConfig())).rejects.toMatchObject({
      name: "VisionCallError",
      status,
      message: expect.stringMatching(explanation),
    });
  });

  it("carries a provider Retry-After time without exposing the error body", async () => {
    const secretBody = "quota details that stay in the server log";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(secretBody, {
          status: 429,
          headers: { "retry-after": "90" },
        }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(callVision("image-data", "image/jpeg", readVisionConfig())).rejects.toMatchObject({
      name: "VisionCallError",
      status: 429,
      retryAfterSeconds: 90,
      message: expect.not.stringContaining(secretBody),
    });
  });

  it("reads Gemini RetryInfo when the retry header is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 429,
              message: "Quota exceeded. Please retry in 12.4s.",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.RetryInfo",
                  retryDelay: "12.4s",
                },
              ],
            },
          },
          { status: 429 },
        ),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(callVision("image-data", "image/jpeg", readVisionConfig())).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 13,
    });
  });

  it("uses midnight Pacific for a clearly identified daily quota", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T16:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 429,
              message: "Requests per day quota exceeded.",
              quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            },
          },
          { status: 429 },
        ),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(callVision("image-data", "image/jpeg", readVisionConfig())).rejects.toMatchObject({
      status: 429,
      // 9:00 a.m. PDT to midnight PDT is 15 hours.
      retryAfterSeconds: 15 * 60 * 60,
    });
  });

  it("explains that depleted paid credits do not reset automatically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 402 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(callVision("image-data", "image/jpeg", readVisionConfig())).rejects.toMatchObject({
      status: 402,
      message: expect.stringMatching(/do not reset automatically/i),
    });
  });

  it("rejects an absent key before making any provider request", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(callVision("image-data", "image/jpeg", readVisionConfig())).rejects.toBeInstanceOf(
      VisionNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
