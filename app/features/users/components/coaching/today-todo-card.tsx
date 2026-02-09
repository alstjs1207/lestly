"use client";

import { BookOpenIcon, ChevronRightIcon, ListTodoIcon } from "lucide-react";
import { Link } from "react-router";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { useLocalStorage } from "~/core/hooks/use-local-storage";

interface Schedule {
  schedule_id: number;
  start_time: string;
  end_time: string;
  program: { program_id: number; title: string } | null;
}

interface TodayTodoCardProps {
  nextSchedule: Schedule | null;
}

const DEFAULT_CHECKLIST = [
  { id: "review", label: "이전 수업 내용 복습하기" },
  { id: "prepare", label: "오늘 수업 준비물 챙기기" },
  { id: "question", label: "궁금한 점 정리하기" },
];

export function TodayTodoCard({ nextSchedule }: TodayTodoCardProps) {
  const [checkedItems, setCheckedItems] = useLocalStorage<Record<string, boolean>>(
    "coaching-checklist",
    {}
  );

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const toggleItem = (id: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const completedCount = DEFAULT_CHECKLIST.filter(
    (item) => checkedItems[item.id]
  ).length;
  const allDone = completedCount === DEFAULT_CHECKLIST.length;

  return (
    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-[#13131f]">
      <CardHeader className="pb-2 md:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodoIcon className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-xs font-semibold md:text-sm">오늘의 할 일</CardTitle>
          </div>
          <span
            className="text-xs font-semibold md:text-sm"
            style={{ color: allDone ? "#4ecdc4" : "#7c6cf0" }}
          >
            {allDone ? "🎉 완료!" : `${completedCount}/${DEFAULT_CHECKLIST.length}`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        {/* 다음 수업 정보 */}
        {nextSchedule && (
          <Link
            to="/my-schedules"
            className="flex items-center gap-2.5 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-[#4ecdc4]/5 p-2.5 transition-all hover:border-violet-500/40 hover:shadow-sm md:gap-3 md:p-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 md:h-10 md:w-10">
              <BookOpenIcon className="h-4 w-4 text-violet-500 dark:text-violet-400 md:h-5 md:w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100 md:text-sm">
                {nextSchedule.program?.title || "수업"}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500 md:text-xs">
                {formatTime(nextSchedule.start_time)} - {formatTime(nextSchedule.end_time)}
              </div>
            </div>
            {isToday(nextSchedule.start_time) && (
              <span className="shrink-0 rounded-xl bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-500 dark:text-violet-400 md:px-2.5 md:py-1 md:text-[11px]">
                오늘
              </span>
            )}
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400" />
          </Link>
        )}

        {/* 체크리스트 */}
        <div className="space-y-1.5 md:space-y-2">
          {DEFAULT_CHECKLIST.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleItem(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg p-2 transition-all md:gap-3 md:p-2.5 ${
                checkedItems[item.id]
                  ? "bg-gray-100 opacity-60 dark:bg-[#1a1a2e]"
                  : "bg-gray-50 dark:bg-[#1e1e35]"
              }`}
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border-2 text-[10px] transition-all md:h-5 md:w-5 md:text-xs ${
                  checkedItems[item.id]
                    ? "border-violet-500 bg-violet-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              >
                {checkedItems[item.id] && <span className="text-white">✓</span>}
              </div>
              <span
                className={`text-xs md:text-[13px] ${
                  checkedItems[item.id]
                    ? "text-gray-400 line-through"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* 완료 또는 팁 메시지 */}
        {allDone ? (
          <div className="rounded-lg border border-[#4ecdc4]/30 bg-gradient-to-r from-[#4ecdc4]/10 to-violet-500/10 p-2.5 text-center text-xs font-semibold text-[#4ecdc4] md:p-3 md:text-[13px]">
            🎊 오늘의 할 일을 모두 끝냈어요! 정말 대단해요!
          </div>
        ) : (
          nextSchedule && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2 text-[11px] text-violet-500 dark:text-violet-400 md:p-2.5 md:text-xs">
              ⏰ 수업 시작 전 할 일을 완료해보세요!
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
