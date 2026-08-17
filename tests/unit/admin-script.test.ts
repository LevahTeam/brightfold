import { describe, it, expect } from "vitest";
import { verifyPassword, hashPassword as tsHash } from "@/lib/password";
// Plain JS on purpose: the container has no TypeScript runner.
import { hashPassword as jsHash } from "../../scripts/admin.mjs";

/**
 * scripts/admin.mjs re-implements password hashing so it can run with bare
 * `node` inside the container, where no TypeScript runner is guaranteed.
 * Duplication is the price of that; these tests are what stop it drifting.
 *
 * If they ever disagree, accounts created in production would be unable to
 * sign in — and the failure would only show up after deployment.
 */

describe("admin.mjs password hashing", () => {
  it("produces hashes the app accepts", () => {
    const hash = jsHash("a-test-password-123") as string;
    expect(verifyPassword("a-test-password-123", hash)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const hash = jsHash("a-test-password-123") as string;
    expect(verifyPassword("a-test-password-124", hash)).toBe(false);
  });

  it("uses the same stored format as lib/password.ts", () => {
    const js = (jsHash("x") as string).split("$");
    const ts = tsHash("x").split("$");
    expect(js[0]).toBe(ts[0]);
    expect(js).toHaveLength(ts.length);
    // Same salt and key sizes, or verification would fail on length alone.
    expect(Buffer.from(js[1], "base64")).toHaveLength(Buffer.from(ts[1], "base64").length);
    expect(Buffer.from(js[2], "base64")).toHaveLength(Buffer.from(ts[2], "base64").length);
  });

  it("salts every hash", () => {
    expect(jsHash("same")).not.toBe(jsHash("same"));
  });

  it("handles unicode passwords the same way", () => {
    const hash = jsHash("비밀번호123") as string;
    expect(verifyPassword("비밀번호123", hash)).toBe(true);
  });
});
