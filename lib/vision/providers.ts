import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";

/**
 * Vision is deliberately provider-agnostic so this can run entirely on free
 * tiers. Set VISION_PROVIDER + the matching key in .env.local; the app works
 * without any of them (manual entry stays available either way).
 *
 * The API key is only ever read here, on the server. It is never sent to the
 * browser and never appears in a response body.
 */

export type ProviderId = "gemini" | "openai-compatible" | "anthropic" | "none";

export interface VisionConfig {
  provider: ProviderId;
  model: string;
  /** Present only for openai-compatible providers (Groq, OpenRouter, ...). */
  baseUrl?: string;
}

export class VisionNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionNotConfiguredError";
  }
}

export class VisionCallError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VisionCallError";
  }
}

/** Env var holding the key for each provider, so the UI can say when it is missing. */
const KEY_VAR: Record<Exclude<ProviderId, "none">, string> = {
  gemini: "GEMINI_API_KEY",
  "openai-compatible": "VISION_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

/**
 * Whether the configured provider actually has a key. Checked before the UI
 * offers the dropzone, so a missing key is caught up front rather than after
 * someone has walked to the classroom and taken the photo.
 */
export function visionKeyPresent(cfg: VisionConfig): boolean {
  if (cfg.provider === "none") return false;
  return Boolean(process.env[KEY_VAR[cfg.provider]]);
}

export function readVisionConfig(): VisionConfig {
  const provider = (process.env.VISION_PROVIDER ?? "none").trim() as ProviderId;

  switch (provider) {
    case "gemini":
      return {
        provider,
        model: process.env.VISION_MODEL ?? "gemini-2.5-flash",
      };
    case "openai-compatible":
      return {
        provider,
        model: process.env.VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
        baseUrl: process.env.VISION_BASE_URL ?? "https://api.groq.com/openai/v1",
      };
    case "anthropic":
      return { provider, model: process.env.VISION_MODEL ?? "claude-opus-5" };
    default:
      return { provider: "none", model: "" };
  }
}

/**
 * Free-tier endpoints can hang rather than fail. Without a deadline the user
 * watches a spinner indefinitely with no way out but a reload, which loses the
 * grid they were about to review.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS ?? 90_000);

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new VisionCallError(
        `The scan took longer than ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s and was stopped. Try again, or fill the table in by hand.`,
      );
    }
    throw new VisionCallError(
      `Could not reach the vision provider: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function requireKey(name: string): string {
  const key = process.env[name];
  if (!key) {
    throw new VisionNotConfiguredError(
      `${name} is not set. Add it to .env.local, or fill the table in by hand.`,
    );
  }
  return key;
}

/** Returns the model's raw text reply, which the caller parses as JSON. */
export async function callVision(
  imageBase64: string,
  mimeType: string,
  cfg: VisionConfig,
): Promise<string> {
  switch (cfg.provider) {
    case "gemini":
      return callGemini(imageBase64, mimeType, cfg);
    case "openai-compatible":
      return callOpenAiCompatible(imageBase64, mimeType, cfg);
    case "anthropic":
      return callAnthropic(imageBase64, mimeType, cfg);
    default:
      throw new VisionNotConfiguredError(
        "No vision provider is configured. Set VISION_PROVIDER in .env.local, or fill the table in by hand.",
      );
  }
}

// -------------------------------------------------------------- providers

async function callGemini(
  imageBase64: string,
  mimeType: string,
  cfg: VisionConfig,
): Promise<string> {
  const key = requireKey("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model,
  )}:generateContent`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: EXTRACTION_USER_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        // A 17-column grid for a dozen kids is a large JSON reply, and the
        // Flash models spend tokens thinking before they emit any of it.
        // Without an explicit ceiling the response gets truncated and comes
        // back with no parts at all.
        maxOutputTokens: 32768,
      },
    }),
  });

  if (!res.ok) {
    throw new VisionCallError(await describeFailure(res, "Gemini"), res.status);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");

  if (!text) {
    // Say *why* it came back empty — "empty response" alone is a dead end.
    const reason = candidate?.finishReason ?? json.promptFeedback?.blockReason;
    if (reason === "MAX_TOKENS") {
      throw new VisionCallError(
        "The sheet was too large for the model to finish reading in one go. Try photographing fewer columns, or fill the table in by hand.",
      );
    }
    if (reason === "SAFETY" || json.promptFeedback?.blockReason) {
      throw new VisionCallError(
        "The model declined to process this image. Fill the table in by hand.",
      );
    }
    throw new VisionCallError(
      `Gemini returned no readable text${reason ? ` (${reason})` : ""}. Try a clearer photo, or fill the table in by hand.`,
    );
  }
  return text;
}

async function callOpenAiCompatible(
  imageBase64: string,
  mimeType: string,
  cfg: VisionConfig,
): Promise<string> {
  const key = requireKey("VISION_API_KEY");
  const res = await fetchWithTimeout(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: "text", text: EXTRACTION_USER_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new VisionCallError(await describeFailure(res, "vision provider"), res.status);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new VisionCallError("Vision provider returned an empty response.");
  return text;
}

async function callAnthropic(
  imageBase64: string,
  mimeType: string,
  cfg: VisionConfig,
): Promise<string> {
  const key = requireKey("ANTHROPIC_API_KEY");
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBase64 },
            },
            { type: "text", text: EXTRACTION_USER_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new VisionCallError(await describeFailure(res, "Anthropic"), res.status);
  }
  const json = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (json.stop_reason === "refusal") {
    throw new VisionCallError("The model declined to process this image.");
  }
  const text = json.content
    ?.filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (!text) throw new VisionCallError("Anthropic returned an empty response.");
  return text;
}

/**
 * Surface why a call failed without ever echoing the request (which contains
 * the image) or anything key-shaped back to the client.
 */
async function describeFailure(res: Response, label: string): Promise<string> {
  // The body is logged server-side but never returned: provider errors can
  // echo back request fragments, and there is nothing in there a volunteer
  // could act on anyway.
  try {
    console.error(`[qt-passport] ${label} HTTP ${res.status}:`, (await res.text()).slice(0, 500));
  } catch {
    /* body already consumed or unreadable */
  }

  if (res.status === 401 || res.status === 403) {
    return `${label} rejected the API key (HTTP ${res.status}). Check the key in .env.local.`;
  }
  if (res.status === 429) {
    return `${label} rate limit reached (HTTP 429). Free tiers cap requests per minute — wait a moment and try again, or fill the table in by hand.`;
  }
  if (res.status >= 500) {
    return `${label} is temporarily unavailable (HTTP ${res.status}). Try again shortly.`;
  }
  return `${label} returned HTTP ${res.status}. The details are in the server log. You can fill the table in by hand instead.`;
}
