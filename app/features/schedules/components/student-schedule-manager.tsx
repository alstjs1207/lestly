import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";

import {
  DEFAULT_CANCELLATION_POLICY,
  canCancelWithPolicy,
  cancellationPolicyDescription,
  cancellationPolicySchema,
} from "../../app-settings/cancellation-policy";
import { type LearningSchedule } from "../utils/learning-records";
import { ScheduleInformation } from "./learning-schedule-detail";

export function StudentScheduleManager({
  schedule,
  onClose,
  onCancelled,
}: {
  schedule: LearningSchedule | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    setConfirm(false);
    setError("");
  }, [schedule?.schedule_id]);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.success) {
      onClose();
      onCancelled();
    } else
      setError(
        fetcher.data.error || "일정을 취소하지 못했어요. 다시 시도해주세요.",
      );
    // Callbacks intentionally follow the latest render without reprocessing a response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, fetcher.state]);
  // Keep a dialog opened across the deadline in sync with the server rule.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!schedule) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [schedule?.schedule_id]);
  const ended = !!schedule && new Date(schedule.end_time) <= now;
  const parsedPolicy = cancellationPolicySchema.safeParse(
    schedule?.cancellation_policy ?? DEFAULT_CANCELLATION_POLICY,
  );
  const canCancel =
    !!schedule &&
    parsedPolicy.success &&
    canCancelWithPolicy(new Date(schedule.start_time), parsedPolicy.data, now);
  return (
    <Dialog
      open={!!schedule}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {confirm ? "수업 예약을 취소할까요?" : "수업 상세"}
          </DialogTitle>
          <DialogDescription>
            {confirm
              ? "취소하면 예약된 일정에서 삭제돼요. 다시 예약할 때는 정원이 달라질 수 있어요."
              : ended
                ? "종료된 수업 일정이에요. 출석 여부와는 별개예요."
                : "등록된 수업의 날짜와 정보를 확인해주세요."}
          </DialogDescription>
        </DialogHeader>
        {schedule && <ScheduleInformation schedule={schedule} />}
        <p className="text-muted-foreground text-sm">
          {ended
            ? "지난 수업은 취소할 수 없어요."
            : canCancel
              ? cancellationPolicyDescription(
                  parsedPolicy.success
                    ? parsedPolicy.data
                    : DEFAULT_CANCELLATION_POLICY,
                )
              : "취소 가능 기한이 지났어요. 변경이 필요하면 학원에 문의해주세요."}
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => (confirm ? setConfirm(false) : onClose())}
          >
            {confirm ? "돌아가기" : "확인"}
          </Button>
          {canCancel && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                if (busy || !schedule) return;
                setError("");
                fetcher.submit(
                  {},
                  {
                    method: "post",
                    action: `/api/schedules/${schedule.schedule_id}/delete`,
                  },
                );
              }}
            >
              {busy ? "취소 중…" : confirm ? "예약 취소하기" : "예약 취소"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
