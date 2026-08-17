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
  PASTOR,
} from "./helpers";

/**
 * Covers the two ways this app could quietly destroy or misreport real data:
 * a re-scan overwriting corrected history, and a failed save leaving the
 * screen showing a number the database does not hold.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe("re-scanning an accumulating term sheet", () => {
  test("a week this class already has data for starts unticked and flagged", async ({ page }) => {
    const errors = watchConsole(page);
    const kid = `Rescan Kid ${Date.now()}`;

    // First pass: log today's date by hand.
    const label = await startBlankSheet(page);
    await page.getByLabel("English name, row 1").fill(kid);
    await page.locator("input.qt-input").first().fill("7");
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    // Second pass: same class, same date. It must arrive unticked, flagged,
    // and explained — this is what stops a re-scan wiping corrected history.
    await reopenSheet(page, label);

    const chip = page.locator(".week-chip").first();
    await expect(chip).toHaveAttribute("data-logged", "true");
    await expect(chip.locator("input[type=checkbox]")).not.toBeChecked();
    await expect(chip.locator(".chip-flag")).toBeVisible();
    await expect(page.locator(".alert--warning")).toContainText(/already has data/i);
    await expect(page.getByRole("button", { name: /^Save 0 dates$/ })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("ticking an already-logged date warns before it overwrites", async ({ page }) => {
    const kid = `Overwrite Kid ${Date.now()}`;

    const label = await startBlankSheet(page);
    await page.getByLabel("English name, row 1").fill(kid);
    await page.locator("input.qt-input").first().fill("3");
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    await reopenSheet(page, label);
    await expect(page.locator(".week-chip").first()).toHaveAttribute("data-logged", "true");

    // Deliberately opt in to the overwrite.
    await optInToOverwrite(page);

    // Declining the confirmation must leave the data alone.
    page.once("dialog", (d) => void d.dismiss());
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toHaveCount(0);
  });

  test("saving the same date twice does not silently double-count", async ({ page }) => {
    const kid = `Idempotent Kid ${Date.now()}`;

    const label = await startBlankSheet(page);
    await page.getByLabel("English name, row 1").fill(kid);
    await page.locator("input.qt-input").first().fill("4");
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    await reopenSheet(page, label);
    await optInToOverwrite(page);
    await page.getByLabel("English name, row 1").fill(kid);
    await page.locator("input.qt-input").first().fill("9");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    await openRecords(page, label);
    await showFullGrid(page);
    const row = rowFor(page, kid);
    await expect(row).toHaveCount(1);
    // The second save replaces the first — 9, not 13.
    await expect(row.locator("td.col-total")).toHaveText("9");
  });
});

test.describe("a save that fails", () => {
  test("puts the cell back rather than leaving a wrong total on screen", async ({ page }) => {
    await openRecords(page, DEMO_CLASS);
    await showFullGrid(page);

    const row = rowFor(page, "Sample Kid Stable");
    const totalBefore = await row.locator("td.col-total").textContent();

    // Make the next write fail the way a dropped wifi connection would.
    await page.route("**/api/entries", (route) => route.abort());

    await row.locator("input.qt-input").first().fill("99");
    await row.locator("input.qt-input").first().blur();

    await expect(page.locator(".alert--error")).toContainText(/not saved/i);
    // The displayed total must match the database, not the rejected edit.
    await expect(row.locator("td.col-total")).toHaveText(totalBefore ?? "");

    await page.unroute("**/api/entries");
    await page.reload();
    await showFullGrid(page);
    await expect(
      rowFor(page, "Sample Kid Stable").locator("td.col-total"),
    ).toHaveText(totalBefore ?? "");
  });

  test("an expired session sends the user to sign in instead of failing silently", async ({
    page,
  }) => {
    await openRecords(page, DEMO_CLASS);
    await showFullGrid(page);

    await page.route("**/api/entries", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not signed in" }),
      }),
    );

    const row = rowFor(page, "Sample Kid Stable");
    await row.locator("input.qt-input").first().fill("42");
    await row.locator("input.qt-input").first().blur();

    // The user must be taken off the grid rather than left tapping cells that
    // quietly do nothing. (The real cookie is still valid here, so /login
    // legitimately forwards on to the dashboard — the point is that we left.)
    await expect(page).not.toHaveURL(/\/records/);
  });
});

test.describe("grade integrity", () => {
  test("the API refuses an entry whose week belongs to another grade", async ({ request }) => {
    await signInApi(request);

    // Build a second grade with its own week, then aim it at a kid in grade 1.
    const gradeRes = await request.post("/api/grades", {
      data: { name: `Other Grade ${Date.now()}` },
    });
    const grade = (await gradeRes.json()) as { grade: { id: number } };

    const weekRes = await request.post(`/api/grades/${grade.grade.id}/weeks`, {
      data: { label: "9/99", attendance_date: null },
    });
    const week = (await weekRes.json()) as { week: { id: number } };

    const recordsRes = await request.get("/api/records?gradeId=1");
    const records = (await recordsRes.json()) as { rows: { kid_id: number }[] };
    const kidId = records.rows[0]?.kid_id;
    expect(kidId).toBeTruthy();

    const res = await request.post("/api/entries", {
      data: { kid_id: kidId, week_id: week.week.id, attendance: "HERE", qt_pages: 50 },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/different grade/i);
  });
});

test.describe("correcting a bad scan after the fact", () => {
  test("a misspelled name can be fixed in Records, and the fix makes the next import match", async ({
    page,
  }) => {
    const wrong = `Jsohua Ha ${Date.now()}`;
    const right = wrong.replace("Jsohua", "Joshua");

    // A scan reads the name wrong and it gets saved.
    const label = await startBlankSheet(page);
    await page.getByLabel("English name, row 1").fill(wrong);
    await page.locator("input.qt-input").first().fill("5");
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    // Fix it in place.
    await openRecords(page, label);
    await showFullGrid(page);
    const nameField = page.getByLabel(`English name for ${wrong}`);
    await nameField.fill(right);
    await nameField.blur();

    await expect(page.getByLabel(`English name for ${right}`)).toBeVisible();

    // The corrected spelling must now match on import rather than making a
    // second kid — that is the whole point of fixing it.
    await reopenSheet(page, label);
    await optInToOverwrite(page);
    await page.getByLabel("English name, row 1").fill(right);
    await page.locator("input.qt-input").first().fill("8");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/1 existing kids matched/);

    await openRecords(page, label);
    await showFullGrid(page);
    await expect(rowFor(page, right)).toHaveCount(1);
  });

  test("a Korean name can be added to a kid that was scanned without one", async ({ page }) => {
    const name = `Korean Later ${Date.now()}`;

    const label = await startBlankSheet(page);
    await page.getByLabel("English name, row 1").fill(name);
    await page.locator("input.qt-input").first().fill("2");
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    await openRecords(page, label);
    await showFullGrid(page);
    const kr = page.getByLabel(`Korean name for ${name}`);
    await expect(kr).toHaveValue("");
    await kr.fill("김하늘2");
    await kr.blur();

    await page.reload();
    await showFullGrid(page);
    await expect(page.getByLabel(`Korean name for ${name}`)).toHaveValue("김하늘2");
  });

  test("a bad week column can be deleted, taking its entries with it", async ({ page }) => {
    const name = `Week Delete ${Date.now()}`;
    // Deleting a week is admin-only, so this journey belongs to the pastor.
    await signIn(page, PASTOR);

    // Give this grade a week nothing else uses.
    const label = await startBlankSheet(page);
    const weekLabel = `zz-bad-${Date.now()}`;
    await page.locator(".week-chip input.name-input").first().fill(weekLabel);
    await page.getByLabel("English name, row 1").fill(name);
    await page.locator("input.qt-input").first().fill("6");
    await page.getByRole("button", { name: /^Save 1 date/ }).click();
    await expect(page.locator(".alert--success")).toContainText(/Saved/);

    await openRecords(page, label);
    await showFullGrid(page);
    await expect(page.locator("th.week-group").filter({ hasText: weekLabel })).toHaveCount(1);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: `Delete the ${weekLabel} column` }).click();

    await expect(page.locator("th.week-group").filter({ hasText: weekLabel })).toHaveCount(0);

    await page.reload();
    await showFullGrid(page);
    await expect(page.locator("th.week-group").filter({ hasText: weekLabel })).toHaveCount(0);
  });
});
