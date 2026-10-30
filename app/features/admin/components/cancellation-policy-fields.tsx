import { useState } from "react";

import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  type CancellationPolicy,
  DEFAULT_CANCELLATION_POLICY,
} from "~/features/app-settings/cancellation-policy";

export function CancellationPolicyFields({
  policy = DEFAULT_CANCELLATION_POLICY,
  busy,
}: {
  policy?: CancellationPolicy;
  busy: boolean;
}) {
  const [mode, setMode] = useState(policy.mode);
  const [hours, setHours] = useState(
    policy.mode === "hours_before" ? String(policy.hours) : "24",
  );
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <legend className="sr-only">수강생 예약 취소 기한</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            {
              value: "previous_day",
              label: "수업 전날까지",
              description: "한국 시간으로 전날 23:59까지 취소할 수 있습니다.",
            },
            {
              value: "hours_before",
              label: "시작 N시간 전까지",
              description:
                "수업 시작 시각에서 정한 시간만큼 앞선 시각이 마감입니다.",
            },
          ] as const
        ).map((option) => (
          <label
            key={option.value}
            className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-lg border p-4"
          >
            <input
              type="radio"
              name="cancellationMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
              required
              className="mt-1"
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
      {mode === "hours_before" && (
        <div className="space-y-2">
          <Label htmlFor="cancellationHours">
            시작 몇 시간 전까지 취소할 수 있나요?
          </Label>
          <Input
            id="cancellationHours"
            name="cancellationHours"
            type="number"
            min="0"
            max="720"
            required
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-muted-foreground text-xs">
            0~720시간. 0시간은 수업 시작 전까지입니다. 월요일 18시 수업을 24시간
            전까지로 설정하면 일요일 18시에 마감됩니다.
          </p>
        </div>
      )}
      <p className="text-muted-foreground text-xs leading-relaxed">
        저장 후 새로 등록하는 예약부터 적용합니다. 관리자 등록 예약에도
        적용하며, 기존 예약의 취소 규칙은 유지합니다. 취소 기한이 지난 뒤 신청할
        때는 확정 전에 안내합니다.
      </p>
    </fieldset>
  );
}
