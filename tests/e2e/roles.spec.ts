import { test, expect } from "@playwright/test";
import { signIn, signInApi, openRecords, showFullGrid, VOLUNTEER, PASTOR } from "./helpers";

/**
 * Both staff accounts may correct mistaken imports and remove empty grades.
 * Grade-wide week deletion and activity history remain pastor-only.
 */

async function makeThrowawayWeek(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/grades/1/weeks", {
    data: { label: `role-test-${Date.now()}`, attendance_date: null },
  });
  return (await res.json()).week.id as number;
}

async function makeThrowawayClassWithKid(
  request: import("@playwright/test").APIRequestContext,
) {
  const classRes = await request.post("/api/grades/1/classes", {
    data: { label: `Delete Test ${Date.now()}-${Math.random()}` },
  });
  const classId = (await classRes.json()).class.id as number;
  const weeks = await request.get("/api/grades/1/weeks");
  const weekId = (await weeks.json()).weeks[0].id as number;
  const sheet = await request.post("/api/sheets", {
    data: {
      class_id: classId,
      week_ids: [weekId],
      rows: [
        {
          english_name: "Mistaken Student",
          korean_name: null,
          cells: [{ attendance: "HERE", qt_pages: 5 }],
        },
      ],
    },
  });
  expect(sheet.status()).toBe(200);
  const records = await request.get(`/api/records?gradeId=1&classId=${classId}`);
  const kidId = (await records.json()).rows[0].kid_id as number;
  return { classId, kidId, weekId };
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

  test("cannot delete a grade-wide week", async ({ request }) => {
    await signInApi(request, VOLUNTEER);
    const weekId = await makeThrowawayWeek(request);

    const res = await request.delete(`/api/weeks/${weekId}`);
    expect(res.status()).toBe(403);
  });

  test("can permanently delete a mistaken student", async ({ request }) => {
    await signInApi(request, VOLUNTEER);
    const { kidId } = await makeThrowawayClassWithKid(request);

    const res = await request.delete(`/api/kids/${kidId}`);
    expect(res.status()).toBe(200);
  });

  test("can clear wrong-class data and delete the class", async ({ request }) => {
    await signInApi(request, VOLUNTEER);
    const { classId } = await makeThrowawayClassWithKid(request);

    const clear = await request.delete(`/api/classes/${classId}/entries`);
    expect(clear.status()).toBe(200);
    expect((await clear.json()).entriesRemoved).toBe(1);

    const remove = await request.delete(`/api/classes/${classId}`);
    expect(remove.status()).toBe(200);
  });

  test("can delete an empty grade but not one with a class", async ({ request }) => {
    await signInApi(request, VOLUNTEER);
    const created = await request.post("/api/grades", {
      data: { name: `Volunteer Empty ${Date.now()}-${Math.random()}` },
    });
    const gradeId = (await created.json()).grade.id as number;

    const res = await request.delete(`/api/grades/${gradeId}`);
    expect(res.status()).toBe(200);

    const occupied = await request.post("/api/grades", {
      data: { name: `Volunteer Occupied ${Date.now()}-${Math.random()}` },
    });
    const occupiedId = (await occupied.json()).grade.id as number;
    await request.post(`/api/grades/${occupiedId}/classes`, { data: { label: "Keep this class" } });
    const refused = await request.delete(`/api/grades/${occupiedId}`);
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toMatch(/contains classes/i);
  });

  test("can delete an empty grade from the Classes screen", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    const name = `UI Empty Grade ${Date.now()}-${Math.random()}`;
    const created = await page.request.post("/api/grades", { data: { name } });
    expect(created.status()).toBe(201);
    await page.goto("/");

    const grade = page.locator("section.card").filter({
      has: page.getByRole("heading", { name, exact: true }),
    });
    page.once("dialog", (dialog) => void dialog.accept());
    await grade.getByRole("button", { name: "Delete grade" }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  });

  test("is shown student controls but not the grade-wide week delete control", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    await openRecords(page, "A 5-1 (Demo)");
    await showFullGrid(page);
    await expect(page.locator("button.week-del")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete student" }).first()).toBeVisible();
  });

  test("can remove a mistaken student from the Records screen", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    const { classId } = await makeThrowawayClassWithKid(page.request);
    await page.goto(`/records?gradeId=1&classId=${classId}`);
    await showFullGrid(page);

    const row = page.locator("tbody tr").filter({
      has: page.getByLabel("English name for Mistaken Student"),
    });
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Delete student" }).click();
    await expect(page.getByLabel("English name for Mistaken Student")).toHaveCount(0);
  });

  test("can clear a wrong upload while keeping the class roster", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    const { classId, weekId } = await makeThrowawayClassWithKid(page.request);
    await page.goto(`/records?gradeId=1&classId=${classId}`);
    await showFullGrid(page);

    const before = page.locator("tbody tr").filter({
      has: page.getByLabel("English name for Mistaken Student"),
    });
    const pages = before.locator("input.qt-input").first();
    await pages.fill("9");
    await pages.blur();
    await expect(before.locator("td.col-total")).toHaveText("9");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("#clear-week").selectOption(String(weekId));
    await page.getByRole("button", { name: "Clear selected date" }).click();
    await page.waitForLoadState("load");
    await showFullGrid(page);
    await expect(page.getByLabel("English name for Mistaken Student")).toBeVisible();
    const row = page.locator("tbody tr").filter({
      has: page.getByLabel("English name for Mistaken Student"),
    });
    await expect(row.locator("td.col-total")).toHaveText("0");
  });

  test("can delete a mistaken class from the Classes screen", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    const label = `UI Delete ${Date.now()}-${Math.random()}`;
    await page.request.post("/api/grades/1/classes", { data: { label } });
    await page.goto("/");

    const row = page.locator("tbody tr").filter({ hasText: label });
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Delete class" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: label })).toHaveCount(0);
  });

  test("cannot open the pastor-only activity history", async ({ page }) => {
    await signIn(page, VOLUNTEER);
    await expect(page.getByRole("link", { name: "Activity" })).toHaveCount(0);
    await page.goto("/activity");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("what the pastor may do", () => {
  test("can delete an empty mistaken grade but cannot delete one with a class", async ({
    request,
  }) => {
    await signInApi(request, PASTOR);
    const empty = await request.post("/api/grades", {
      data: { name: `A 4-1 Mistake ${Date.now()}` },
    });
    const emptyId = (await empty.json()).grade.id as number;
    expect((await request.delete(`/api/grades/${emptyId}`)).status()).toBe(200);

    const occupied = await request.post("/api/grades", {
      data: { name: `Occupied ${Date.now()}` },
    });
    const occupiedId = (await occupied.json()).grade.id as number;
    await request.post(`/api/grades/${occupiedId}/classes`, { data: { label: "A 4-1" } });
    const refused = await request.delete(`/api/grades/${occupiedId}`);
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toMatch(/contains classes/i);
  });
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
