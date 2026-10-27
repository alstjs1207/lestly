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

import { BookingDaySettings } from "../components/booking-day-settings";
import { BookingTimeSettings } from "../components/booking-time-settings";
import { requireAdminRole } from "../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const settings = await getAllSettings(client, { organizationId });

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
    disabledBookingDays,
    disabledBookingTimes,
    maxConcurrentStudents:
      settingsMap[SETTING_KEYS.MAX_CONCURRENT_STUDENTS] ??
      DEFAULT_SETTINGS[SETTING_KEYS.MAX_CONCURRENT_STUDENTS].value,
    scheduleDurationHours:
      settingsMap[SETTING_KEYS.SCHEDULE_DURATION_HOURS] ??
      DEFAULT_SETTINGS[SETTING_KEYS.SCHEDULE_DURATION_HOURS].value,
    timeSlotIntervalMinutes:
      settingsMap[SETTING_KEYS.TIME_SLOT_INTERVAL_MINUTES] ??
      DEFAULT_SETTINGS[SETTING_KEYS.TIME_SLOT_INTERVAL_MINUTES].value,
  };
}

export default function SettingsScreen({ loaderData }: Route.ComponentProps) {
  const {
    maxConcurrentStudents,
    scheduleDurationHours,
    timeSlotIntervalMinutes,
    disabledBookingTimes,
    disabledBookingDays,
  } = loaderData;
  const fetcher = useFetcher<{ error?: string }>();
  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="text-muted-foreground">시스템 설정을 관리합니다.</p>
      </div>

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
                  동시간대 최대 인원
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
                  같은 시간대에 등록 가능한 최대 수강생 수
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule_duration_hours">
                  수업 시간 (시간)
                </Label>
                <Input
                  id="schedule_duration_hours"
                  name="schedule_duration_hours"
                  type="number"
                  min="1"
                  max="8"
                  defaultValue={scheduleDurationHours}
                />
                <p className="text-muted-foreground text-xs">
                  각 수업의 기본 시간 (고정)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time_slot_interval_minutes">
                  시간 단위 (분)
                </Label>
                <Input
                  id="time_slot_interval_minutes"
                  name="time_slot_interval_minutes"
                  type="number"
                  min="15"
                  max="60"
                  step="15"
                  defaultValue={timeSlotIntervalMinutes}
                />
                <p className="text-muted-foreground text-xs">
                  일정 등록 시 선택 가능한 시간 단위
                </p>
              </div>
            </div>

            <BookingDaySettings
              key={`days:${disabledBookingDays.join(",")}`}
              disabledDays={disabledBookingDays}
              busy={isSubmitting}
            />
            <BookingTimeSettings
              key={`times:${disabledBookingTimes.join(",")}`}
              disabledTimes={disabledBookingTimes}
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
