import { CheckCircleIcon, ClockIcon, FlameIcon, TrophyIcon } from "lucide-react";

interface AchievementStripProps {
  streak: number;
  totalHours: number;
  completedTodos: number;
  totalTodos: number;
}

export function AchievementStrip({
  streak,
  totalHours,
  completedTodos,
  totalTodos,
}: AchievementStripProps) {
  const badges = totalHours >= 50 ? 3 : totalHours >= 20 ? 2 : totalHours >= 10 ? 1 : 0;

  return (
    <div className="flex items-center justify-around rounded-2xl border border-violet-500/10 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 px-6 py-4 dark:from-[#13131f] dark:via-[#1a1530] dark:to-[#13131f]">
      <div className="flex items-center gap-3">
        <FlameIcon className="h-6 w-6 text-orange-500" />
        <div>
          <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{streak}일 연속</div>
          <div className="text-[11px] text-gray-500">학습 스트릭</div>
        </div>
      </div>

      <div className="h-9 w-px bg-gray-300 dark:bg-gray-800" />

      <div className="flex items-center gap-3">
        <TrophyIcon className="h-6 w-6 text-yellow-500" />
        <div>
          <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">배지 {badges}개</div>
          <div className="text-[11px] text-gray-500">이번 달 획득</div>
        </div>
      </div>

      <div className="h-9 w-px bg-gray-300 dark:bg-gray-800" />

      <div className="flex items-center gap-3">
        <ClockIcon className="h-6 w-6 text-blue-500" />
        <div>
          <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{Math.floor(totalHours)}시간</div>
          <div className="text-[11px] text-gray-500">누적 수강</div>
        </div>
      </div>

      <div className="h-9 w-px bg-gray-300 dark:bg-gray-800" />

      <div className="flex items-center gap-3">
        <CheckCircleIcon className="h-6 w-6 text-emerald-500" />
        <div>
          <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
            {completedTodos}/{totalTodos} 완료
          </div>
          <div className="text-[11px] text-gray-500">오늘의 할 일</div>
        </div>
      </div>
    </div>
  );
}
