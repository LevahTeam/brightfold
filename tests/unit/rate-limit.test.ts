import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLoginRate,
  clearLoginRate,
  resetAllLoginRates,
  clientKey,
} from "@/lib/rate-limit";

beforeEach(resetAllLoginRates);

const FIFTEEN_MIN = 15 * 60 * 1000;

describe("login rate limiting", () => {
  it("allows a normal run of attempts", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkLoginRate("1.2.3.4").allowed, `attempt ${i + 1}`).toBe(true);
    }
  });

  it("blocks once the run is exceeded", () => {
    for (let i = 0; i < 10; i++) checkLoginRate("1.2.3.4");
    const blocked = checkLoginRate("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("counts each client separately", () => {
    for (let i = 0; i < 11; i++) checkLoginRate("1.2.3.4");
    // One attacker must not lock the pastor out.
    expect(checkLoginRate("5.6.7.8").allowed).toBe(true);
  });

  it("a successful sign-in clears the counter", () => {
    for (let i = 0; i < 9; i++) checkLoginRate("1.2.3.4");
    clearLoginRate("1.2.3.4");
    for (let i = 0; i < 10; i++) {
      expect(checkLoginRate("1.2.3.4").allowed).toBe(true);
    }
  });

  it("keeps blocking after the window that tripped it has passed", () => {
    const t0 = Date.now();
    for (let i = 0; i < 11; i++) checkLoginRate("1.2.3.4", t0);

    // The counting window has rolled over, but the block has not expired.
    const later = t0 + FIFTEEN_MIN + 1000;
    expect(checkLoginRate("1.2.3.4", later).allowed).toBe(false);
  });

  it("lets the client back in once the block expires", () => {
    const t0 = Date.now();
    for (let i = 0; i < 11; i++) checkLoginRate("1.2.3.4", t0);

    // Block is 30 minutes, so this is comfortably past it.
    const afterBlock = t0 + FIFTEEN_MIN * 2 + 60_000;
    expect(checkLoginRate("1.2.3.4", afterBlock).allowed).toBe(true);
  });

  it("the lockout is longer than the counting window", () => {
    const t0 = Date.now();
    for (let i = 0; i < 11; i++) checkLoginRate("1.2.3.4", t0);

    // Still blocked one window later — otherwise burst-retrying forever works.
    expect(checkLoginRate("1.2.3.4", t0 + FIFTEEN_MIN + 1000).allowed).toBe(false);
    expect(checkLoginRate("1.2.3.4", t0 + FIFTEEN_MIN * 1.5).allowed).toBe(false);
  });

  it("reports how many attempts are left", () => {
    expect(checkLoginRate("1.2.3.4").remaining).toBe(9);
    expect(checkLoginRate("1.2.3.4").remaining).toBe(8);
  });
});

describe("clientKey", () => {
  function req(headers: Record<string, string>) {
    return new Request("http://localhost/api/auth/login", { headers });
  }

  it("uses the first hop of x-forwarded-for", () => {
    expect(clientKey(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(req({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("still returns a usable key with no proxy headers", () => {
    // A single shared bucket is worse than per-client, but it still bounds
    // total attempts rather than disabling the limiter.
    expect(clientKey(req({}))).toBe("unknown");
  });
});
