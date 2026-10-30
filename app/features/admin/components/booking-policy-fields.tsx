import { useState } from "react";

import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  type BookingPolicy,
  bookingPolicySchema,
  bookingStartTimes,
  clockMinutes,
  formatDuration,
  minuteClock,
} from "~/features/app-settings/booking-policy";

import { BookingTimeSettings } from "./booking-time-settings";

export function ClassDefaultsFields({
  policy,
  capacity,
}: {
  policy: BookingPolicy;
  capacity: number;
}) {
  const [lengths, setLengths] = useState(policy.durationMinutes.join(", "));
  const [defaultMinutes, setDefaultMinutes] = useState(
    String(policy.defaultDurationMinutes),
  );
  const parsed = bookingPolicySchema.safeParse({
    ...policy,
    durationMinutes: lengths
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number),
    defaultDurationMinutes:
      defaultMinutes === "" ? NaN : Number(defaultMinutes),
  });
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="sr-only">새 클래스 기본값</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="durationMinutes">허용 수업 길이 (분)</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            required
            value={lengths}
            onChange={(e) => setLengths(e.target.value)}
            placeholder="예: 40, 50, 90"
          />
          <p className="text-muted-foreground text-xs">
            1~1440분, 최대 24개를 쉼표로 구분합니다.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="defaultDurationMinutes">기본 수업 길이 (분)</Label>
          <Input
            id="defaultDurationMinutes"
            name="defaultDurationMinutes"
            type="number"
            required
            min="1"
            max="1440"
            value={defaultMinutes}
            onChange={(e) => setDefaultMinutes(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            허용 수업 길이 중에서 선택합니다.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_concurrent_students">기본 정원 (명)</Label>
          <Input
            id="max_concurrent_students"
            name="max_concurrent_students"
            type="number"
            required
            min="1"
            max="100"
            defaultValue={capacity}
          />
          <p className="text-muted-foreground text-xs">
            한 수업에 참여할 수 있는 최대 인원입니다.
          </p>
        </div>
      </div>
      {!parsed.success && (
        <p role="alert" className="text-destructive text-sm">
          수업 길이는 중복 없이 입력하고 허용 목록 안에서 기본값을 선택해
          주세요.
        </p>
      )}
      <p className="text-muted-foreground bg-muted/40 rounded-lg p-3 text-sm leading-relaxed">
        새 클래스 생성 시 채울 기본값입니다. 기존 클래스의 수업 시간·정원과 이미
        등록된 예약은 변경되지 않습니다. 실제 운영 값은 각 클래스에서 수정할 수
        있습니다.
      </p>
    </fieldset>
  );
}

export function BookingPolicyFields({
  policy,
  disabledTimes,
  busy,
}: {
  policy: BookingPolicy;
  disabledTimes: string[];
  busy: boolean;
}) {
  const [draft, setDraft] = useState({
    firstStart: policy.firstStart,
    lastStart: policy.lastStart,
    startIntervalMinutes: policy.startIntervalMinutes,
    leadMinutes: policy.leadMinutes,
  });
  // New default lengths can refresh without discarding unsaved common-time fields.
  const parsed = bookingPolicySchema.safeParse({ ...policy, ...draft });
  const current = parsed.success ? parsed.data : null;
  const slots = current ? bookingStartTimes(current) : [];
  const field = (
    key: "startIntervalMinutes" | "leadMinutes",
    label: string,
    min: number,
    max: number,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        name={key}
        type="number"
        min={min}
        max={max}
        required
        value={Number.isNaN(draft[key]) ? "" : draft[key]}
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]: e.target.value === "" ? NaN : Number(e.target.value),
          })
        }
      />
    </div>
  );
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-6">
      <legend className="sr-only">공통 예약 시간 규칙</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["firstStart", "첫 시작 시각"],
            ["lastStart", "마지막 시작 시각"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              name={key}
              type="time"
              required
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </div>
        ))}
        {field("startIntervalMinutes", "시작 시간 간격 (분)", 1, 1440)}
        {field("leadMinutes", "시작 전 접수 마감 (분)", 0, 43200)}
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        간격은 첫 시작 시각부터 다음 예약 시작 시각까지의 차이입니다. 접수 마감
        0분은 시작 직전까지 신청할 수 있습니다. 마지막 시작 시각 이후에도 수업은
        이어질 수 있습니다.
      </p>
      {current ? (
        <div
          className="bg-muted/40 space-y-2 rounded-lg border p-4"
          aria-label="시간표 미리보기"
        >
          <p className="text-sm font-medium">
            기본 수업 {formatDuration(current.defaultDurationMinutes)} · 시작
            간격 {current.startIntervalMinutes}분
          </p>
          <ul className="flex flex-wrap gap-2 text-sm tabular-nums">
            {slots.slice(0, 4).map((start) => {
              const end = clockMinutes(start) + current.defaultDurationMinutes;
              return (
                <li key={start} className="rounded border px-3 py-2">
                  {start}~{end >= 1440 ? "다음 날 " : ""}
                  {minuteClock(end % 1440)}
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-xs">
            새 클래스 기본 길이로 계산한 예시입니다. 실제 종료 시각은 선택한
            클래스의 수업 길이를 따릅니다.
          </p>
        </div>
      ) : (
        <p role="alert" className="text-destructive text-sm">
          시작 시각·간격·접수 마감의 입력값을 확인해 주세요.
        </p>
      )}
      <div className="border-t pt-6">
        <BookingTimeSettings
          disabledTimes={disabledTimes}
          busy={busy || !current}
          startTimes={slots}
        />
      </div>
    </fieldset>
  );
}
