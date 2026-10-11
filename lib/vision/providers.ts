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
    /** Provider-supplied wait. Undefined means the provider gave no safe reset time. */
    readonly retryAfterSeconds?: number,
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
        model: process.env.VISION_MODEL?.trim() || "gemini-3.5-flash-lite",
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
        // Gemini 3.5 Flash-Lite ignores sampling parameters, and newer models
        // can reject them. Keep the existing setting for explicit older models.
        ...(cfg.model === "gemini-3.5-flash-lite" ? {} : { temperature: 0 }),
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
    const failure = await describeFailure(res, "Gemini");
    throw new VisionCallError(failure.message, res.status, failure.retryAfterSeconds);
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
    const failure = await describeFailure(res, "vision provider");
    throw new VisionCallError(failure.message, res.status, failure.retryAfterSeconds);
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
    const failure = await describeFailure(res, "Anthropic");
    throw new VisionCallError(failure.message, res.status, failure.retryAfterSeconds);
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
interface FailureDescription {
  message: string;
  retryAfterSeconds?: number;
}

/** Read either Retry-After or Google's RetryInfo without exposing the body. */
function retryAfterSeconds(res: Response, body: string): number | undefined {
  const header = res.headers.get("retry-after")?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);

    const retryDate = Date.parse(header);
    if (Number.isFinite(retryDate)) {
      const wait = Math.ceil((retryDate - Date.now()) / 1000);
      if (wait > 0) return wait;
    }
  }

  // Gemini's JSON error commonly contains `"retryDelay":"12.4s"`, and
  // some responses put the same duration in the human-readable message.
  const match = body.match(
    /(?:retryDelay["']?\s*:\s*["']|retry(?:\s+in|\s+after)?\s+)(\d+(?:\.\d+)?)\s*(ms|s|seconds?|m|minutes?|h|hours?)/i,
  );
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2].toLowerCase();
  const multiplier = unit === "ms" ? 0.001 : unit.startsWith("m") ? 60 : unit.startsWith("h") ? 3600 : 1;
  const seconds = Math.ceil(amount * multiplier);
  // Ignore absurd or malformed provider values rather than disabling uploads
  // indefinitely. A legitimate daily reset is comfortably below this cap.
  return seconds > 0 && seconds <= 31 * 24 * 60 * 60 ? seconds : undefined;
}

/** Google documents request-per-day quotas as resetting at midnight Pacific. */
function secondsUntilPacificMidnight(now = Date.now()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(now))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const desiredUtc = Date.UTC(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth(),
    nextDate.getUTCDate(),
  );

  // Resolve Pacific midnight to UTC. Iterating accommodates daylight-saving
  // offsets without hard-coding whether midnight is currently UTC-7 or UTC-8.
  let target = desiredUtc;
  for (let i = 0; i < 3; i++) {
    const observed = Object.fromEntries(
      formatter
        .formatToParts(new Date(target))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    target += desiredUtc - observedAsUtc;
  }

  return Math.max(1, Math.ceil((target - now) / 1000));
}

function isDailyQuota(body: string): boolean {
  return /(?:requests?\s+per\s+day|per.?day|\bRPD\b)/i.test(body);
}

async function describeFailure(res: Response, label: string): Promise<FailureDescription> {
  // The body is logged server-side but never returned: provider errors can
  // echo back request fragments, and there is nothing in there a volunteer
  // could act on anyway.
  let body = "";
  try {
    body = await res.text();
    console.error(`[qt-passport] ${label} HTTP ${res.status}:`, body.slice(0, 500));
  } catch {
    /* body already consumed or unreadable */
  }

  if (res.status === 401 || res.status === 403) {
    return {
      message: `${label} rejected the API key (HTTP ${res.status}). Check the key in .env.local.`,
    };
  }
  if (res.status === 402) {
    return {
      message: `${label} API credits are depleted (HTTP 402). Credits do not reset automatically; add credits or use a project with free-tier quota, or fill the table in by hand.`,
    };
  }
  if (res.status === 429) {
    const retry =
      retryAfterSeconds(res, body) ??
      (isDailyQuota(body) ? secondsUntilPacificMidnight() : undefined);
    return {
      message: retry
        ? `${label} rate limit reached (HTTP 429). The reset time is shown below.`
        : `${label} rate limit reached (HTTP 429), but Google did not provide a reset time. Try again later, check AI Studio quotas, or fill the table in by hand.`,
      retryAfterSeconds: retry,
    };
  }
  if (res.status === 404 && label === "Gemini") {
    return {
      message: `${label} could not use the configured model (HTTP 404). Check VISION_MODEL in the server settings and whether the model is available to your API key, then try again or fill the table in by hand.`,
    };
  }
  if (res.status >= 500) {
    return {
      message: `${label} is temporarily unavailable (HTTP ${res.status}). Try again shortly.`,
    };
  }
  return {
    message: `${label} returned HTTP ${res.status}. The details are in the server log. You can fill the table in by hand instead.`,
  };
}
