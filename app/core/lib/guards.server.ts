/**
 * Authentication and Request Guards Module
 * 
 * This module provides utility functions for protecting routes and API endpoints
 * by enforcing authentication and HTTP method requirements. These guards are designed
 * to be used in React Router loaders and actions to ensure proper access control
 * and request validation.
 * 
 * The module includes:
 * - Authentication guard to ensure a user is logged in
 * - HTTP method guard to ensure requests use the correct HTTP method
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { data } from "react-router";

import { getAuthUser } from "~/core/lib/supa-client.server";

export async function requireAuthentication(client: SupabaseClient) {
  const user = await getAuthUser(client);
  if (!user) {
    throw data(null, { status: 401 });
  }
  return user;
}

/**
 * Require a specific HTTP method for a route action
 * 
 * This function returns a middleware that checks if the incoming request uses
 * the specified HTTP method. If not, it throws a 405 Method Not Allowed response.
 * This is useful for ensuring that endpoints only accept the intended HTTP methods.
 * 
 * @example
 * // In an action function
 * export async function action({ request }: ActionArgs) {
 *   requireMethod('POST')(request);
 *   
 *   // Continue with POST-specific logic...
 *   return json({ ... });
 * }
 * 
 * @param method - The required HTTP method (e.g., 'GET', 'POST', 'PUT', 'DELETE')
 * @returns A function that validates the request method
 * @throws {Response} 405 Method Not Allowed if the request uses an incorrect method
 */
export function requireMethod(method: string) {
  return (request: Request) => {
    if (request.method !== method) {
      throw data(null, { status: 405 });
    }
  };
}
