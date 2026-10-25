import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getAuthUser } from "./supa-client.server.ts";

const currentUserCache = new WeakMap<SupabaseClient, Promise<User | null>>();

/** Global privileges use current Auth metadata so a revoked role cannot linger in a JWT. */
export function getCurrentPrivilegedUser(
  client: SupabaseClient,
): Promise<User | null> {
  const cached = currentUserCache.get(client);
  if (cached) return cached;

  const result = (async () => {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    if (!(await getAuthUser(client))) return null;
    return error ? null : data.user;
  })();
  currentUserCache.set(client, result);
  return result;
}
