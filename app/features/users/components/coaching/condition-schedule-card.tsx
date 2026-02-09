"use client";

import { CalendarIcon, SmileIcon } from "lucide-react";

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

interface ConditionScheduleCardProps {
  upcomingSchedules: Schedule[];
}

const MOODS = [
  { id: 0, emoji: "😵", label: "힘들어요", color: "#ff6b6b", intensity: "가벼운 복습 추천" },
  { id: 1, emoji: "😐", label: "피곤해요", color: "#ffd93d", intensity: "복습 위주 추천" },
  { id: 2, emoji: "🙂", label: "괜찮아요", color: "#4ecdc4", intensity: "평소 학습량 추천" },
  { id: 3, emoji: "😊", label: "좋아요", color: "#7c6cf0", intensity: "도전 학습 추천" },
  { id: 4, emoji: "🔥", label: "최고!", color: "#ff9f43", intensity: "고강도 학습 추천" },
];

const MOOD_MESSAGES = [
  "많이 힘들었구나... 오늘은 10분만 가볍게 훑어보는 것도 괜찮아요. 쉬는 것도 전략이에요 💤",
  "조금 피곤한 날이네요. 오늘은 익숙한 단원 복습 위주로 부담 없이 가볼까요? 😊",
  "괜찮은 컨디션이에요! 평소 분량대로 차근차근 진행해봐요 📖",
  "좋은 컨디션이네요! 오늘은 약한 과목에 도전해보는 건 어때요? 💪",
  "최고의 컨디션! 🔥 오늘 집중력이 좋으니 어려운 문제나 새로운 내용에 도전해봐요!",
];

export function ConditionScheduleCard({
  upcomingSchedules,
}: ConditionScheduleCardProps) {
  const [selectedMood, setSelectedMood] = useLocalStorage<number | null>(
    "coaching-mood-v2",
    null
  );

  const formatDateWithDay = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = date.toLocaleDateString("ko-KR", { weekday: "short" });
    return `${month}/${day} (${dayOfWeek})`;
  };

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

  const selectedMoodData = selectedMood !== null && selectedMood >= 0 && selectedMood < MOODS.length
    ? MOODS[selectedMood]
    : null;

  return (
    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-[#13131f]">
      <CardHeader className="pb-2 md:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SmileIcon className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-xs font-semibold md:text-sm">오늘의 컨디션</CardTitle>
          </div>
          {selectedMoodData && (
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold md:px-3 md:py-1 md:text-[11px]"
              style={{
                color: selectedMoodData.color,
                background: `${selectedMoodData.color}18`,
                borderColor: `${selectedMoodData.color}33`,
              }}
            >
              {selectedMoodData.intensity}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        {/* 컨디션 선택 */}
        <div>
          <p className="mb-2 text-xs text-gray-500 md:mb-3 md:text-[13px]">오늘 컨디션은 어때요?</p>
          <div className="flex gap-1.5 md:gap-2">
            {MOODS.map((mood) => (
              <button
                key={mood.id}
                type="button"
                onClick={() => setSelectedMood(mood.id)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border-2 text-lg transition-all md:h-11 md:w-11 md:text-xl"
                style={{
                  background: selectedMood === mood.id ? `${mood.color}22` : "transparent",
                  borderColor: selectedMood === mood.id ? mood.color : "var(--border-color)",
                  transform: selectedMood === mood.id ? "scale(1.1)" : "scale(1)",
                  // @ts-ignore
                  "--border-color": "rgb(209 213 219)",
                }}
              >
                {mood.emoji}
              </button>
            ))}
          </div>
          {selectedMoodData && (
            <div
              className="mt-2 rounded-xl border-l-[3px] bg-gray-100 p-2.5 text-xs leading-relaxed text-gray-600 dark:bg-[#1a1a2e] dark:text-gray-300 md:mt-3 md:p-3 md:text-[13px]"
              style={{ borderLeftColor: selectedMoodData.color }}
            >
              {MOOD_MESSAGES[selectedMood!]}
            </div>
          )}
        </div>

        {/* 일정 목록 */}
        {upcomingSchedules.length > 0 && (
          <div className="space-y-1.5 border-t border-gray-200 pt-3 dark:border-gray-800 md:space-y-2 md:pt-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-3.5 w-3.5 text-gray-400 md:h-4 md:w-4" />
              <span className="text-xs text-gray-500 md:text-[13px]">다가오는 수업</span>
            </div>
            <div className="space-y-1.5 md:space-y-2">
              {upcomingSchedules.slice(0, 5).map((schedule) => (
                <div
                  key={schedule.schedule_id}
                  className="rounded-lg bg-gray-100 py-2 pl-3 pr-2.5 dark:bg-[#1a1a2e] md:py-2.5 md:pl-4 md:pr-3"
                  style={{
                    borderLeft: isToday(schedule.start_time)
                      ? "3px solid #7c6cf0"
                      : "3px solid #e5e7eb",
                  }}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100 md:gap-2 md:text-[13px]">
                    {formatDateWithDay(schedule.start_time)}
                    {isToday(schedule.start_time) && (
                      <span className="rounded-lg bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-violet-500 dark:text-violet-400 md:px-2 md:text-[10px]">
                        TODAY
                      </span>
                    )}
                  </div>
                  {schedule.program?.title && (
                    <div className="mt-0.5 truncate text-[11px] font-medium text-violet-600 dark:text-violet-400 md:text-[12px]">
                      {schedule.program.title}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-gray-500 md:text-[12px]">
                    {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
