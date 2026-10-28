import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  BOOKING_POLICY_KEY,
  DEFAULT_BOOKING_POLICY,
  parseBookingPolicy,
} from "./booking-policy.ts";

export async function getBookingPolicy(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const { data, error } = await client
    .from("settings")
    .select("setting_value")
    .eq("organization_id", organizationId)
    .eq("setting_key", BOOKING_POLICY_KEY)
    .maybeSingle();
  if (error) throw error;
  return data ? parseBookingPolicy(data.setting_value) : DEFAULT_BOOKING_POLICY;
}
