import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  DISABLED_BOOKING_DAYS_KEY,
  disabledBookingDaysFromForm,
} from "~/features/app-settings/booking-days";
import {
  DISABLED_BOOKING_TIMES_KEY,
  disabledBookingTimesFromForm,
} from "~/features/app-settings/booking-times";
import { SETTING_KEYS } from "~/features/app-settings/schema";

import {
  BOOKING_POLICY_KEY,
  bookingPolicySchema,
} from "../../../app-settings/booking-policy";
import { getBookingPolicy } from "../../../app-settings/booking-policy.server";
import {
  BOOKING_WINDOW_KEY,
  bookingWindowFromForm,
} from "../../../app-settings/booking-window";
import { requireAdminRole } from "../../guards.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();

  const numberField = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  };
  const maxConcurrentStudents = numberField("max_concurrent_students");
  let bookingWindow;
  try {
    // A form opened before the upgrade must preserve the current window.
    bookingWindow = formData.has("bookingWindowMode")
      ? bookingWindowFromForm(formData)
      : (await getBookingPolicy(client, { organizationId })).bookingWindow;
  } catch {
    return data(
      { error: "예약 오픈 방식을 확인하거나 설정을 새로 불러와 주세요." },
      { status: 400 },
    );
  }
  const parsed = bookingPolicySchema.safeParse({
    durationMinutes: String(formData.get("durationMinutes") ?? "")
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number),
    defaultDurationMinutes: numberField("defaultDurationMinutes"),
    firstStart: formData.get("firstStart"),
    lastStart: formData.get("lastStart"),
    startIntervalMinutes: numberField("startIntervalMinutes"),
    leadMinutes: numberField("leadMinutes"),
    bookingWindow,
  });
  if (
    !parsed.success ||
    !Number.isInteger(maxConcurrentStudents) ||
    maxConcurrentStudents < 1 ||
    maxConcurrentStudents > 100
  )
    return data(
      {
        error:
          "수업 길이·기본값·시작 시각·간격·접수 마감·정원을 확인해 주세요.",
      },
      { status: 400 },
    );
  let disabledTimes: string[];
  try {
    disabledTimes = disabledBookingTimesFromForm(formData);
  } catch {
    return data({ error: "신청 가능 시간을 확인해 주세요." }, { status: 400 });
  }

  let disabledDays: number[];
  try {
    disabledDays = disabledBookingDaysFromForm(formData);
  } catch {
    return data({ error: "신청 차단 요일을 확인해 주세요." }, { status: 400 });
  }

  try {
    const { bookingWindow: window, ...timePolicy } = parsed.data;
    const { error } = await client.from("settings").upsert(
      [
        {
          organization_id: organizationId,
          setting_key: SETTING_KEYS.MAX_CONCURRENT_STUDENTS,
          setting_value: { value: maxConcurrentStudents },
        },
        {
          organization_id: organizationId,
          setting_key: BOOKING_POLICY_KEY,
          setting_value: timePolicy,
        },
        {
          organization_id: organizationId,
          setting_key: DISABLED_BOOKING_TIMES_KEY,
          setting_value: { value: disabledTimes },
        },
        {
          organization_id: organizationId,
          setting_key: DISABLED_BOOKING_DAYS_KEY,
          setting_value: { value: disabledDays },
        },
        {
          organization_id: organizationId,
          setting_key: BOOKING_WINDOW_KEY,
          setting_value: window,
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
