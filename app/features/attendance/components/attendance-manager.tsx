import type { Route } from "../screens/+types/attendance";
import type { action } from "../screens/attendance";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  HistoryIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  useBlocker,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { toKSTDateString } from "~/features/schedules/utils/kst";
import {
  formatLearningDate,
  formatLearningTime,
  scheduleHours,
  scheduleTimeRange,
} from "~/features/schedules/utils/learning-records";

import { type AttendanceStatus, attendanceLabels } from "../lib/attendance";

type Lesson = Route.ComponentProps["loaderData"]["schedules"][number];

export default function AttendanceManager({
  loaderData,
}: Route.ComponentProps) {
  const key = `${loaderData.date}:${loaderData.pendingOnly}:${loaderData.page}`;
  return <AttendanceEditor key={key} {...loaderData} />;
}

function AttendanceEditor({
  schedules,
  date,
  pendingOnly,
  page,
  totalCount,
  now,
}: Route.ComponentProps["loaderData"]) {
  const fetcher = useFetcher<typeof action>();
  const historyFetcher = useFetcher<{
    events: {
      event_id: number;
      version: number;
      previous_status: string;
      status: string;
      actor_name: string;
      recorded_at: string;
    }[];
    error?: string;
  }>();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<
    Record<number, { status: AttendanceStatus; version: number }>
  >({});
  const [confirm, setConfirm] = useState(false);
  const [historyLesson, setHistoryLesson] = useState<Lesson | null>(null);
  const busy = fetcher.state !== "idle";
  const status = (s: Lesson) =>
    draft[s.schedule_id]?.status ?? (s.attendance_status as AttendanceStatus);
  const changes = schedules.filter(
    (s) =>
      draft[s.schedule_id] !== undefined &&
      draft[s.schedule_id]?.status !== s.attendance_status,
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      changes.length > 0 &&
      !busy &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (!changes.length) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [changes.length]);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setDraft({});
      setConfirm(false);
      toast.success("출결을 저장했습니다.");
    }
  }, [fetcher.state, fetcher.data]);
  const started = (s: Lesson) =>
    Date.parse(s.start_time) <= Math.max(Date.parse(now), Date.now());
  const pending = schedules.filter(
    (s) => status(s) === "PENDING" && started(s),
  );
  const counts = { PENDING: 0, PRESENT: 0, ABSENT: 0 };
  schedules.forEach((s) => counts[status(s)]++);
  const setStatus = (s: Lesson, value: AttendanceStatus) =>
    setDraft((current) => ({
      ...current,
      [s.schedule_id]: {
        status: value,
        version: current[s.schedule_id]?.version ?? s.attendance_version,
      },
    }));
  function changeParams(values: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([k, v]) =>
      v === null ? next.delete(k) : next.set(k, v),
    );
    setParams(next);
  }
  const moveDate = (offset: number) =>
    changeParams({
      date: toKSTDateString(
        new Date(Date.parse(`${date}T00:00:00+09:00`) + offset * 86400000),
      ),
      page: null,
      view: null,
    });
  const groups = new Map<string, Lesson[]>();
  schedules.forEach((s) => {
    const group = `${toKSTDateString(new Date(s.start_time))} ${formatLearningTime(s.start_time)}`;
    groups.set(group, [...(groups.get(group) ?? []), s]);
  });
  const summary = changes.reduce(
    (acc, s) => ({ ...acc, [status(s)]: acc[status(s)] + 1 }),
    { PENDING: 0, PRESENT: 0, ABSENT: 0 },
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / 50));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
          <ClipboardCheckIcon className="text-primary size-6" />
          출결 관리
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          지난 수업도 출결을 입력할 수 있습니다. 결석자는 해당 예약만 취소하며
          기록은 남습니다.
        </p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Label htmlFor="attendance-date">수업 날짜</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="이전 날짜"
              disabled={busy || date <= "2000-01-01"}
              onClick={() => moveDate(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Input
              id="attendance-date"
              type="date"
              className="h-11 w-40"
              value={date}
              min="2000-01-01"
              max="2100-12-31"
              disabled={busy}
              onChange={(e) => {
                if (e.target.value)
                  changeParams({
                    date: e.target.value,
                    page: null,
                    view: null,
                  });
              }}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="다음 날짜"
              disabled={busy || date >= "2100-12-31"}
              onClick={() => moveDate(1)}
            >
              <ChevronRightIcon />
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={() =>
                changeParams({
                  date: toKSTDateString(new Date()),
                  view: null,
                  page: null,
                })
              }
            >
              오늘
            </Button>
          </div>
        </div>
        <Button
          variant={pendingOnly ? "default" : "outline"}
          className="min-h-11"
          aria-pressed={pendingOnly}
          disabled={busy}
          onClick={() =>
            changeParams({ view: pendingOnly ? null : "pending", page: null })
          }
        >
          지난 미확인 모아보기
        </Button>
      </div>
      <div className="space-y-2 border-y py-3">
        <div
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
          aria-live="polite"
        >
          <span>
            {pendingOnly ? "미확인 예약" : "예약"} 총{" "}
            <strong>{totalCount}건</strong>
          </span>
          <span>출석 {counts.PRESENT}</span>
          <span>결석 {counts.ABSENT}</span>
          <span>미확인 {counts.PENDING}</span>
        </div>
        <p className="text-muted-foreground text-xs">
          {pendingOnly
            ? "시작된 수업 중 미확인 예약을 오래된 순으로 표시합니다. "
            : ""}
          {totalCount > 50
            ? "출결 상태와 일괄 처리는 현재 페이지 최대 50건 기준입니다. "
            : ""}
          출석으로 확인하고 종료된 수업만 참여 횟수·학습 시간에 반영됩니다.
        </p>
      </div>
      {schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center">
          <p>
            {pendingOnly
              ? "미확인 수업이 없습니다."
              : "이 날짜에 등록된 예약이 없습니다."}
          </p>
          {page > 1 && (
            <Button variant="link" onClick={() => changeParams({ page: "1" })}>
              첫 페이지로 이동
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {[...groups].map(([group, lessons]) => (
            <section
              key={group}
              aria-label={`${group} 출결`}
              className="space-y-2"
            >
              <h2 className="text-sm font-semibold">
                {formatLearningDate(lessons[0].start_time, true)} ·{" "}
                {formatLearningTime(lessons[0].start_time)}{" "}
                <span className="text-muted-foreground font-normal">
                  {lessons.length}건
                </span>
              </h2>
              <div className="bg-card divide-y rounded-xl border">
                {lessons.map((s) => {
                  const current = status(s),
                    editable = started(s),
                    changed =
                      draft[s.schedule_id] !== undefined &&
                      current !== s.attendance_status;
                  return (
                    <div
                      key={s.schedule_id}
                      className={`space-y-3 p-4 ${current === "ABSENT" ? "bg-destructive/5" : ""}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/admin/students/${s.student_id}`}
                            className="font-semibold hover:underline"
                          >
                            {s.student?.name ?? "수강생"}
                          </Link>
                          <p className="text-muted-foreground mt-0.5 text-xs break-words">
                            {s.program?.title ?? "클래스 미지정"}
                            {s.program?.instructor?.name
                              ? ` · ${s.program.instructor.name}`
                              : ""}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {scheduleTimeRange(s)} · {scheduleHours(s)}시간
                          </p>
                        </div>
                        <Badge
                          variant={
                            current === "ABSENT"
                              ? "destructive"
                              : current === "PRESENT"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {current === "ABSENT" && changed
                            ? "결석 · 취소 예정"
                            : attendanceLabels[current]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div
                          role="group"
                          aria-label={`${s.student?.name ?? "수강생"} ${s.schedule_id} 출결`}
                          className="flex flex-wrap gap-1.5"
                        >
                          {(["PRESENT", "ABSENT", "PENDING"] as const).map(
                            (value) => (
                              <Button
                                key={value}
                                type="button"
                                size="sm"
                                className="min-h-11"
                                variant={
                                  current === value
                                    ? value === "ABSENT"
                                      ? "destructive"
                                      : "default"
                                    : "outline"
                                }
                                aria-pressed={current === value}
                                disabled={busy || !editable}
                                onClick={() => setStatus(s, value)}
                              >
                                {value === "ABSENT"
                                  ? "결석"
                                  : attendanceLabels[value]}
                              </Button>
                            ),
                          )}
                        </div>
                        {s.attendance_updated_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => {
                              setHistoryLesson(s);
                              historyFetcher.load(
                                `/api/admin/attendance/${s.schedule_id}/history`,
                              );
                            }}
                          >
                            <HistoryIcon className="mr-1 size-4" />
                            이력
                          </Button>
                        )}
                      </div>
                      {!editable && (
                        <p className="text-muted-foreground text-xs">
                          수업 시작 후 체크할 수 있습니다.
                        </p>
                      )}
                      {s.attendance_updated_at && (
                        <p className="text-muted-foreground text-xs">
                          최근 처리{" "}
                          {new Date(s.attendance_updated_at).toLocaleString(
                            "ko-KR",
                            { timeZone: "Asia/Seoul" },
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            disabled={busy || page <= 1}
            onClick={() => changeParams({ page: String(page - 1) })}
          >
            이전
          </Button>
          <span className="text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={busy || page >= totalPages}
            onClick={() => changeParams({ page: String(page + 1) })}
          >
            다음
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={busy || pending.length === 0}
          onClick={() =>
            setDraft((current) => ({
              ...current,
              ...Object.fromEntries(
                pending.map((s) => [
                  s.schedule_id,
                  {
                    status: "PRESENT",
                    version:
                      current[s.schedule_id]?.version ?? s.attendance_version,
                  },
                ]),
              ),
            }))
          }
        >
          미확인 {pending.length}건 모두 출석
        </Button>
        <p className="text-muted-foreground text-xs">
          미확인은 자동 결석 처리되지 않습니다.
        </p>
      </div>
      {fetcher.data && !fetcher.data.success && (
        <div
          className="text-destructive border-destructive/30 rounded-lg border p-3"
          role="alert"
        >
          <p className="text-sm">{fetcher.data.error}</p>
          <Button
            variant="outline"
            className="mt-2 min-h-11"
            disabled={busy || revalidator.state !== "idle"}
            onClick={() => {
              setDraft({});
              setConfirm(false);
              revalidator.revalidate();
            }}
          >
            최신 명단 불러오기
          </Button>
        </div>
      )}
      <div className="bg-background sticky bottom-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm md:bottom-3">
        <div>
          <p className="text-sm font-medium">
            {changes.length
              ? `${changes.length}건 변경 · 출석 ${summary.PRESENT} · 결석 취소 ${summary.ABSENT} · 미확인 ${summary.PENDING}`
              : "출결을 체크해 주세요"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            다른 날짜의 반복 예약은 유지됩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {changes.length > 0 && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setDraft({})}
            >
              변경 취소
            </Button>
          )}
          <Button
            className="min-h-11"
            disabled={busy || changes.length === 0}
            onClick={() => setConfirm(true)}
          >
            {busy ? "저장 중…" : "저장 내용 확인"}
          </Button>
        </div>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>출결과 예약 취소를 저장할까요?</DialogTitle>
            <DialogDescription>
              결석자의 해당 예약만 취소합니다. 과거 예약 정보와 변경 이력은
              보존됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {changes.map((s) => (
              <div
                key={s.schedule_id}
                className="flex flex-wrap justify-between gap-2 border-b py-2"
              >
                <span>
                  {s.student?.name ?? "수강생"} ·{" "}
                  {formatLearningDate(s.start_time)}{" "}
                  {formatLearningTime(s.start_time)}
                </span>
                <span>{attendanceLabels[status(s)]}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            변경하지 않은 예약은 그대로 유지됩니다. 결석을 출석·미확인으로
            정정하면 해당 예약이 복구됩니다.
          </p>
          {fetcher.data && !fetcher.data.success && (
            <p className="text-destructive text-sm" role="alert">
              {fetcher.data.error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              다시 확인
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                fetcher.submit(
                  changes.map((s) => ({
                    schedule_id: s.schedule_id,
                    version: draft[s.schedule_id].version,
                    status: status(s),
                  })),
                  { method: "post", encType: "application/json" },
                )
              }
            >
              {busy ? "저장 중…" : "확인 후 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!historyLesson}
        onOpenChange={(open) => {
          if (!open) setHistoryLesson(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>출결 변경 이력</DialogTitle>
            <DialogDescription>
              {historyLesson?.student?.name} ·{" "}
              {historyLesson &&
                formatLearningDate(historyLesson.start_time, true)}{" "}
              수업
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto text-sm">
            {historyFetcher.state !== "idle" ? (
              <p role="status">이력을 불러오는 중…</p>
            ) : historyFetcher.data?.error ? (
              <p role="alert">{historyFetcher.data.error}</p>
            ) : historyFetcher.data?.events.length ? (
              historyFetcher.data.events.map((event) => (
                <div key={event.event_id} className="space-y-1 border-b pb-3">
                  <p>
                    {
                      attendanceLabels[
                        event.previous_status as AttendanceStatus
                      ]
                    }{" "}
                    → {attendanceLabels[event.status as AttendanceStatus]}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {event.actor_name || "관리자"} ·{" "}
                    {new Date(event.recorded_at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </p>
                </div>
              ))
            ) : (
              <p>기록된 변경 이력이 없습니다.</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setHistoryLesson(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>저장하지 않은 출결이 있습니다</DialogTitle>
            <DialogDescription>
              이동하면 현재 체크한 변경 사항이 사라집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => blocker.state === "blocked" && blocker.reset()}
            >
              계속 체크
            </Button>
            <Button
              onClick={() => blocker.state === "blocked" && blocker.proceed()}
            >
              변경 취소 후 이동
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
