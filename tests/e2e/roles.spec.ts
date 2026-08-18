import { test, expect } from "@playwright/test";
import { signIn, signInApi, openRecords, showFullGrid, VOLUNTEER, PASTOR } from "./helpers";

/**
 * The pastor's account is the admin. The volunteer can log sheets and correct
 * entries, but must not be able to destroy a week or remove a child.
 */

async function makeThrowawayWeek(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/grades/1/weeks", {
    data: { label: `role-test-${Date.now()}`, attendance_date: null },
  });
  return (await res.json()).week.id as number;
}

test.describe("what the volunteer may do", () => {
  test("can still log entries and rename kids", async ({ request }) => {
    await signInApi(request, VOLUNTEER);

    const records = await request.get("/api/records?gradeId=1");
    const kidId = (await records.json()).rows[0].kid_id as number;
    const weeks = await request.get("/api/grades/1/weeks");
    const weekId = (await weeks.json()).weeks[0].id as number;

    const entry = await request.post("/api/entries", {
      data: { kid_id: kidId, week_id: weekId, attendance: "HERE", qt_pages: 3 },
    });
    expect(entry.status(), "logging an entry").toBe(200);

    const rename = await request.patch(`/api/kids/${kidId}`, {
      data: { korean_name: "테스트" },
    });
    expect(rename.status(), "correcting a name").toBe(200);
  });

  test("cannot delete a week", async ({ request }) => {
    await signInApi(request, PASTOR);
    const weekId = await makeThrowawayWeek(request);

    await signInApi(request, VOLUNTEER);
    const res = await request.delete(`/api/weeks/${weekId}`);
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/pastor/i);

    // And the week must still be there afterwards.
    const weeks = await request.get("/api/grades/1/weeks");
    const labels = (await weeks.json()).weeks.map((w: { id: number }) => w.id);
    expect(labels).toContain(weekId);
  });

  test("cannot remove a kid", async ({ request }) => {
    await signInApi(request, VOLUNTEER);
    const records = await request.get("/api/records?gradeId=1");
    const kidId = (await records.json()).rows[0].kid_id as number;

    const res = await request.delete(`/api/kids/${kidId}`);
    expect(res.status()).toBe(403);
  });

  test("is not shown the delete control in Records", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    await openRecords(page, "A 5-1 (Demo)");
    await showFullGrid(page);
    await expect(page.locator("button.week-del")).toHaveCount(0);
  });

  test("cannot open the pastor-only activity history", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    await expect(page.getByRole("link", { name: "Activity" })).toHaveCount(0);
    await page.goto("/activity");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("what the pastor may do", () => {
  test("can delete a week", async ({ request }) => {
    await signInApi(request, PASTOR);
    const weekId = await makeThrowawayWeek(request);

    const res = await request.delete(`/api/weeks/${weekId}`);
    expect(res.status()).toBe(200);
  });

  test("is shown the delete control, and marked as the pastor", async ({ page }) => {
    await signIn(page, PASTOR);
    await openRecords(page, "A 5-1 (Demo)");
    await showFullGrid(page);
    await expect(page.locator("button.week-del").first()).toBeAttached();
    await expect(page.locator(".role-pill")).toHaveText(/pastor/i);
  });

  test("can review the protected activity history", async ({ page }) => {
    await signIn(page, PASTOR);
    await page.getByRole("link", { name: "Activity" }).click();
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(page.getByText(/Recent corrections and removals/i)).toBeVisible();
  });
});
