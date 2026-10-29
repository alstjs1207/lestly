import type { Route } from "./+types/settings";

import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
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
import { BookingDaySettings } from "../components/booking-day-settings";
import { BookingPolicyFields } from "../components/booking-policy-fields";
import { BookingWindowFields } from "../components/booking-window-fields";
import { CancellationPolicyFields } from "../components/cancellation-policy-fields";
import { StudentTypeSettings } from "../components/student-type-settings";
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
  const { maxConcurrentStudents, disabledBookingTimes, disabledBookingDays } =
    loaderData;
  const fetcher = useFetcher<{ error?: string }>();
  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="text-muted-foreground">시스템 설정을 관리합니다.</p>
      </div>

      <StudentTypeSettings types={loaderData.studentTypes} />

      <Card>
        <CardHeader>
          <CardTitle>일정 설정</CardTitle>
          <CardDescription>일정 등록 관련 설정을 변경합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <fetcher.Form
            method="post"
            action="/api/admin/settings"
            className="space-y-6"
          >
            {fetcher.data?.error && (
              <p
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
                role="alert"
              >
                {fetcher.data.error}
              </p>
            )}
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="max_concurrent_students">
                  조직 전체 동시 수강 인원
                </Label>
                <Input
                  id="max_concurrent_students"
                  name="max_concurrent_students"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={maxConcurrentStudents}
                />
                <p className="text-muted-foreground text-xs">
                  모든 클래스의 같은 시간대 예약을 합산합니다. 클래스별 모집
                  정원과는 별도인 조직 전체 제한입니다.
                </p>
              </div>
            </div>
            <CancellationPolicyFields
              key={JSON.stringify(loaderData.bookingPolicy.cancellationPolicy)}
              policy={loaderData.bookingPolicy.cancellationPolicy}
              busy={isSubmitting}
            />
            <BookingWindowFields
              key={JSON.stringify(loaderData.bookingPolicy.bookingWindow)}
              window={loaderData.bookingPolicy.bookingWindow}
              now={loaderData.now}
              busy={isSubmitting}
            />
            <BookingPolicyFields
              key={JSON.stringify([
                loaderData.bookingPolicy,
                disabledBookingTimes,
              ])}
              policy={loaderData.bookingPolicy}
              disabledTimes={disabledBookingTimes}
              busy={isSubmitting}
            />

            <BookingDaySettings
              key={`days:${disabledBookingDays.join(",")}`}
              disabledDays={disabledBookingDays}
              busy={isSubmitting}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "저장 중..." : "설정 저장"}
              </Button>
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  );
}
