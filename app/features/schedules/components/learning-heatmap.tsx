import { useState } from "react";

import { formatLearningDate, learningHeatmap } from "../utils/learning-records";

export function LearningHeatmap({
  days,
}: {
  days: ReturnType<typeof learningHeatmap>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const colors = [
    "bg-violet-100/60 dark:bg-violet-950/50",
    "bg-violet-300 dark:bg-violet-700",
    "bg-violet-500 dark:bg-violet-500",
    "bg-violet-700 dark:bg-violet-300",
  ];
  const level = (hours: number) =>
    hours >= 9 ? 3 : hours >= 6 ? 2 : hours > 0 ? 1 : 0;
  const current = days.find((d) => d.date === selected);
  return (
    <section
      className="rounded-2xl border border-violet-100 bg-white p-5 md:p-6 dark:border-violet-900/40 dark:bg-[#191723]"
      aria-label="배움의 발자국"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-semibold">배움의 발자국</h2>
        <span className="text-muted-foreground text-sm">최근 12주</span>
      </div>
      <div
        className="grid grid-cols-[16px_repeat(12,minmax(0,1fr))] gap-1"
        role="group"
        aria-label="날짜별 종료된 수업 시간"
      >
        <span aria-hidden="true" />
        {Array.from({ length: 12 }, (_, week) => (
          <span
            key={week}
            className="text-muted-foreground min-w-0 pb-1 text-xs whitespace-nowrap"
          >
            {week === 0 ||
            days[week * 7].date.slice(0, 7) !==
              days[(week - 1) * 7].date.slice(0, 7)
              ? `${Number(days[week * 7].date.slice(5, 7))}월`
              : ""}
          </span>
        ))}
        {Array.from({ length: 7 }, (_, weekday) => (
          <div key={weekday} className="contents">
            <span className="text-muted-foreground flex items-center text-xs">
              {weekday % 2 === 0
                ? ["월", "화", "수", "목", "금", "토", "일"][weekday]
                : ""}
            </span>
            {Array.from({ length: 12 }, (_, week) => {
              const day = days[week * 7 + weekday];
              const label = `${formatLearningDate(`${day.date}T00:00:00+09:00`, true)} · ${day.future ? "아직 오지 않은 날" : `수업 ${day.hours}시간`}`;
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={day.future}
                  title={label}
                  aria-label={label}
                  aria-pressed={selected === day.date}
                  onClick={() => setSelected(day.date)}
                  className={`aspect-square max-h-7 min-h-3 w-full rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 md:aspect-auto md:h-5 ${colors[level(day.hours)]} ${day.future ? "opacity-30" : "hover:ring-2 hover:ring-violet-400"} ${selected === day.date ? "ring-2 ring-violet-600" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>하루 수업 시간</span>
        <div className="flex flex-wrap gap-2">
          {["없음", "6시간 미만", "6~9시간", "9시간+"].map((label, index) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`size-2.5 rounded-sm ${colors[index]}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <p
        className="text-muted-foreground mt-4 text-sm leading-relaxed"
        role="status"
      >
        {current
          ? `${current.date} · 종료된 수업 ${current.hours}시간`
          : "수업이 있던 날을 표시해요. 쉬는 날도 자연스러운 배움의 일부예요."}
      </p>
    </section>
  );
}
