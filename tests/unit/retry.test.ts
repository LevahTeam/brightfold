import { describe, expect, it } from "vitest";
import { formatRetryWait, parseRetryAt } from "@/lib/client/retry";

describe("scan retry display", () => {
  it.each([
    [1_000, "1 second"],
    [29_100, "30 seconds"],
    [60_000, "1 minute"],
    [61_000, "2 minutes"],
    [3_600_000, "1 hour"],
    [3_660_000, "1 hour 1 minute"],
  ])("formats a %i ms wait", (milliseconds, expected) => {
    expect(formatRetryWait(milliseconds)).toBe(expected);
  });

  it("accepts valid API timestamps and rejects missing or malformed ones", () => {
    expect(parseRetryAt("2026-10-11T16:01:30.000Z")).toBe(1791734490000);
    expect(parseRetryAt("not-a-date")).toBeNull();
    expect(parseRetryAt(undefined)).toBeNull();
  });
});
