import { useState } from "react";

import { Button } from "~/core/components/ui/button";
import { BOOKING_START_TIMES } from "~/features/app-settings/booking-times";

export function BookingTimeSettings({
  disabledTimes,
  busy,
  startTimes = BOOKING_START_TIMES,
}: {
  disabledTimes: string[];
  busy: boolean;
  startTimes?: string[];
}) {
  const [blocked, setBlocked] = useState(disabledTimes);
  const allowed = startTimes.filter((time) => !blocked.includes(time));
  return (
    <fieldset disabled={busy} className="space-y-3">
      <legend className="text-sm font-semibold">수강생 신청 가능 시간</legend>
      <input type="hidden" name="booking_times_present" value="1" />
      <input
        type="hidden"
        name="disabled_start_times"
        value={JSON.stringify(blocked)}
      />
      <p className="text-muted-foreground text-sm leading-relaxed">
        설정한 시작 시각과 간격으로 만든 예약 시작 시간을 선택해주세요.
        비활성화한 시간은 수강생 신청 화면에서 숨겨집니다. 관리자는 비활성화한
        시간에도 일정을 등록할 수 있습니다.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setBlocked((current) =>
              current.filter((time) => !startTimes.includes(time)),
            )
          }
        >
          전체 허용
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setBlocked((current) => [...new Set([...current, ...startTimes])])
          }
        >
          전체 비활성화
        </Button>
        <span className="text-muted-foreground text-xs" role="status">
          {allowed.length}개 시간 허용
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {startTimes.map((time) => (
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
                setBlocked((current) =>
                  event.target.checked
                    ? current.filter((value) => value !== time)
                    : [...current, time],
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
        영향을 주지 않습니다. 이 영역의 저장 버튼을 누르면 반영됩니다.
      </p>
    </fieldset>
  );
}
