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

export function BookingPolicyFields({
  policy,
  disabledTimes,
  busy,
}: {
  policy: BookingPolicy;
  disabledTimes: string[];
  busy: boolean;
}) {
  const [lengths, setLengths] = useState(policy.durationMinutes.join(", "));
  const [draft, setDraft] = useState(policy);
  const tokens = lengths
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const parsed = bookingPolicySchema.safeParse({
    ...draft,
    durationMinutes: tokens.map(Number),
  });
  const current = parsed.success ? parsed.data : null;
  const slots = current ? bookingStartTimes(current) : [];
  const field = (
    key: "defaultDurationMinutes" | "startIntervalMinutes" | "leadMinutes",
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
      <legend className="mb-3 font-semibold">
        클래스 기본 시간과 공통 예약 규칙
      </legend>
      <p className="text-muted-foreground text-sm">
        수업 길이는 새 클래스 생성 시 복사하는 기본값입니다. 기존 클래스에는
        반영되지 않습니다. 시작 시각·간격·접수 마감과 휴무일·예약 기간·취소
        정책은 모든 클래스에 공통으로 적용됩니다.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="durationMinutes">새 클래스 허용 수업 길이 (분)</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            required
            value={lengths}
            onChange={(e) => setLengths(e.target.value)}
            placeholder="예: 40, 50, 90"
          />
          <p className="text-muted-foreground text-xs">
            1~1440분, 최대 24개를 쉼표로 구분해 주세요.
          </p>
        </div>
        {field(
          "defaultDurationMinutes",
          "새 클래스 기본 수업 길이 (분)",
          1,
          1440,
        )}
        {field("startIntervalMinutes", "시작 시간 간격 (분)", 1, 1440)}
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
        {field("leadMinutes", "시작 전 접수 마감 (분)", 0, 43200)}
      </div>
      <p className="text-muted-foreground text-sm">
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
            예약 가능한 시작 시각의 예시입니다. 실제 가능 여부는 정원·내 다른
            수업·수강 기간·휴무일·접수 마감을 함께 확인합니다. 기존 예약은
            설정을 바꿔도 유지됩니다.
          </p>
        </div>
      ) : (
        <p role="alert" className="text-destructive text-sm">
          수업 길이·기본값·시작 시각·간격의 입력값을 확인해 주세요.
        </p>
      )}
      <BookingTimeSettings
        disabledTimes={disabledTimes}
        busy={busy || !current}
        startTimes={slots}
      />
    </fieldset>
  );
}
