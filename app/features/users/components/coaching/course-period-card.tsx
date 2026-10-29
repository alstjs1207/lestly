import { CalendarDays } from "lucide-react";

import { cn } from "~/core/lib/utils";
import { coursePeriodSummary } from "~/features/schedules/utils/learning-records";

export function CoursePeriodCard({
  startDate,
  endDate,
  now,
}: {
  startDate: string | null;
  endDate: string | null;
  now: Date;
}) {
  const period = coursePeriodSummary(startDate, endDate, now);
  if (!period) return null;
  const ending = period.status === "ending" || period.status === "last-day";
  const expired = period.status === "expired";
  const statusLabel = {
    upcoming: "수강 예정",
    active: "수강 중",
    ending: "종료 임박",
    "last-day": "오늘 종료",
    expired: "기간 종료",
  }[period.status];
  const accent = expired
    ? "text-slate-700 dark:text-slate-200"
    : ending
      ? "text-amber-900 dark:text-amber-200"
      : "text-violet-900 dark:text-violet-100";

  return (
    <section
      aria-label="나의 수강 기간"
      className={cn(
        "rounded-2xl border p-5 md:p-6",
        expired
          ? "border-slate-200 bg-slate-100/70 dark:border-slate-700 dark:bg-slate-800/30"
          : ending
            ? "border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30"
            : "border-violet-200 bg-violet-50 dark:border-violet-800/60 dark:bg-violet-950/30",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className={cn(
            "flex items-center gap-2 text-sm font-semibold",
            accent,
          )}
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          나의 수강 기간
        </h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            expired
              ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              : ending
                ? "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200"
                : "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200",
          )}
        >
          {statusLabel}
        </span>
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 sm:items-end sm:gap-8">
        <div className={accent}>
          {period.days !== null && period.days > 0 ? (
            <>
              <p className="text-sm">
                {period.status === "upcoming"
                  ? "수강 시작까지"
                  : "수강 종료까지"}
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-4xl font-bold tracking-tight tabular-nums">
                  {period.days}
                </span>
                <span className="text-base font-medium">일 남았어요</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold tracking-tight">
                {expired
                  ? "수강 기간이 종료되었어요"
                  : period.status === "last-day"
                    ? "오늘이 수강 마지막 날이에요"
                    : "배움을 이어가고 있어요"}
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                {expired || period.status === "last-day"
                  ? "수강 연장은 수업 운영자에게 문의해 주세요."
                  : "종료일은 수업 운영자에게 확인해 주세요."}
              </p>
            </>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {[
            { label: "수강 시작일", date: startDate },
            { label: "수강 종료일", date: endDate },
          ].map(({ label, date }) => (
            <div
              key={label}
              className="min-w-0 rounded-xl bg-white/80 px-3 py-3 sm:px-4 dark:bg-black/15"
            >
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd
                className={cn(
                  "mt-1.5 text-sm font-semibold tabular-nums md:text-base",
                  accent,
                )}
              >
                {date ? (
                  <time dateTime={date}>{date.replaceAll("-", ".")}</time>
                ) : (
                  "미등록"
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
