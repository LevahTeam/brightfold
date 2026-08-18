import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 3100;
const DB = path.join(process.cwd(), "data", "e2e.db");

/**
 * Run end-to-end tests against an isolated production build, port, and
 * database so development records remain untouched.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    // Build into .next-e2e to protect the dev server's .next directory and to
    // keep the suite reproducible from a clean checkout.
    // The dist directory is cleared too: a build left over from a different
    // next.config (say, standalone output toggled) can be reused and serve
    // 404s for its own chunks, which looks like an app bug and is not one.
    command:
      `rm -rf .next-e2e && rm -f "${DB}" "${DB}-wal" "${DB}-shm" && ` +
      `npx tsx scripts/seed.ts --demo && ` +
      `npx next build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      QT_DB_PATH: DB,
      QTP_SESSION_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      QTP_SEED_VOLUNTEER_PW: "e2e-volunteer-pw-2026",
      QTP_SEED_PASTOR_PW: "e2e-pastor-pw-2026",
      VISION_PROVIDER: "none",
      NODE_ENV: "production",
    },
  },
});
