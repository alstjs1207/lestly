import { useState } from "react";

import { Button } from "~/core/components/ui/button";
import { BOOKING_START_TIMES } from "~/features/app-settings/booking-times";

export function BookingTimeSettings({
  disabledTimes,
  busy,
}: {
  disabledTimes: string[];
  busy: boolean;
}) {
  const [allowed, setAllowed] = useState(() =>
    BOOKING_START_TIMES.filter((time) => !disabledTimes.includes(time)),
  );
  return (
    <fieldset disabled={busy} className="space-y-3">
      <legend className="text-sm font-semibold">수강생 신청 가능 시간</legend>
      <input type="hidden" name="booking_times_present" value="1" />
      <p className="text-muted-foreground text-sm leading-relaxed">
        매일 적용할 수업 시작 시간을 30분 단위로 선택해주세요. 비활성화한 시간은
        수강생 신청 화면에서 숨겨집니다. 관리자는 비활성화한 시간에도 일정을
        등록할 수 있습니다.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAllowed([...BOOKING_START_TIMES])}
        >
          전체 허용
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAllowed([])}
        >
          전체 비활성화
        </Button>
        <span className="text-muted-foreground text-xs" role="status">
          {allowed.length}개 시간 허용
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {BOOKING_START_TIMES.map((time) => (
          <label
            key={time}
            className="bg-background flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm has-checked:border-violet-500 has-checked:bg-violet-50 dark:has-checked:bg-violet-950/30"
          >
            <input
              type="checkbox"
              name="allowed_start_times"
              value={time}
              checked={allowed.includes(time)}
              aria-label={`${time} 신청 허용`}
              className="size-4 accent-violet-600"
              onChange={(event) =>
                setAllowed((current) =>
                  event.target.checked
                    ? [...current, time]
                    : current.filter((value) => value !== time),
                )
              }
            />
            {time}
          </label>
        ))}
      </div>
      {allowed.length === 0 && (
        <p className="text-muted-foreground text-sm" role="status">
          수강생의 신규 시간 선택이 모두 숨겨집니다. 기존 예약은 유지됩니다.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        수업 시작 시각에만 적용되며, 이미 등록된 일정과 수업 종료 시각에는
        영향을 주지 않습니다. 아래 설정 저장을 누르면 반영됩니다.
      </p>
    </fieldset>
  );
}
