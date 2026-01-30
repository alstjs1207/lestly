import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

import db from "~/core/db/drizzle-client.server";

import {
  adminClient,
  checkInvalidField,
  deleteOrganizationByMember,
  deleteUser,
} from "../utils/test-helpers";

const TEST_EMAIL = process.env.ADMIN_SIGNUP_TEST_EMAIL;
const TEST_PASSWORD = "12345678";

if (!TEST_EMAIL) {
  throw new Error("ADMIN_SIGNUP_TEST_EMAIL must be set in .env");
}

test.describe("Admin Signup UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/signup");
  });

  test("should display signup form", async ({ page }) => {
    await expect(page.locator("#email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "인증 코드 받기" }),
    ).toBeVisible();
  });

  test("should show validation error for empty email", async ({ page }) => {
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await checkInvalidField(page, "email");
  });

  test("should show validation error for invalid email format", async ({
    page,
  }) => {
    await page.locator("#email").fill("invalid@email");
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await expect(
      page.getByText("올바른 이메일 주소를 입력해주세요"),
    ).toBeVisible();
  });
});

test.describe.serial("Admin Signup Flow", () => {
  test.beforeAll(async () => {
    await deleteOrganizationByMember(TEST_EMAIL);
    await deleteUser(TEST_EMAIL);
  });

  test.afterAll(async () => {
    await deleteOrganizationByMember(TEST_EMAIL);
    await deleteUser(TEST_EMAIL);
  });

  test("should submit email and redirect to verify page", async ({
    page,
  }) => {
    await page.goto("/admin/signup");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await expect(page).toHaveURL(/\/admin\/signup\/verify/, {
      timeout: 15000,
    });
  });

  test("should create user via admin API and navigate to profile page", async ({
    page,
  }) => {
    // Update existing user (created by signInWithOtp in step 1) with password and email confirmation
    const [{ id }] = await db.execute<{ id: string }>(
      sql`SELECT id FROM auth.users WHERE email = ${TEST_EMAIL}`,
    );
    await adminClient.auth.admin.updateUserById(id, {
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    // Log in with the updated credentials
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();

    // Admin without org redirects to /dashboard, then navigate to profile setup
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.goto("/admin/signup/profile");
    await expect(page.locator("#name")).toBeVisible();
  });

  test("should fill profile form and redirect to organization page", async ({
    page,
  }) => {
    // Log in and navigate to profile page
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.goto("/admin/signup/profile");

    // Fill in profile form
    await page.locator("#name").fill("테스트관리자");
    await page.locator("#password").fill("1234567890");
    await page.locator("#passwordConfirm").fill("1234567890");
    await page.locator("#terms").check();
    await page.getByRole("button", { name: "다음" }).click();

    await expect(page).toHaveURL(/\/admin\/signup\/organization/, {
      timeout: 15000,
    });
  });

  test("should fill organization form and redirect to admin dashboard", async ({
    page,
  }) => {
    // Log in and navigate to organization page
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill("1234567890");
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.goto("/admin/signup/organization");

    // Fill in organization form
    await page.locator("#name").fill("테스트 개인 레슨");
    await page.getByRole("button", { name: "시작하기" }).click();

    await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
  });
});
