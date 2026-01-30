import { expect, test } from "@playwright/test";
import { loginAdminUser } from "e2e/utils/test-helpers";

const ADMIN_EMAIL = process.env.ADMIN_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_TEST_EMAIL and ADMIN_TEST_PASSWORD must be set in .env");
}

test.describe.serial("Admin Instructors CRUD", () => {
  let instructorId: string;

  test.afterAll(async ({ browser }) => {
    if (!instructorId) return;

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
      await page.request.post(`/api/admin/instructors/${instructorId}/delete`);
    } finally {
      await context.close();
    }
  });

  test("should display instructors list page", async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/admin/instructors");
    await expect(
      page.getByRole("heading", { name: "강사 관리" }),
    ).toBeVisible();
  });

  test("should create a new instructor and verify in list", async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/admin/instructors");

    // Click register button
    await page.getByRole("link", { name: "강사 등록" }).click();
    await expect(page).toHaveURL("/admin/instructors/new");

    // Fill required field
    await page.locator("#name").fill("E2E 테스트 강사");

    // Submit
    await page.getByRole("button", { name: "강사 등록" }).click();

    // Should redirect back to instructors list
    await page.waitForURL("/admin/instructors", { timeout: 15000 });

    // Verify instructor appears in list
    await expect(page.getByText("E2E 테스트 강사")).toBeVisible();

    // Extract instructor ID from the row's link for cleanup
    const row = page.locator("tr", { hasText: "E2E 테스트 강사" }).first();
    const link = row.getByRole("link").first();
    const href = await link.getAttribute("href");
    const match = href?.match(/\/admin\/instructors\/(\d+)/);
    if (match) {
      instructorId = match[1];
    }
  });
});
