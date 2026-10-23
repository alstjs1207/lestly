import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  DISABLED_BOOKING_TIMES_KEY,
  disabledBookingTimesFromForm,
} from "~/features/app-settings/booking-times";
import { SETTING_KEYS } from "~/features/app-settings/schema";

import { requireAdminRole } from "../../guards.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();

  const maxConcurrentStudents = parseInt(
    formData.get("max_concurrent_students") as string,
  );
  const scheduleDurationHours = parseInt(
    formData.get("schedule_duration_hours") as string,
  );
  const timeSlotIntervalMinutes = parseInt(
    formData.get("time_slot_interval_minutes") as string,
  );

  if (
    !Number.isInteger(maxConcurrentStudents) ||
    maxConcurrentStudents < 1 ||
    maxConcurrentStudents > 100 ||
    !Number.isInteger(scheduleDurationHours) ||
    scheduleDurationHours < 1 ||
    scheduleDurationHours > 8 ||
    ![15, 30, 45, 60].includes(timeSlotIntervalMinutes)
  ) {
    return data(
      { error: "설정값의 허용 범위를 확인해 주세요." },
      { status: 400 },
    );
  }

  let disabledTimes: string[];
  try {
    disabledTimes = disabledBookingTimesFromForm(formData);
  } catch {
    return data({ error: "신청 가능 시간을 확인해 주세요." }, { status: 400 });
  }

  try {
    const { error } = await client.from("settings").upsert(
      [
        {
          organization_id: organizationId,
          setting_key: SETTING_KEYS.MAX_CONCURRENT_STUDENTS,
          setting_value: { value: maxConcurrentStudents },
        },
        {
          organization_id: organizationId,
          setting_key: SETTING_KEYS.SCHEDULE_DURATION_HOURS,
          setting_value: { value: scheduleDurationHours },
        },
        {
          organization_id: organizationId,
          setting_key: SETTING_KEYS.TIME_SLOT_INTERVAL_MINUTES,
          setting_value: { value: timeSlotIntervalMinutes },
        },
        {
          organization_id: organizationId,
          setting_key: DISABLED_BOOKING_TIMES_KEY,
          setting_value: { value: disabledTimes },
        },
      ],
      { onConflict: "organization_id,setting_key" },
    );
    if (error) throw error;
  } catch (error) {
    console.error("Failed to update settings", error);
    return data(
      {
        error: "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }

  return redirect("/admin/settings");
}
