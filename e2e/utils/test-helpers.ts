/**
 * E2E Test Helper Functions
 * 
 * This file contains utility functions used across multiple E2E test files to:
 * 1. Validate form fields and error messages
 * 2. Create, login, and manage test users
 * 3. Handle email confirmation flows
 * 4. Clean up test data after tests
 * 
 * These helpers ensure consistent testing patterns and reduce code duplication
 * across the test suite, making tests more maintainable and readable.
 */

import { type Page, expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import db from "~/core/db/drizzle-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { organizations } from "~/features/organizations/schema";

export { adminClient };

/**
 * Check if a form field has validation errors
 * 
 * This function verifies that a field is invalid and has a non-empty validation message.
 * It uses the browser's built-in form validation API to check validity and retrieve
 * the validation message, ensuring consistent validation testing across forms.
 * 
 * @param page - The Playwright Page object
 * @param fieldId - The HTML id attribute of the input field to check
 */
export async function checkInvalidField(page: Page, fieldId: string) {
  // Check if the field is marked as invalid by the browser
  const isValid = await page.$eval(
    `#${fieldId}`,
    (el: HTMLInputElement) => el.validity.valid,
  );
  expect(isValid).toBe(false);

  // Verify that there is a non-empty validation message
  const message = await page.$eval(
    `#${fieldId}`,
    (el: HTMLInputElement) => el.validationMessage,
  );
  expect(message).not.toBe("");
}


/**
 * Log in a user with email and password
 * 
 * This function navigates to the login page, fills in the credentials,
 * submits the form, and waits for the login process to complete.
 * 
 * The extended timeout (15 seconds) allows for server-side processing,
 * potential redirects, and session establishment to complete.
 * 
 * @param page - The Playwright Page object
 * @param email - The email address of the user to log in
 * @param password - The password for the user account
 */
export async function loginUser(page: Page, email: string, password: string) {
  // Navigate to the login page
  await page.goto("/login");
  // Fill in the email and password fields
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  // Click the login button
  await page.getByRole("button", { name: "로그인" }).click();
  // Wait for login process to complete (redirect to /dashboard or /admin)
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15000 });
}

/**
 * Log in an admin user with email and password
 *
 * This function navigates to the login page, fills in the admin credentials,
 * submits the form, and waits for redirect to /admin.
 *
 * @param page - The Playwright Page object
 * @param email - The email address of the admin user
 * @param password - The password for the admin account
 */
export async function loginAdminUser(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin/, { timeout: 15000 });
}

/**
 * Register a new user account via Supabase Admin API
 *
 * This function creates a user using the Admin API instead of the UI.
 * It automatically generates a name from the email address.
 * By default, the user is created with email confirmed.
 *
 * @param email - The email address for the new user
 * @param password - The password for the new user account
 * @param options - Optional settings (emailConfirm defaults to true)
 */
export async function registerUser(
  email: string,
  password: string,
  options?: { emailConfirm?: boolean },
) {
  const emailConfirm = options?.emailConfirm ?? true;
  const name = email.split("@")[0];

  const { error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: emailConfirm,
    user_metadata: {
      name,
      display_name: name,
      marketing_consent: false,
    },
    app_metadata: {
      provider: "email",
      providers: ["email"],
    },
  });

  if (error) {
    throw new Error(`Failed to create test user ${email}: ${error.message}`);
  }
}

/**
 * Confirm a user's email address
 * 
 * This function simulates clicking the confirmation link in the verification email.
 * It directly queries the database to get the confirmation token for the specified user,
 * then navigates to the confirmation URL with that token.
 * 
 * This approach allows testing the email confirmation flow without actually
 * sending or intercepting emails, which simplifies the testing process.
 * 
 * @param page - The Playwright Page object
 * @param email - The email address of the user to confirm
 */
export async function confirmUser(page: Page, email: string) {
  // Get the confirmation token directly from the database
  const [{ confirmation_token }] = await db.execute<{
    confirmation_token: string;
  }>(sql`SELECT confirmation_token FROM auth.users WHERE email = ${email}`);
  
  // Navigate to the confirmation URL with the token
  await page.goto(
`/auth/confirm?token_hash=${confirmation_token}&type=email&next=/&testid=6554`
  );
}

/**
 * Confirm a user's email address via Supabase Admin API
 *
 * This function uses the Admin API to set the user's email as confirmed,
 * without requiring a browser page or confirmation token.
 *
 * @param email - The email address of the user to confirm
 */
export async function confirmUserViaAdmin(email: string) {
  const [{ id }] = await db.execute<{ id: string }>(
    sql`SELECT id FROM auth.users WHERE email = ${email}`,
  );
  const { error } = await adminClient.auth.admin.updateUserById(id, {
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to confirm user ${email}: ${error.message}`);
  }
}

/**
 * Delete a test user from the database
 * 
 * This function removes a user account from the database by email address.
 * It's used in test cleanup to ensure test data doesn't accumulate and
 * that tests can be run repeatedly without conflicts.
 * 
 * The function uses Drizzle ORM to perform a direct database deletion,
 * bypassing the application's API for efficiency and reliability in tests.
 * 
 * @param email - The email address of the user to delete
 */
export async function deleteUser(email: string) {
  await db.delete(authUsers).where(eq(authUsers.email, email));
}

/**
 * Delete organizations associated with a user by email
 *
 * Since the organizations table does not cascade delete when a user is removed,
 * this helper finds and deletes organizations that the user belongs to.
 *
 * @param email - The email address of the user whose organizations to delete
 */
export async function deleteOrganizationByMember(email: string) {
  const result = await db.execute<{ organization_id: string }>(
    sql`SELECT om.organization_id FROM organization_members om
        JOIN auth.users u ON u.id = om.profile_id
        WHERE u.email = ${email}`,
  );
  if (result.length > 0) {
    await db
      .delete(organizations)
      .where(eq(organizations.organization_id, result[0].organization_id));
  }
}