import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getBookingPolicy } from "../app-settings/booking-policy.server";
import { resolveProgramBookingPolicy } from "./booking-policy";

export async function getProgramBookingPolicy(
  client: SupabaseClient<Database>,
  { organizationId, programId }: { organizationId: string; programId: number },
) {
  if (!Number.isSafeInteger(programId) || programId < 1)
    throw new Error("schedule_program_required");
  const [organizationPolicy, result] = await Promise.all([
    getBookingPolicy(client, { organizationId }),
    client
      .from("programs")
      .select(
        "program_id,duration_minutes,booking_duration_minutes,max_capacity",
      )
      .eq("organization_id", organizationId)
      .eq("program_id", programId)
      .eq("status", "ACTIVE")
      .maybeSingle(),
  ]);
  if (result.error) throw result.error;
  if (!result.data) throw new Error("schedule_program_not_eligible");
  return {
    policy: resolveProgramBookingPolicy(organizationPolicy, result.data),
    capacity: result.data.max_capacity!,
    program: result.data,
  };
}
