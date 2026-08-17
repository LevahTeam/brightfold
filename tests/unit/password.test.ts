import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("accepts the correct password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("Correct horse battery staple", hash)).toBe(false);
  });

  it("salts every hash so identical passwords do not collide", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("never stores the password in the hash string", () => {
    expect(hashPassword("hunter2")).not.toContain("hunter2");
  });

  it("returns false on a malformed stored hash instead of throwing", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$$")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt$abc$def")).toBe(false);
  });

  it("handles unicode passwords", () => {
    const hash = hashPassword("비밀번호123");
    expect(verifyPassword("비밀번호123", hash)).toBe(true);
    expect(verifyPassword("비밀번호124", hash)).toBe(false);
  });
});
