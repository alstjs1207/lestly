import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  BOOKING_POLICY_KEY,
  DEFAULT_BOOKING_POLICY,
  parseBookingPolicy,
} from "./booking-policy.ts";
import {
  BOOKING_WINDOW_KEY,
  DEFAULT_BOOKING_WINDOW,
  bookingWindowSchema,
} from "./booking-window.ts";
import {
  CANCELLATION_POLICY_KEY,
  DEFAULT_CANCELLATION_POLICY,
  cancellationPolicySchema,
} from "./cancellation-policy.ts";

export async function getBookingPolicy(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const { data, error } = await client
    .from("settings")
    .select("setting_key,setting_value")
    .eq("organization_id", organizationId)
    .in("setting_key", [
      BOOKING_POLICY_KEY,
      BOOKING_WINDOW_KEY,
      CANCELLATION_POLICY_KEY,
    ]);
  if (error) throw error;
  const savedPolicy = data?.find(
    (row) => row.setting_key === BOOKING_POLICY_KEY,
  );
  const savedWindow = data?.find(
    (row) => row.setting_key === BOOKING_WINDOW_KEY,
  );
  const savedCancellation = data?.find(
    (row) => row.setting_key === CANCELLATION_POLICY_KEY,
  );
  return {
    ...(savedPolicy
      ? parseBookingPolicy(savedPolicy.setting_value)
      : DEFAULT_BOOKING_POLICY),
    cancellationPolicy: savedCancellation
      ? cancellationPolicySchema.parse(savedCancellation.setting_value)
      : DEFAULT_CANCELLATION_POLICY,
    bookingWindow: savedWindow
      ? bookingWindowSchema.parse(savedWindow.setting_value)
      : DEFAULT_BOOKING_WINDOW,
  };
}
