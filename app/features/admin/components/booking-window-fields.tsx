import { useState } from "react";

import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  type BookingWindow,
  bookingWindowDescription,
  bookingWindowRange,
  bookingWindowSchema,
} from "~/features/app-settings/booking-window";
import { toKSTDateString } from "~/features/schedules/utils/kst";

export function BookingWindowFields({
  window,
  now,
  busy,
}: {
  window: BookingWindow;
  now: string;
  busy: boolean;
}) {
  const [mode, setMode] = useState(window.mode);
  const [openingDay, setOpeningDay] = useState(
    window.mode === "monthly" ? String(window.openingDay) : "25",
  );
  const [daysAhead, setDaysAhead] = useState(
    window.mode === "rolling" ? String(window.daysAhead) : "14",
  );
  const parsed = bookingWindowSchema.safeParse(
    mode === "monthly"
      ? { mode, openingDay: openingDay === "" ? NaN : Number(openingDay) }
      : { mode, daysAhead: daysAhead === "" ? NaN : Number(daysAhead) },
  );
  const range = parsed.success
    ? bookingWindowRange(parsed.data, new Date(now))
    : null;
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <legend className="sr-only">예약 오픈 방식</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            {
              value: "monthly",
              label: "월별 오픈",
              description: "매월 지정일에 다음 달 예약을 엽니다.",
            },
            {
              value: "rolling",
              label: "오늘 기준 N일",
              description: "오늘부터 정한 일수 뒤까지 예약을 받습니다.",
            },
          ] as const
        ).map((option) => (
          <label
            key={option.value}
            className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-lg border p-4"
          >
            <input
              type="radio"
              name="bookingWindowMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
              className="mt-1"
              required
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
      {mode === "monthly" ? (
        <div className="space-y-2">
          <Label htmlFor="bookingOpeningDay">다음 달 예약 오픈일</Label>
          <Input
            id="bookingOpeningDay"
            name="bookingOpeningDay"
            type="number"
            min="1"
            max="31"
            required
            value={openingDay}
            onChange={(e) => setOpeningDay(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-muted-foreground text-xs">
            매월 지정일 00시(한국 시간)에 열립니다. 해당 날짜가 없는 달에는
            말일에 열립니다. 이번 달의 남은 수업도 신청할 수 있습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="bookingDaysAhead">오늘부터 예약 가능한 일수</Label>
          <Input
            id="bookingDaysAhead"
            name="bookingDaysAhead"
            type="number"
            min="0"
            max="365"
            required
            value={daysAhead}
            onChange={(e) => setDaysAhead(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-muted-foreground text-xs">
            0~365일. 0일은 오늘 수업만 신청할 수 있습니다. 매일 한국 시간 00시에
            범위가 하루씩 이동합니다.
          </p>
        </div>
      )}
      {range && parsed.success ? (
        <div
          aria-label="예약 기간 미리보기"
          className="bg-muted/40 space-y-2 rounded-lg border p-4 text-sm"
        >
          <p className="font-medium">현재 기준 신청 가능한 수업 날짜</p>
          <p className="tabular-nums">
            {toKSTDateString(range.startDate)} ~{" "}
            {toKSTDateString(range.endDate)}
          </p>
          <p className="text-muted-foreground text-xs">
            {bookingWindowDescription(parsed.data)} 기준:{" "}
            {toKSTDateString(new Date(now))} · 한국 시간
          </p>
        </div>
      ) : (
        <p role="alert" className="text-destructive text-sm">
          예약 오픈일 또는 예약 가능한 일수를 확인해 주세요.
        </p>
      )}
      <p className="text-muted-foreground text-xs leading-relaxed">
        설정 저장 후 신규 수강생 예약에 적용합니다. 실제 예약은 수강 기간·접수
        마감·휴무·정원도 함께 확인하며, 이미 등록된 예약은 유지됩니다.
      </p>
    </fieldset>
  );
}
