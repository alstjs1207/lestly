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
  const client = createServerClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").flatMap(
            ({ name, value }) => (value === undefined ? [] : [{ name, value }]),
          );
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

async function loadVerifiedAuthUser(
  client: SupabaseClient,
): Promise<User | null> {
  const { data: claimsData, error: claimsError } =
    await client.auth.getClaims();

  if (!claimsError && claimsData?.claims.sub) {
    const claims = claimsData.claims;
    const issuedAt = new Date(claims.iat * 1000).toISOString();

    // These values come only from the signed, expiry-checked JWT. Avoid reading
    // the cookie-backed session user again after verification; Supabase warns
    // against treating that unverified object as authoritative on the server.
    return {
      id: claims.sub,
      aud: Array.isArray(claims.aud)
        ? (claims.aud[0] ?? "authenticated")
        : claims.aud,
      role: claims.role,
      email: claims.email,
      phone: claims.phone,
      app_metadata: claims.app_metadata ?? {},
      user_metadata: claims.user_metadata ?? {},
      created_at: issuedAt,
      updated_at: issuedAt,
      is_anonymous: claims.is_anonymous === true,
    };
  }

  // Keep compatibility with legacy/symmetric tokens and temporary JWKS
  // failures. getUser() performs the same verification through Supabase Auth.
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
}

export function getAuthUser(client: SupabaseClient): Promise<User | null> {
  let cached = userCache.get(client);
  if (cached) return cached;

  cached = loadVerifiedAuthUser(client);
  userCache.set(client, cached);
  return cached;
}

export async function getSessionUser(
  client: SupabaseClient,
): Promise<User | null> {
  // Keep the legacy helper name for existing callers. getAuthUser() validates
  // the access token and caches the result per request/client.
  return getAuthUser(client);
}
