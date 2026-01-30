import { expect, test } from "@playwright/test";
import {
  checkInvalidField,
  confirmUser,
  deleteUser,
  loginUser,
  registerUser,
} from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.LOGIN_TEST_USER_EMAIL;

if (!TEST_EMAIL) {
  throw new Error("LOGIN_TEST_USER_EMAIL must be set in .env");
}

test.describe("User Login UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("should display login form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible(); 
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("should show alternative login methods", async ({ page }) => {
    await expect(page.getByText("Continue with Kakao")).toBeVisible();
  });

  test("should have a link to forgot password page", async ({ page }) => {
    const link = page.getByText("비밀번호 찾기", { exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL("/auth/forgot-password/reset");
  });

  test("should show error for short password", async ({ page }) => {
    await page.locator("#email").fill("john.doe@example.com");
    await page.locator("#password").fill("short");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(
      page.getByText("비밀번호는 최소 8자 이상이어야 합니다", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should show error when submitting with empty fields", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "로그인" }).click();
    await checkInvalidField(page, "email");
    await checkInvalidField(page, "password");
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page
      .locator("#email")
      .fill("thisuserdoesnotexist@seriouslyimsure.com");
    await page.locator("#password").fill("password");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(
      page.getByText("Invalid login credentials", { exact: true }),
    ).toBeVisible();
  });
});

test.describe.serial("User Login Flow", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await registerUser(page, TEST_EMAIL, "password");
    await context.close();
  });

  test.afterAll(async () => {
    await deleteUser(TEST_EMAIL);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("Email Confirmation Alert", async ({ page }) => {
    await test.step("should show email confirmation alert when email is unverified", async () => {
      await page.locator("#email").fill(TEST_EMAIL);
      await page.locator("#password").fill("password");
      await page.getByRole("button", { name: "로그인" }).click();

      await expect(
        page.getByText("이메일 인증 필요", {
          exact: true,
        }),
      ).toBeVisible({
        timeout: 10000,
      });
    });

    await test.step("should be able to resend confirmation email", async () => {
      await page.getByText("인증 이메일 재발송").click();
      await expect(
        page.getByTestId("resend-confirmation-email-spinner"),
      ).toBeVisible();
    });
  });

  test("should redirect to dashboard after successful login", async ({
    page,
  }) => {
    await confirmUser(page, TEST_EMAIL);
    await page.goto("/logout");
    await loginUser(page, TEST_EMAIL, "password");
    await expect(page).toHaveURL("/dashboard");
  });
});
