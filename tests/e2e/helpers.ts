import { expect, type Page, type APIRequestContext } from "@playwright/test";

export const VOLUNTEER = { username: "volunteer", password: "e2e-volunteer-pw-2026" };
/** The pastor's account is the admin: only it may delete. */
export const PASTOR = { username: "pastor", password: "e2e-pastor-pw-2026" };

export async function signIn(page: Page, who = VOLUNTEER) {
  await page.goto("/login");

  // Already signed in as someone else? /login forwards straight into the app,
  // so there is no form to fill. Sign out first, then continue.
  if (!page.url().includes("/login")) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/);
  }

  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Signs an API-only request context in, for endpoint-level tests. */
export async function signInApi(request: APIRequestContext, who = VOLUNTEER) {
  const res = await request.post("/api/auth/login", { data: who });
  if (!res.ok()) throw new Error(`API sign-in failed: ${res.status()}`);
}

/**
 * Collects console errors and page exceptions for the life of the page so a
 * test can assert the journey ran clean, not just that it rendered.
 */
/**
 * Next logs a console error when a speculative RSC prefetch is aborted by the
 * navigation that superseded it, then falls back to a normal browser
 * navigation. It is noise from a cancelled request, not a failure the user
 * ever sees, so it is filtered rather than asserted on.
 */
const BENIGN = [/Failed to fetch RSC payload.*Falling back to browser navigation/i];

export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (BENIGN.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/**
 * Records opens on the one-week view on narrow screens, so any assertion
 * against the full grid has to ask for it first. On desktop the grid is
 * already showing and this is a no-op click.
 */
export async function showFullGrid(page: Page) {
  await page.getByRole("button", { name: "All weeks" }).click();
  await expect(page.locator("table.grid")).toBeVisible();
}

/**
 * Creates a fresh class and returns its label.
 *
 * Tests that log a sheet must not share a class: the app deliberately unticks
 * any date the class already has data for, so a second test hitting the same
 * class-and-date finds nothing to save. That is correct behaviour, not a bug —
 * so each test gets its own class instead of fighting it.
 */
export async function freshClass(page: Page, gradeId = 1): Promise<string> {
  const label = `E2E ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const res = await page.request.post(`/api/grades/${gradeId}/classes`, {
    data: { label, teacher_name: "E2E Teacher" },
  });
  if (!res.ok()) throw new Error(`Could not create a class: ${res.status()}`);
  return label;
}

/** Opens Log a Sheet on a brand-new class with a blank one-date grid. */
export async function startBlankSheet(page: Page): Promise<string> {
  const label = await freshClass(page);
  await page.goto("/log");
  // Be explicit about the grade: other tests create grades too, and the page
  // defaults to whichever sorts first.
  await page.locator("#grade").selectOption("1");
  await page.locator("#class").selectOption({ label });
  await page.getByRole("button", { name: /Fill it in by hand/ }).click();
  await expect(page.getByRole("heading", { name: /Check every value/ })).toBeVisible();
  return label;
}

/** Re-opens Log a Sheet on an existing class with a blank one-date grid. */
export async function reopenSheet(page: Page, label: string) {
  await page.goto("/log");
  // Be explicit about the grade: other tests create grades too, and the page
  // defaults to whichever sorts first.
  await page.locator("#grade").selectOption("1");
  await page.locator("#class").selectOption({ label });
  await page.getByRole("button", { name: /Fill it in by hand/ }).click();
  await expect(page.getByRole("heading", { name: /Check every value/ })).toBeVisible();
}

export const DEMO_CLASS = "A 5-1 (Demo)";

/**
 * Opens Records filtered to one class.
 *
 * Both projects share a database and every logging test creates its own class,
 * so the combined "all classes" view accumulates whatever ran before it.
 * Filtering keeps each assertion about the rows it actually owns.
 */
export async function openRecords(page: Page, classLabel: string) {
  // A save triggers router.refresh(), whose soft navigation can still be in
  // flight; navigating straight into it aborts the goto.
  await page.waitForLoadState("load").catch(() => {});
  await page.goto("/records?gradeId=1", { waitUntil: "load" });
  await page.locator("#classId").selectOption({ label: classLabel });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
}

/**
 * Waits for the already-logged flag to land, then ticks the date anyway.
 *
 * The flag arrives from a fetch after the grid renders, so ticking immediately
 * would race it — and the effect would untick the box again a moment later.
 */
export async function optInToOverwrite(page: Page) {
  const chip = page.locator(".week-chip").first();
  await expect(chip).toHaveAttribute("data-logged", "true");
  await chip.locator("input[type=checkbox]").check();
  await expect(page.getByRole("button", { name: /will be overwritten/ })).toBeVisible();
}

/**
 * The Records grid renders each kid's name as an editable field, so a row
 * cannot be found by text content — the name lives in an input's value.
 */
export function rowFor(page: Page, englishName: string) {
  return page
    .locator("tr")
    .filter({ has: page.getByLabel(`English name for ${englishName}`) });
}
