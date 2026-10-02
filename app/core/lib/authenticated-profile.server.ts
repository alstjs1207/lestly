import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const profileCache = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<Profile | null>>
>();

/** Resolve login identity to the stable profile used by memberships and schedules. */
export function getAuthenticatedProfile(
  client: SupabaseClient<Database>,
  authUserId: string,
): Promise<Profile | null> {
  let clientCache = profileCache.get(client);
  if (!clientCache) {
    clientCache = new Map();
    profileCache.set(client, clientCache);
  }
  const cached = clientCache.get(authUserId);
  if (cached) return cached;

  const result = (async () => {
    const { data: profile, error } = await client
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    // Authorization must never proceed using an assumed profile ID.
    if (error) throw error;
    return profile;
  })();
  clientCache.set(authUserId, result);
  return result;
}
