import { BrainIcon, CalendarIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";

interface HeaderSectionProps {
  daysRemaining: number | null;
}

export function HeaderSection({ daysRemaining }: HeaderSectionProps) {
  const today = new Date();
  const formattedDate = today.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const formattedDateFull = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800 md:pb-4">
      <div className="flex items-center gap-2 md:gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-[#4ecdc4]/10 md:h-12 md:w-12">
          <BrainIcon className="h-5 w-5 text-violet-500 dark:text-violet-400 md:h-6 md:w-6" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-lg">AI 코칭 대시보드</h1>
          <p className="text-[10px] font-medium tracking-wide text-violet-500 dark:text-violet-400 md:text-xs">
            학습 현황을 한눈에
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        {/* 모바일에서는 짧은 날짜, 데스크탑에서는 긴 날짜 */}
        <div className="hidden items-center gap-2 rounded-full bg-gray-100 px-4 py-1.5 text-[13px] text-gray-600 dark:bg-[#1a1a2e] dark:text-gray-400 md:flex">
          <CalendarIcon className="h-3.5 w-3.5" />
          {formattedDateFull}
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 dark:bg-[#1a1a2e] dark:text-gray-400 md:hidden">
          <CalendarIcon className="h-3 w-3" />
          {formattedDate}
        </div>
        {daysRemaining !== null && (
          <Badge
            className={`px-2 py-0.5 font-mono text-xs font-bold md:px-3 md:py-1 md:text-sm ${
              daysRemaining <= 7
                ? "bg-gradient-to-r from-[#ff6b6b] to-[#ee5a24]"
                : "bg-gradient-to-r from-violet-500 to-purple-500"
            }`}
          >
            D-{daysRemaining > 0 ? daysRemaining : "Day"}
          </Badge>
        )}
      </div>
    </div>
  );
}
