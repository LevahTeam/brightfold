import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The real records stay on one church computer. Only the demo — which contains
 * nothing but invented names — is ever published.
 *
 * `fly deploy` reads fly.toml by default, so the single most dangerous
 * accident is a fly.toml that deploys the real app. These tests exist to make
 * that impossible to do quietly.
 */

const ROOT = path.resolve(__dirname, "../..");

function flyConfigs(): string[] {
  return readdirSync(ROOT).filter((f) => f.startsWith("fly") && f.endsWith(".toml"));
}

describe("deployment safety", () => {
  it("has a fly.toml at all (otherwise these checks pass vacuously)", () => {
    expect(existsSync(path.join(ROOT, "fly.toml"))).toBe(true);
  });

  it("every Fly config deploys the demo, never the real app", () => {
    for (const file of flyConfigs()) {
      const contents = readFileSync(path.join(ROOT, file), "utf8");
      expect(
        contents,
        `${file} does not set DEMO_MODE="1". A deploy from it would publish the ` +
          "real app, putting children's names on a public URL.",
      ).toMatch(/DEMO_MODE\s*=\s*"1"/);
    }
  });

  it("the app defaults to demo mode being off", () => {
    // Only the deployed demo turns it on. If this ever inverted, running the
    // app on the church computer would silently show sample data instead of
    // the real records.
    const demo = readFileSync(path.join(ROOT, "lib/demo.ts"), "utf8");
    expect(demo).toMatch(/DEMO_MODE\s*=\s*process\.env\.DEMO_MODE\s*===\s*"1"/);
  });

  /**
   * Names read off the real sheet this app was built against. None may appear
   * anywhere in shipped source.
   *
   * An earlier version of this test scanned only lib/demo.ts, on the assumption
   * that seed data was the only place a real name could come from. It wasn't: a
   * real teacher's name reached the public demo as a form placeholder
   * (`placeholder="e.g. Ms. …"`) and as an example inside the extraction prompt.
   * Hence the whole tree.
   *
   * The list itself lives in a gitignored file rather than here. Hardcoding it
   * would mean this repo published the very names it exists to protect — which
   * is exactly what happened before the list was moved out.
   */
  const NAMES_FILE = path.join(ROOT, "tests/real-names.local.txt");

  function realNames(): string[] {
    if (!existsSync(NAMES_FILE)) return [];
    return readFileSync(NAMES_FILE, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  }

  /**
   * Everything that leaves this machine — the Docker image *and* the git repo.
   *
   * Tests are included deliberately. They never reach the demo, so an earlier
   * image-only scan called them safe, but they are published the moment the
   * repo is pushed. Both destinations are public; both get checked.
   */
  function publishedFiles(): string[] {
    const exts = new Set([
      ".ts", ".tsx", ".js", ".mjs", ".jsx", ".css", ".json", ".html", ".md",
    ]);
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (full === NAMES_FILE) continue; // the blocklist itself; gitignored
        if (entry.isDirectory()) walk(full);
        else if (exts.has(path.extname(entry.name))) found.push(full);
      }
    };
    for (const dir of ["app", "lib", "scripts", "design", "public", "tests"]) {
      const full = path.join(ROOT, dir);
      if (existsSync(full)) walk(full);
    }
    for (const file of readdirSync(ROOT)) {
      if (file.endsWith(".md")) found.push(path.join(ROOT, file));
    }
    return found;
  }

  it("finds files to scan (otherwise the name check passes vacuously)", () => {
    expect(publishedFiles().length).toBeGreaterThan(20);
  });

  it("has a real-name blocklist to check against", () => {
    // If this file goes missing the scan below silently passes forever, so the
    // absence is itself a failure rather than a skip.
    expect(
      realNames().length,
      `${path.relative(ROOT, NAMES_FILE)} is missing or empty. Without it, ` +
        "nothing stops a real name from being published. Recreate it — the file " +
        "is gitignored, so a fresh clone will not have one.",
    ).toBeGreaterThan(0);
  });

  it("no real name appears in anything that gets published", () => {
    const offenders: string[] = [];
    for (const file of publishedFiles()) {
      const contents = readFileSync(file, "utf8");
      for (const real of realNames()) {
        if (contents.includes(real)) {
          offenders.push(`${path.relative(ROOT, file)} contains "${real}"`);
        }
      }
    }
    expect(
      offenders,
      "Real names must never be published. Placeholders, prompt examples, seed " +
        "data and test fixtures all reach either the public demo or the git repo:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
