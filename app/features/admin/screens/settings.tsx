import type { Route } from "./+types/settings";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  DISABLED_BOOKING_DAYS_KEY,
  parseDisabledBookingDays,
} from "~/features/app-settings/booking-days";
import {
  DISABLED_BOOKING_TIMES_KEY,
  parseDisabledBookingTimes,
} from "~/features/app-settings/booking-times";
import { getAllSettings } from "~/features/app-settings/queries";
import { DEFAULT_SETTINGS, SETTING_KEYS } from "~/features/app-settings/schema";

import {
  BOOKING_POLICY_KEY,
  DEFAULT_BOOKING_POLICY,
  parseBookingPolicy,
} from "../../app-settings/booking-policy";
import {
  BOOKING_WINDOW_KEY,
  DEFAULT_BOOKING_WINDOW,
  bookingWindowSchema,
} from "../../app-settings/booking-window";
import {
  CANCELLATION_POLICY_KEY,
  DEFAULT_CANCELLATION_POLICY,
  cancellationPolicySchema,
} from "../../app-settings/cancellation-policy";
import { getStudentTypes } from "../../organizations/student-types.server";
import { SettingsView } from "../components/settings-view";
import { requireAdminRole } from "../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const [settings, studentTypes] = await Promise.all([
    getAllSettings(client, { organizationId }),
    getStudentTypes(client, organizationId),
  ]);

  // Convert to a map for easy access
  const settingsMap: Record<string, number> = {};
  settings.forEach((setting) => {
    const value = setting.setting_value as { value?: unknown } | null;
    if (typeof value?.value === "number") {
      settingsMap[setting.setting_key] = value.value;
    }
  });

  const bookingSetting = settings.find(
    (setting) => setting.setting_key === DISABLED_BOOKING_TIMES_KEY,
  );
  const disabledBookingTimes = bookingSetting
    ? parseDisabledBookingTimes(
        (bookingSetting.setting_value as { value: unknown }).value,
      )
    : [];
  const daySetting = settings.find(
    (setting) => setting.setting_key === DISABLED_BOOKING_DAYS_KEY,
  );
  const disabledBookingDays = daySetting
    ? parseDisabledBookingDays(
        (daySetting.setting_value as { value: unknown }).value,
      )
    : [];
  return {
    now: new Date().toISOString(),
    bookingPolicy: {
      ...(settings.some((s) => s.setting_key === BOOKING_POLICY_KEY)
        ? parseBookingPolicy(
            settings.find((s) => s.setting_key === BOOKING_POLICY_KEY)!
              .setting_value,
          )
        : DEFAULT_BOOKING_POLICY),
      cancellationPolicy: settings.some(
        (s) => s.setting_key === CANCELLATION_POLICY_KEY,
      )
        ? cancellationPolicySchema.parse(
            settings.find((s) => s.setting_key === CANCELLATION_POLICY_KEY)!
              .setting_value,
          )
        : DEFAULT_CANCELLATION_POLICY,
      bookingWindow: settings.some((s) => s.setting_key === BOOKING_WINDOW_KEY)
        ? bookingWindowSchema.parse(
            settings.find((s) => s.setting_key === BOOKING_WINDOW_KEY)!
              .setting_value,
          )
        : DEFAULT_BOOKING_WINDOW,
    },
    studentTypes,
    disabledBookingDays,
    disabledBookingTimes,
    maxConcurrentStudents:
      settingsMap[SETTING_KEYS.MAX_CONCURRENT_STUDENTS] ??
      DEFAULT_SETTINGS[SETTING_KEYS.MAX_CONCURRENT_STUDENTS].value,
  };
}

export default function SettingsScreen({ loaderData }: Route.ComponentProps) {
  return <SettingsView loaderData={loaderData} />;
}
