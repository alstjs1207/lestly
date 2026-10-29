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
  type LearningSchedule,
  formatLearningDate,
  formatLearningMinutes,
  learningLocation,
  scheduleHours,
  scheduleTimeRange,
} from "../utils/learning-records";

export function ScheduleInformation({
  schedule,
}: {
  schedule: LearningSchedule;
}) {
  const location = learningLocation(schedule.program);
  const address = location.mapAddress;
  return (
    <div className="space-y-4 text-sm">
      <h3 className="text-base font-semibold">
        {schedule.program?.title || "내 수업"}
      </h3>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-3">
        <dt className="text-muted-foreground">날짜</dt>
        <dd>{formatLearningDate(schedule.start_time, true)}</dd>
        <dt className="text-muted-foreground">시간</dt>
        <dd>
          {scheduleTimeRange(schedule)}
          <span className="text-muted-foreground mt-1 block">
            총 {formatLearningMinutes(scheduleHours(schedule) * 60)}
          </span>
        </dd>
        <dt className="text-muted-foreground">담당 강사</dt>
        <dd>
          {schedule.program?.instructor?.name || "수업 운영자에게 확인해주세요"}
        </dd>
        <dt className="text-muted-foreground">
          {location.online ? "접속 안내" : "장소"}
        </dt>
        <dd className="break-words">
          {location.label}
          {address && (
            <a
              className="mt-1 block text-violet-700 underline dark:text-violet-300"
              href={`https://map.naver.com/p/search/${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
            >
              지도에서 위치 보기<span className="sr-only"> (새 창)</span>
            </a>
          )}
        </dd>
      </dl>
      <div className="text-muted-foreground rounded-xl bg-violet-50 p-3 leading-relaxed dark:bg-violet-950/30">
        준비물·장소·예약 변경 문의는 담당 강사에게 평소 이용하는 연락 방법으로
        문의해주세요.
      </div>
    </div>
  );
}

export function LearningScheduleDetail({
  schedule,
  onClose,
}: {
  schedule: LearningSchedule | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!schedule}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>수업 기록 상세</DialogTitle>
          <DialogDescription>
            출석으로 확인된 수업 기록이에요.
          </DialogDescription>
        </DialogHeader>
        {schedule && <ScheduleInformation schedule={schedule} />}
        <DialogFooter>
          <Button onClick={onClose}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
