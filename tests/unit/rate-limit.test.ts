import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import {
  checkLoginRate,
  clearLoginRate,
  resetAllLoginRates,
  clientKey,
} from "@/lib/rate-limit";
import { closeDb } from "@/lib/db";

const DB_PATH = path.join(process.cwd(), "data", `rate-limit-${process.pid}.db`);
const FIFTEEN_MIN = 15 * 60 * 1000;

beforeAll(() => {
  process.env.QT_DB_PATH = DB_PATH;
});

beforeEach(async () => {
  await resetAllLoginRates();
});

afterAll(async () => {
  await closeDb(DB_PATH);
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${DB_PATH}${suffix}`, { force: true });
  delete process.env.QT_DB_PATH;
});

describe("login rate limiting", () => {
  it("allows a normal run of attempts", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await checkLoginRate("1.2.3.4")).allowed, `attempt ${i + 1}`).toBe(true);
    }
  });

  it("blocks once the run is exceeded", async () => {
    for (let i = 0; i < 10; i++) await checkLoginRate("1.2.3.4");
    const blocked = await checkLoginRate("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("counts each client separately", async () => {
    for (let i = 0; i < 11; i++) await checkLoginRate("1.2.3.4");
    expect((await checkLoginRate("5.6.7.8")).allowed).toBe(true);
  });

  it("a successful sign-in clears the counter", async () => {
    for (let i = 0; i < 9; i++) await checkLoginRate("1.2.3.4");
    await clearLoginRate("1.2.3.4");
    for (let i = 0; i < 10; i++) {
      expect((await checkLoginRate("1.2.3.4")).allowed).toBe(true);
    }
  });

  it("keeps blocking after the window that tripped it has passed", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 11; i++) await checkLoginRate("1.2.3.4", t0);
    const later = t0 + FIFTEEN_MIN + 1000;
    expect((await checkLoginRate("1.2.3.4", later)).allowed).toBe(false);
  });

  it("lets the client back in once the block expires", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 11; i++) await checkLoginRate("1.2.3.4", t0);
    const afterBlock = t0 + FIFTEEN_MIN * 2 + 60_000;
    expect((await checkLoginRate("1.2.3.4", afterBlock)).allowed).toBe(true);
  });

  it("the lockout is longer than the counting window", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 11; i++) await checkLoginRate("1.2.3.4", t0);
    expect((await checkLoginRate("1.2.3.4", t0 + FIFTEEN_MIN + 1000)).allowed).toBe(false);
    expect((await checkLoginRate("1.2.3.4", t0 + FIFTEEN_MIN * 1.5)).allowed).toBe(false);
  });

  it("reports how many attempts are left", async () => {
    expect((await checkLoginRate("1.2.3.4")).remaining).toBe(9);
    expect((await checkLoginRate("1.2.3.4")).remaining).toBe(8);
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
    expect(clientKey(req({}))).toBe("unknown");
  });
});
