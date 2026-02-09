import { CloverIcon } from "lucide-react";

import { Card, CardContent } from "~/core/components/ui/card";

interface AIInsightBannerProps {
  thisMonthHours: number;
  lastMonthHours: number;
  thisMonthCount: number;
  goalHours?: number;
  totalHours?: number;
}

export function AIInsightBanner({
  thisMonthHours,
  lastMonthHours,
  thisMonthCount,
  goalHours = 0,
  totalHours,
}: AIInsightBannerProps) {
  const remainingHours = Math.max(goalHours - thisMonthHours, 0);

  // 현재 날짜 정보
  const today = new Date();
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  const daysPassed = today.getDate();
  const daysRemaining = daysInMonth - daysPassed;

  // 하루에 필요한 학습 시간 계산
  const hoursPerDay = daysRemaining > 0 ? remainingHours / daysRemaining : 0;
  const hoursPerDayDisplay = hoursPerDay.toFixed(1);

  // 진행 상태 판단
  const expectedProgress = (daysPassed / daysInMonth) * goalHours;
  const isOnTrack = goalHours === 0 || thisMonthHours >= expectedProgress * 0.8;
  const isAchieved = goalHours > 0 && thisMonthHours >= goalHours;

  const getMainMessage = () => {
    if (goalHours === 0) {
      return "이번 달 수업이 아직 없어요. 새로운 수업을 등록해보세요!";
    }
    if (isAchieved) {
      return (
        <>
          축하해요! 이번 달 목표를 달성했어요.{" "}
          <span className="font-bold text-[#4ecdc4]">{thisMonthHours}시간</span>
          을 완주했습니다!
        </>
      );
    }
    if (daysPassed <= 7) {
      return (
        <>
          이번 달은 아직 시작 단계예요. 지금까지{" "}
          <span className="font-bold text-[#4ecdc4]">{thisMonthHours}시간</span>
          을 완주했고, 목표까지{" "}
          <span className="font-bold text-[#4ecdc4]">{remainingHours}시간</span>
          이 남아있어요.
        </>
      );
    }
    if (isOnTrack) {
      return (
        <>
          잘 하고 있어요! 현재{" "}
          <span className="font-bold text-[#4ecdc4]">{thisMonthHours}시간</span>
          을 달성했고, 목표까지{" "}
          <span className="font-bold text-[#4ecdc4]">{remainingHours}시간</span>
          이 남았어요.
        </>
      );
    }
    return (
      <>
        이번 달은 아직 시작 단계예요. 지금까지{" "}
        <span className="font-bold text-[#4ecdc4]">{thisMonthHours}시간</span>을
        완주했고, 목표까지{" "}
        <span className="font-bold text-[#4ecdc4]">{remainingHours}시간</span>이
        남아있어요.
      </>
    );
  };

  const getEncouragementMessage = () => {
    if (goalHours === 0 || isAchieved) {
      return null;
    }
    if (isOnTrack) {
      return (
        <>
          🍀 훌륭해요! 이 페이스를 유지하면 목표를 달성할 수 있어요. 함께
          해봐요!
        </>
      );
    }
    return (
      <>
        🍀 괜찮아요!{" "}
        <span className="font-bold text-[#4ecdc4]">
          하루 {hoursPerDayDisplay}시간씩
        </span>{" "}
        꾸준히 하면 충분히 따라잡을 수 있어요. 함께 해봐요!
      </>
    );
  };

  const encouragement = getEncouragementMessage();

  return (
    <Card className="border-[#4ecdc4]/30 bg-gradient-to-r from-[#4ecdc4]/10 to-[#2d9a8c]/5 dark:border-[#4ecdc4]/20 dark:from-[#4ecdc4]/15 dark:to-[#2d9a8c]/10">
      <CardContent className="flex items-start gap-3 py-4 md:gap-4 md:py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4ecdc4]/20 to-[#2d9a8c]/10 md:h-12 md:w-12 dark:from-[#4ecdc4]/30 dark:to-[#2d9a8c]/20">
          <CloverIcon className="h-5 w-5 text-[#4ecdc4] md:h-6 md:w-6" />
        </div>
        <div className="min-w-0 flex-1 space-y-1 md:space-y-2">
          <div className="text-xs font-semibold text-[#4ecdc4] md:text-sm">
            AI 코치 인사이트
          </div>
          <p className="text-xs leading-relaxed text-gray-700 md:text-sm dark:text-gray-300">
            {getMainMessage()}
          </p>
          {encouragement && (
            <p className="text-xs leading-relaxed text-gray-500 md:text-sm dark:text-gray-400">
              {encouragement}
            </p>
          )}
          {totalHours !== undefined && totalHours > 0 && (
            <p className="mt-1 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
              지금까지{" "}
              <span className="font-semibold text-amber-500">{totalHours}시간</span>
              을 함께 걸어왔어요.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
