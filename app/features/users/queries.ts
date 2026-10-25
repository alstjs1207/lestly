import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getAuthenticatedProfile } from "../../core/lib/authenticated-profile.server";

export async function getUserProfile(
  client: SupabaseClient<Database>,
  { userId }: { userId: string | null },
) {
  return userId ? getAuthenticatedProfile(client, userId) : null;
}
