/**
 * Supabase Client Server Module
 *
 * This module provides a function to create a Supabase client for server-side operations
 * with proper cookie handling for authentication. It's a critical part of the authentication
 * system, allowing server components to interact with Supabase while maintaining user sessions.
 *
 * The module handles:
 * - Creating a Supabase client with environment variables
 * - Setting up cookie-based authentication
 * - Properly managing Set-Cookie headers for authentication responses
 * - Type safety with the Database type
 *
 * This is used throughout the application for server-side data fetching, authentication,
 * and other Supabase operations that need to run on the server.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";

const clientCache = new WeakMap<Request, [SupabaseClient<Database>, Headers]>();

export default function makeServerClient(
  request: Request,
): [SupabaseClient<Database>, Headers] {
  const cached = clientCache.get(request);
  if (cached) return cached;

  const headers = new Headers();
  const client = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        // @ts-ignore - The type definitions don't match exactly but this works
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "");
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options),
            ),
          );
        },
      },
    },
  );

  const result: [SupabaseClient<Database>, Headers] = [client, headers];
  clientCache.set(request, result);
  return result;
}

const userCache = new WeakMap<SupabaseClient, Promise<User | null>>();

export function getAuthUser(client: SupabaseClient): Promise<User | null> {
  let cached = userCache.get(client);
  if (cached) return cached;

  cached = client.auth.getUser().then(({ data: { user } }) => user);
  userCache.set(client, cached);
  return cached;
}
