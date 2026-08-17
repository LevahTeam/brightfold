import { test, expect } from "@playwright/test";
import { signIn, watchConsole, VOLUNTEER } from "./helpers";

test.describe("access control", () => {
  test("an anonymous visitor is bounced to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /QT/ })).toBeVisible();
  });

  test("every data page redirects when signed out", async ({ page }) => {
    for (const path of ["/records", "/log", "/cards"]) {
      await page.goto(path);
      await expect(page, `${path} should redirect`).toHaveURL(/\/login/);
    }
  });

  test("data APIs return 401 rather than data when signed out", async ({ request }) => {
    for (const path of ["/api/grades", "/api/records?gradeId=1", "/api/extract"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} should be 401`).toBe(401);
    }
  });

  test("a wrong password is rejected with a non-committal message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("volunteer");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.locator(".alert--error");
    await expect(alert).toBeVisible();
    // Must not reveal whether the username exists.
    await expect(alert).toContainText(/do not match/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("an unknown username gets the identical message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("nobody-here");
    await page.getByLabel("Password").fill("whatever");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator(".alert--error")).toContainText(/do not match/i);
  });

  test("signing in lands on the dashboard and the session survives a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("pressing Enter in the password field submits the form", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(VOLUNTEER.username);
    await page.getByLabel("Password").fill(VOLUNTEER.password);
    await page.getByLabel("Password").press("Enter");
    await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
  });

  test("?next= returns the user to where they were headed", async ({ page }) => {
    await page.goto("/records");
    await expect(page).toHaveURL(/\/login\?next=%2Frecords/);
    await page.getByLabel("Username").fill(VOLUNTEER.username);
    await page.getByLabel("Password").fill(VOLUNTEER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/records/);
  });

  test("?next= cannot bounce the user to another site", async ({ page }) => {
    await page.goto("/login?next=https://example.com/evil");
    await page.getByLabel("Username").fill(VOLUNTEER.username);
    await page.getByLabel("Password").fill(VOLUNTEER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1/);
  });

  test("signing out ends the session", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/records");
    await expect(page).toHaveURL(/\/login/);
  });

  test("pages are marked noindex", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("login throttling", () => {
  test("repeated wrong passwords are eventually refused", async ({ request }) => {
    // A distinct client id so this cannot lock out the other tests.
    const headers = { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 20}` };

    let sawThrottle = false;
    for (let i = 0; i < 14; i++) {
      const res = await request.post("/api/auth/login", {
        headers,
        data: { username: "volunteer", password: "wrong-on-purpose" },
      });
      if (res.status() === 429) {
        sawThrottle = true;
        expect(res.headers()["retry-after"]).toBeTruthy();
        expect((await res.json()).error).toMatch(/too many/i);
        break;
      }
      expect(res.status(), `attempt ${i + 1}`).toBe(401);
    }

    expect(sawThrottle, "a run of wrong passwords should be throttled").toBe(true);
  });

  test("throttling one client does not lock out another", async ({ request }) => {
    const attacker = { "x-forwarded-for": "198.51.100.77" };
    for (let i = 0; i < 14; i++) {
      await request.post("/api/auth/login", {
        headers: attacker,
        data: { username: "volunteer", password: "wrong-on-purpose" },
      });
    }

    const ok = await request.post("/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.99" },
      data: VOLUNTEER,
    });
    expect(ok.status()).toBe(200);
  });
});
