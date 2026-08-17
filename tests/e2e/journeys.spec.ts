import { test, expect } from "@playwright/test";
import {
  signIn,
  signInApi,
  showFullGrid,
  startBlankSheet,
  reopenSheet,
  openRecords,
  rowFor,
  optInToOverwrite,
  watchConsole,
  DEMO_CLASS,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe("logging a sheet by hand", () => {
  test("adds a new kid and their pages, then shows them in Records", async ({ page }) => {
    const errors = watchConsole(page);
    const name = `Test Kid ${Date.now()}`;

    const cls = await startBlankSheet(page);

    // Name the kid, mark them here, and give them 9 pages.
    await page.getByLabel("English name, row 1").fill(name);
    await page.getByLabel("Korean name, row 1").fill("테스트");
    await page.locator("input.qt-input").first().fill("9");

    await page.getByRole("button", { name: /^Save 1 date$/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);
    await expect(page.locator(".alert--success")).toContainText(/1 added/);

    // The kid and their pages should now be in Records.
    await openRecords(page, cls);
    await showFullGrid(page);
    await expect(page.getByLabel(`English name for ${name}`)).toBeVisible();
    const row = rowFor(page, name);
    await expect(row.locator("td.col-total")).toHaveText("9");

    expect(errors).toEqual([]);
  });

  test("entering pages marks the kid present without a separate tap", async ({ page }) => {
    await startBlankSheet(page);

    const attToggle = page.locator("button.att-toggle").first();
    await expect(attToggle).toHaveAttribute("data-here", "false");

    await page.locator("input.qt-input").first().fill("4");
    await expect(attToggle).toHaveAttribute("data-here", "true");
  });

  test("refuses to save a row with no English name", async ({ page }) => {
    await startBlankSheet(page);
    await page.locator("input.qt-input").first().fill("5");

    await page.getByRole("button", { name: /^Save 1 date$/ }).click();
    await expect(page.locator(".alert--error")).toContainText(/English name/i);
  });

  test("refuses to save two kids with the same name", async ({ page }) => {
    await startBlankSheet(page);

    await page.getByLabel("English name, row 1").fill("Duplicate Name");
    await page.getByRole("button", { name: "+ Add a kid" }).click();
    await page.getByLabel("English name, row 2").fill("duplicate name");

    await page.getByRole("button", { name: /^Save 1 date$/ }).click();
    await expect(page.locator(".alert--error")).toContainText(/appears twice/i);
  });

  test("refuses to save with no dates ticked", async ({ page }) => {
    await startBlankSheet(page);
    await page.getByLabel("English name, row 1").fill("Someone");

    await page.locator(".week-chip input[type=checkbox]").first().uncheck();
    await page.getByRole("button", { name: /^Save 0 dates$/ }).click();
    await expect(page.locator(".alert--error")).toContainText(/at least one date/i);
  });

  test("a second import of the same kid matches instead of duplicating", async ({ page }) => {
    const name = `Repeat Kid ${Date.now()}`;

    const label = await startBlankSheet(page);
    await page.getByLabel("English name, row 1").fill(name);
    await page.locator("input.qt-input").first().fill("5");
    await page.getByRole("button", { name: /^Save 1 date$/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    // Same class, same date again. The date now arrives unticked, so opt in
    // deliberately — that is the path a returning scan takes.
    await reopenSheet(page, label);
    await optInToOverwrite(page);
    await page.getByLabel("English name, row 1").fill(name);
    await page.locator("input.qt-input").first().fill("6");

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/1 existing kids matched/);

    await openRecords(page, label);
    await showFullGrid(page);
    await expect(rowFor(page, name)).toHaveCount(1);
  });
});

test.describe("records", () => {
  test("shows the seeded grid with correct running totals", async ({ page }) => {
    const errors = watchConsole(page);
    await openRecords(page, DEMO_CLASS);
    await showFullGrid(page);
    // Kid Stable exists purely for this assertion: no other test writes to it,
    // so 1 + 2 + 3 holds regardless of which project ran first.
    const row = rowFor(page, "Sample Kid Stable");
    await expect(row.locator("td.col-total")).toHaveText("6");
    expect(errors).toEqual([]);
  });

  test("an inline page correction saves and survives a reload", async ({ page }) => {
    await openRecords(page, DEMO_CLASS);
    await showFullGrid(page);
    const row = rowFor(page, "Sample Kid Three");

    // Seeded as 4 + 4 + 6; replacing the first week with 10 shifts the total
    // by exactly +6 whichever project ran first.
    await row.locator("input.qt-input").first().fill("10");
    await row.locator("input.qt-input").first().blur();
    await expect(row.locator("td.col-total")).toHaveText("20");

    await page.reload();
    await showFullGrid(page);
    const after = rowFor(page, "Sample Kid Three");
    await expect(after.locator("td.col-total")).toHaveText("20");
    await expect(after.locator("input.qt-input").first()).toHaveValue("10");
  });

  test("toggling attendance saves", async ({ page }) => {
    await openRecords(page, DEMO_CLASS);
    await showFullGrid(page);
    const toggle = rowFor(page, "Sample Kid Two").locator("button.att-toggle").first();

    const before = await toggle.getAttribute("data-here");
    await toggle.click();
    await expect(toggle).not.toHaveAttribute("data-here", before ?? "");

    await page.reload();
    await showFullGrid(page);
    const after = rowFor(page, "Sample Kid Two").locator("button.att-toggle").first();
    await expect(after).not.toHaveAttribute("data-here", before ?? "");
  });

  test("the combined view groups rows under a class header", async ({ page }) => {
    await page.goto("/records?gradeId=1");
    await showFullGrid(page);
    // Other tests add their own classes, so assert this one is present rather
    // than that it is the only one.
    await expect(
      page.locator("tr.class-header-row").filter({ hasText: DEMO_CLASS }),
    ).toHaveCount(1);
  });

  test("the one-week view shows a single week and edits save", async ({ page }) => {
    const errors = watchConsole(page);
    await openRecords(page, DEMO_CLASS);
    await page.getByRole("button", { name: "One week" }).click();

    const rows = page.locator(".week-row");
    expect(await rows.count()).toBeGreaterThan(0);
    // No horizontal grid at all in this view — that is the entire point.
    await expect(page.locator("table.grid")).toHaveCount(0);

    const row = rows.filter({ hasText: "Sample Kid One" });
    await row.locator("input.qt-input").fill("3");
    await row.locator("input.qt-input").blur();

    await page.reload();
    await page.getByRole("button", { name: "One week" }).click();
    await expect(
      page.locator(".week-row").filter({ hasText: "Sample Kid One" }).locator("input.qt-input"),
    ).toHaveValue("3");
    expect(errors).toEqual([]);
  });

  test("the week stepper moves between weeks", async ({ page }) => {
    await openRecords(page, DEMO_CLASS);
    await page.getByRole("button", { name: "One week" }).click();

    const label = page.locator(".week-nav strong");
    const last = await label.textContent();
    await page.getByRole("button", { name: /Earlier/ }).click();
    await expect(label).not.toHaveText(last ?? "");
  });
});

test.describe("print cards", () => {
  test("renders one card per kid with a total stamp", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/cards?gradeId=1");

    await expect(page.getByRole("heading", { name: "Print cards" })).toBeVisible();
    const cards = page.locator("article.point-card");
    expect(await cards.count()).toBeGreaterThan(0);

    const first = cards.first();
    await expect(first.locator(".stamp")).toBeVisible();
    await expect(first.locator("footer")).toContainText(/Total \d+ pages/);
    expect(errors).toEqual([]);
  });

  test("app chrome is hidden in print layout", async ({ page }) => {
    await page.goto("/cards?gradeId=1");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("header.app-header")).toBeHidden();
    await expect(page.locator("article.point-card").first()).toBeVisible();
  });
});

test.describe("photo scanning when no provider is configured", () => {
  test("the page offers manual entry instead of a broken upload", async ({ page }) => {
    await page.goto("/log");
    await expect(page.getByText(/Photo scanning is turned off/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Fill it in by hand/ })).toBeVisible();
  });

  test("the extract endpoint says so rather than failing opaquely", async ({ request }) => {
    await signInApi(request);
    const res = await request.post("/api/extract", {
      multipart: {
        photo: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50]) },
      },
    });
    expect(res.status()).toBe(503);
    expect((await res.json()).code).toBe("vision_not_configured");
  });
});
