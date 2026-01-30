import { expect, test } from "@playwright/test";
import { loginAdminUser } from "e2e/utils/test-helpers";

const ADMIN_EMAIL = process.env.ADMIN_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_TEST_EMAIL and ADMIN_TEST_PASSWORD must be set in .env");
}

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminUser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin");
  });

  test("should display dashboard title and stats", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();

    // 4 stats cards
    await expect(page.getByText("전체 수강생")).toBeVisible();
    await expect(page.getByText("정상 수강생")).toBeVisible();
    await expect(page.getByText("졸업 수강생")).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "오늘의 수업" })).toBeVisible(); 
  });

  test("should display calendar section", async ({ page }) => {
    await expect(page.getByText("이번 달 일정")).toBeVisible();
  });
});
