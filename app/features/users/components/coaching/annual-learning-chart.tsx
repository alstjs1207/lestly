"use client";

import { useState } from "react";
import { BarChartIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

interface AnnualLearningChartProps {
  yearlyStats: { month: number; hours: number }[];
  programBreakdown: {
    programId: number | null;
    programTitle: string;
    hours: number;
    color: string;
  }[];
}

export function AnnualLearningChart({
  yearlyStats,
  programBreakdown,
}: AnnualLearningChartProps) {
  const [activeTab, setActiveTab] = useState<"hours" | "composition">("hours");
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // 월별 데이터를 12개월 배열로 변환
  const chartData = MONTH_NAMES.map((name, index) => {
    const stat = yearlyStats.find((s) => s.month === index + 1);
    return {
      name,
      hours: stat?.hours || 0,
      color: stat?.hours ? (index % 2 === 0 ? "#7c6cf0" : "#4ecdc4") : "#333",
    };
  });

  const maxHours = Math.max(...chartData.map((d) => d.hours), 60);
  const totalHours = programBreakdown.reduce((sum, p) => sum + p.hours, 0);

  return (
    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-[#13131f]">
      <CardHeader className="pb-3 md:pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChartIcon className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-xs font-semibold md:text-sm">연간 학습 구성</CardTitle>
          </div>
          <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-[#1a1a2e] md:gap-1 md:p-1">
            <button
              type="button"
              onClick={() => setActiveTab("hours")}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all md:px-3 md:py-1 md:text-xs ${
                activeTab === "hours"
                  ? "bg-violet-500 text-white"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              시간
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("composition")}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all md:px-3 md:py-1 md:text-xs ${
                activeTab === "composition"
                  ? "bg-violet-500 text-white"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              구성
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === "hours" ? (
          <div className="pt-1 md:pt-2">
            {/* 모바일에서는 차트 높이를 줄임 */}
            <div className="flex items-end gap-1 md:gap-1.5" style={{ height: 140 }}>
              {chartData.map((d, i) => {
                const barHeight = d.hours > 0 ? Math.max((d.hours / maxHours) * 120, 6) : 4;
                return (
                  <div
                    key={i}
                    className="relative flex flex-1 flex-col items-center justify-end"
                    style={{ height: "100%" }}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* 툴팁 */}
                    {hoveredBar === i && d.hours > 0 && (
                      <div className="absolute -top-5 z-10 rounded-md bg-violet-500 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white md:-top-6 md:px-2 md:text-[11px]">
                        {d.hours}h
                      </div>
                    )}
                    {/* 바 */}
                    <div
                      className="w-[80%] rounded-t-md transition-all duration-500 md:w-[70%]"
                      style={{
                        height: barHeight,
                        background:
                          d.hours > 0
                            ? `linear-gradient(180deg, ${d.color}, ${d.color}88)`
                            : "rgb(229 231 235)",
                        opacity: hoveredBar === i ? 1 : 0.85,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* 라벨 */}
            <div className="mt-1.5 flex gap-1 md:mt-2 md:gap-1.5">
              {chartData.map((d, i) => (
                <span
                  key={i}
                  className="flex-1 text-center text-[8px] transition-all md:text-[10px]"
                  style={{
                    color: hoveredBar === i ? "var(--text-highlight)" : "rgb(156 163 175)",
                    fontWeight: hoveredBar === i ? 600 : 400,
                  }}
                >
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {/* 프로그램별 비율 */}
            <div className="space-y-2 md:space-y-3">
              {programBreakdown.length > 0 ? (
                programBreakdown.map((program) => {
                  const pct = totalHours > 0 ? Math.round((program.hours / totalHours) * 100) : 0;
                  return (
                    <div key={program.programId ?? "null"} className="flex items-center gap-2 md:gap-3">
                      <div className="flex min-w-[80px] items-center gap-1.5 md:min-w-[120px] md:gap-2">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full md:h-2.5 md:w-2.5"
                          style={{ backgroundColor: program.color }}
                        />
                        <span className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-300 md:text-[13px]">
                          {program.programTitle}
                        </span>
                      </div>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-[#1a1a2e] md:h-2">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${program.color}, ${program.color}66)`,
                          }}
                        />
                      </div>
                      <span className="min-w-[32px] text-right font-mono text-[11px] font-semibold text-gray-500 md:min-w-[40px] md:text-[13px]">
                        {pct}%
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-[140px] items-center justify-center text-xs text-gray-500 md:h-[180px] md:text-sm">
                  학습 데이터가 없습니다
                </div>
              )}
            </div>

            {/* 인사이트 메시지 */}
            {programBreakdown.length > 0 && (
              <div className="flex items-start gap-1.5 rounded-lg bg-gray-100 p-2.5 text-xs leading-relaxed text-gray-600 dark:bg-[#1a1a2e] dark:text-gray-400 md:gap-2 md:p-3 md:text-[13px]">
                <span className="shrink-0">💬</span>
                <span>
                  꾸준히 학습하고 있어요! 다양한 프로그램을 균형있게 수강해보세요.
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
