import { useState } from "react";

import { Button } from "~/core/components/ui/button";
import { BOOKING_WEEKDAYS } from "~/features/app-settings/booking-days";

export function BookingDaySettings({
  disabledDays,
  busy,
}: {
  disabledDays: number[];
  busy: boolean;
}) {
  const [closed, setClosed] = useState(disabledDays);
  return (
    <fieldset disabled={busy} className="space-y-3">
      <legend className="text-sm font-semibold">수강생 신청 차단 요일</legend>
      <input type="hidden" name="booking_days_present" value="1" />
      <p className="text-muted-foreground text-sm leading-relaxed">
        수업을 받지 않는 요일을 선택해주세요. 선택한 요일은 매주 수강생의 신규
        예약이 차단됩니다. 기존 예약은 유지되며, 관리자는 직접 일정을 등록할 수
        있습니다.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setClosed([])}
        >
          차단 해제
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setClosed([6, 0])}
        >
          주말 차단
        </Button>
        <span className="text-muted-foreground text-xs" role="status">
          {closed.length === 0
            ? "모든 요일 신청 가능"
            : `매주 ${closed.length}일 차단`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {BOOKING_WEEKDAYS.map(({ value, label }) => (
          <label
            key={value}
            className="bg-background flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border p-2 text-sm has-checked:border-violet-500 has-checked:bg-violet-50 dark:has-checked:bg-violet-950/30"
          >
            <input
              type="checkbox"
              name="disabled_weekdays"
              value={value}
              checked={closed.includes(value)}
              aria-label={`${label} 신청 차단`}
              className="size-4 accent-violet-600"
              onChange={(event) =>
                setClosed((current) =>
                  event.target.checked
                    ? [...current, value]
                    : current.filter((day) => day !== value),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      {closed.length === 7 && (
        <p className="text-muted-foreground text-sm" role="status">
          모든 요일의 수강생 신규 예약이 차단됩니다. 기존 예약은 유지됩니다.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        한국 시간의 수업 시작 요일을 기준으로 적용됩니다. 아래 설정 저장을
        누르면 반영됩니다.
      </p>
    </fieldset>
  );
}
