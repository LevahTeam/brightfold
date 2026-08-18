import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";

const originalVercel = process.env.VERCEL;
const originalRequired = process.env.QTP_REQUIRE_HOSTED_DB;
const originalUrl = process.env.TURSO_DATABASE_URL;

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  if (originalRequired === undefined) delete process.env.QTP_REQUIRE_HOSTED_DB;
  else process.env.QTP_REQUIRE_HOSTED_DB = originalRequired;
  if (originalUrl === undefined) delete process.env.TURSO_DATABASE_URL;
  else process.env.TURSO_DATABASE_URL = originalUrl;
});

describe("hosted storage safety", () => {
  it("refuses temporary local storage on Vercel", () => {
    process.env.VERCEL = "1";
    delete process.env.TURSO_DATABASE_URL;
    expect(() => getDb()).toThrow(/TURSO_DATABASE_URL is required/);
  });

  it("supports the same guard on another host", () => {
    delete process.env.VERCEL;
    process.env.QTP_REQUIRE_HOSTED_DB = "1";
    delete process.env.TURSO_DATABASE_URL;
    expect(() => getDb()).toThrow(/TURSO_DATABASE_URL is required/);
  });
});
