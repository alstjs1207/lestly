import { expect, test } from "@playwright/test";
import { loginAdminUser } from "e2e/utils/test-helpers";

const ADMIN_EMAIL = process.env.ADMIN_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_TEST_EMAIL and ADMIN_TEST_PASSWORD must be set in .env");
}

test.describe.serial("Admin Programs CRUD", () => {
  let programUrl: string;

  test.afterAll(async ({ browser }) => {
    if (!programUrl) return;

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
      const programId = programUrl.split("/admin/programs/")[1];
      await page.request.post(`/api/admin/programs/${programId}/delete`);
    } finally {
      await context.close();
    }
  });

  test("should display programs list page", async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/admin/programs");
    await expect(
      page.getByRole("heading", { name: "클래스 관리" }),
    ).toBeVisible();
  });

  test("should create a new program", async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/admin/programs");

    // Click register button
    await page.getByRole("link", { name: "클래스 등록" }).click();
    await expect(page).toHaveURL("/admin/programs/new");

    // Fill required fields
    await page.locator("#title").fill("E2E 테스트 클래스");
    await page.locator("#slug").fill("e2e-test-class");

    // Submit
    await page.getByRole("button", { name: "클래스 등록" }).click();

    // Should redirect to program detail page
    await page.waitForURL(/\/admin\/programs\/\d+$/, { timeout: 15000 });
    programUrl = page.url();
  });

});
