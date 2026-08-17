import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Guards the Docker build context.
 *
 * `app/globals.css` imports `../design/tokens.css`. `design/` was once listed
 * in .dockerignore as "documentation", which removed that file from the build
 * context and made `npm run build` fail inside the image with
 * "Can't resolve '../design/tokens.css'" — while every local build stayed
 * green, because locally the file is right there.
 *
 * These tests fail fast if anything the app imports is excluded again.
 */

const ROOT = path.resolve(__dirname, "../..");

/** Directories excluded outright (ignoring comments, blanks, and file globs). */
function dockerIgnoredRoots(): string[] {
  return readFileSync(path.join(ROOT, ".dockerignore"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.includes("*") && !l.startsWith("!"))
    .map((l) => l.replace(/\/$/, ""));
}

/** Relative paths pulled in by CSS `@import` from anywhere under app/. */
function cssImports(): { from: string; target: string }[] {
  const found: { from: string; target: string }[] = [];
  const cssFiles = ["app/globals.css"];

  for (const file of cssFiles) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    const source = readFileSync(full, "utf8");
    for (const m of source.matchAll(/@import\s+["']([^"']+)["']/g)) {
      const target = m[1];
      // Skip url(...) and remote imports; only local files ship in the image.
      if (target.startsWith("http")) continue;
      found.push({ from: file, target });
    }
  }
  return found;
}

describe("docker build context", () => {
  it("finds the CSS imports it is meant to be checking", () => {
    // A guard on the guard: if globals.css stops importing anything relative,
    // this suite would silently pass while checking nothing.
    expect(cssImports().length).toBeGreaterThan(0);
  });

  it("every locally imported stylesheet exists", () => {
    for (const { from, target } of cssImports()) {
      const resolved = path.resolve(ROOT, path.dirname(from), target);
      expect(existsSync(resolved), `${from} imports ${target}, which is missing`).toBe(true);
    }
  });

  it("no locally imported stylesheet sits in a dockerignored directory", () => {
    const ignored = dockerIgnoredRoots();

    for (const { from, target } of cssImports()) {
      const resolved = path.resolve(ROOT, path.dirname(from), target);
      const relative = path.relative(ROOT, resolved);
      const topLevel = relative.split(path.sep)[0];

      expect(
        ignored,
        `${from} imports ${target}, but "${topLevel}" is excluded in .dockerignore — ` +
          "the image build will fail with \"Can't resolve\" while local builds pass",
      ).not.toContain(topLevel);
    }
  });

  it("keeps the directories the image build needs", () => {
    // `next build` compiles from these, and the run stage copies
    // scripts/admin.mjs out for creating the first accounts. Excluding any of
    // them breaks the build or leaves the deployed app with no way to sign in.
    const ignored = dockerIgnoredRoots();
    for (const needed of ["lib", "scripts", "public"]) {
      expect(ignored, `"${needed}" must stay in the build context`).not.toContain(needed);
    }
  });

  it("ships the dependency-free admin script into the image", () => {
    const dockerfile = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    expect(
      dockerfile,
      "the run stage must copy scripts/admin.mjs, or there is no way to create the first accounts",
    ).toContain("scripts/admin.mjs");
    expect(existsSync(path.join(ROOT, "scripts/admin.mjs"))).toBe(true);
  });
});
