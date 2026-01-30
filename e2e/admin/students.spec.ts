import { expect, test } from "@playwright/test";
import { deleteUser, loginAdminUser } from "e2e/utils/test-helpers";

const ADMIN_EMAIL = process.env.ADMIN_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
const STUDENT_EMAIL = process.env.ADMIN_STUDENT_TEST_EMAIL;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !STUDENT_EMAIL) {
  throw new Error(
    "ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD, and ADMIN_STUDENT_TEST_EMAIL must be set in .env",
  );
}

test.describe.serial("Admin Students CRUD", () => {
  let studentUrl: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    // API delete for organization_members soft delete (if student was created)
    if (studentUrl) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
        const studentId = studentUrl.split("/admin/students/")[1];
        await page.request.post(`/api/admin/students/${studentId}/delete`);
      } finally {
        await context.close();
      }
    }

    // Always attempt to delete from auth.users to prevent orphan data
    await deleteUser(STUDENT_EMAIL!);
  });

  test("should display students list page", async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/admin/students");
    await expect(
      page.getByRole("heading", { name: "수강생 관리" }),
    ).toBeVisible();
  });

  test("should create a new student", async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/admin/students");

    // Click register button
    await page.getByRole("link", { name: "수강생 등록" }).click();
    await expect(page).toHaveURL("/admin/students/new");

    // Fill required fields
    await page.locator("#email").fill(STUDENT_EMAIL!);
    await page.locator("#name").fill("E2E 테스트 수강생");
    await page.locator("button[role='combobox']").first().click();
    await page.getByRole("option", { name: "입시생" }).click();
    await page.locator("#region").fill("서울");
    await page.locator("#birth_date").fill("2005-01-15");
    await page.locator("#phone").fill("010-0000-0000");
    await page.locator("#class_start_date").fill("2026-01-01");
    // class_end_date auto-fills to 1 year later

    // Submit
    await page.getByRole("button", { name: "수강생 등록" }).click();

    // Should redirect to student detail page
    await page.waitForURL(/\/admin\/students\/[^/]+$/, { timeout: 15000 });
    studentUrl = page.url();
  });

  test("should show created student in list", async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/admin/students");
    await expect(page.getByText("E2E 테스트 수강생")).toBeVisible();
  });
});
