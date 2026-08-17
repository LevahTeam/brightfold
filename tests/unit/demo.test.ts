import { describe, it, expect } from "vitest";
import { isValidDemoId, DEMO_MODE, DEMO_USER } from "@/lib/demo";

/**
 * The demo's whole safety story is that it runs as its own instance with its
 * own database. These check the pieces that would undermine that.
 */

describe("demo mode", () => {
  it("is off unless explicitly switched on", () => {
    // A default-on demo would be a way to serve real records without a login.
    expect(DEMO_MODE).toBe(false);
  });

  it("gives demo visitors an id that cannot be a real user id", () => {
    expect(DEMO_USER.id).toBeLessThan(0);
  });
});

describe("demo visitor ids", () => {
  it("accepts the ids middleware generates", () => {
    expect(isValidDemoId("a".repeat(32))).toBe(true);
    expect(isValidDemoId("0123456789abcdef0123456789abcdef")).toBe(true);
  });

  it("rejects anything that could escape the demo directory", () => {
    // The id becomes a filename, so traversal must never survive validation.
    for (const bad of [
      "../../etc/passwd",
      "..",
      "a/../../b",
      "abc/def",
      "abc\\def",
      "qt-passport",
      "",
      undefined,
    ]) {
      expect(isValidDemoId(bad as string | undefined), `should reject ${JSON.stringify(bad)}`).toBe(
        false,
      );
    }
  });

  it("rejects ids that are too short to be unguessable", () => {
    expect(isValidDemoId("abc123")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidDemoId("z".repeat(32))).toBe(false);
  });
});
