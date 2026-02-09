"use client";

import { TargetIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";

interface GoalProgressCardProps {
  thisMonthHours: number;
  goalHours?: number;
  remainingClasses?: number;
}

function DonutChart({ percentage, size = 100 }: { percentage: number; size?: number }) {
  const strokeWidth = size > 100 ? 10 : 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const center = size / 2;

  const getColor = (pct: number) => {
    if (pct < 30) return "#ff6b6b";
    if (pct < 70) return "#4ecdc4";
    return "#7c6cf0";
  };
  const color = getColor(percentage);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-gray-200 dark:stroke-gray-800"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono text-lg font-extrabold md:text-2xl"
          style={{ color }}
        >
          {percentage.toFixed(1)}%
        </span>
        <span className="mt-0.5 text-[9px] text-gray-500 md:text-[11px]">달성률</span>
      </div>
    </div>
  );
}

export function GoalProgressCard({
  thisMonthHours,
  goalHours = 0,
  remainingClasses = 0,
}: GoalProgressCardProps) {
  const progressPercent = goalHours > 0
    ? Math.min((thisMonthHours / goalHours) * 100, 100)
    : 0;

  // 현재 속도로 목표 달성 가능 여부 계산
  const today = new Date();
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();
  const daysPassed = today.getDate();
  const daysRemaining = daysInMonth - daysPassed;

  // 하루에 필요한 학습 시간
  const remainingHours = Math.max(goalHours - thisMonthHours, 0);
  const hoursPerDay = daysRemaining > 0 ? remainingHours / daysRemaining : 0;

  const expectedProgress = (daysPassed / daysInMonth) * 100;
  const isOnTrack = goalHours === 0 || progressPercent >= expectedProgress * 0.8;
  const isAchieved = goalHours > 0 && progressPercent >= 100;

  // 상태에 따른 배지
  const getStatusBadge = () => {
    if (isAchieved) {
      return { label: "달성!", className: "bg-green-500 hover:bg-green-600" };
    }
    if (isOnTrack) {
      return { label: "순조로움", className: "bg-blue-500 hover:bg-blue-600" };
    }
    return { label: "도전 중", className: "bg-orange-500 hover:bg-orange-600" };
  };

  const statusBadge = getStatusBadge();

  return (
    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-[#13131f]">
      <CardHeader className="pb-3 md:pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TargetIcon className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-sm font-semibold">
              목표 대비 학습 현황
            </CardTitle>
          </div>
          <Badge className={`text-[10px] md:text-xs ${statusBadge.className}`}>{statusBadge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-5">
        {/* 도넛 차트 + 통계 */}
        <div className="flex items-center gap-4 md:gap-6">
          {/* 모바일에서는 작은 도넛, 데스크탑에서는 큰 도넛 */}
          <div className="md:hidden">
            <DonutChart percentage={progressPercent} size={90} />
          </div>
          <div className="hidden md:block">
            <DonutChart percentage={progressPercent} size={120} />
          </div>
          <div className="grid flex-1 grid-cols-2 gap-1.5 md:gap-2">
            <div className="rounded-lg bg-gray-100 p-2 md:p-3 dark:bg-[#1a1a2e]">
              <div className="text-[9px] text-gray-500 md:text-[11px]">이번 달 목표</div>
              <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100 md:text-lg">{goalHours}시간</div>
            </div>
            <div className="rounded-lg bg-gray-100 p-2 md:p-3 dark:bg-[#1a1a2e]">
              <div className="text-[9px] text-gray-500 md:text-[11px]">현재 달성</div>
              <div className="font-mono text-sm font-bold text-[#ff6b6b] md:text-lg">
                {thisMonthHours}시간
              </div>
            </div>
            <div className="rounded-lg bg-gray-100 p-2 md:p-3 dark:bg-[#1a1a2e]">
              <div className="text-[9px] text-gray-500 md:text-[11px]">남은 수업</div>
              <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100 md:text-lg">{remainingClasses}회</div>
            </div>
            <div className="rounded-lg bg-gray-100 p-2 md:p-3 dark:bg-[#1a1a2e]">
              <div className="text-[9px] text-gray-500 md:text-[11px]">일일 필요량</div>
              <div className="font-mono text-sm font-bold text-[#4ecdc4] md:text-lg">
                ~{hoursPerDay.toFixed(1)}시간
              </div>
            </div>
          </div>
        </div>

        {/* 진행 바 */}
        <div className="space-y-1.5 md:space-y-2">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-[#1a1a2e] md:h-3">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#ff6b6b] to-[#ee5a24] transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
            {/* 목표 마커 */}
            <div className="absolute right-0 top-0 flex h-full flex-col items-center">
              <div className="h-full w-0.5 bg-violet-500" />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] md:text-xs">
            <span className="font-medium text-[#ff6b6b]">
              {thisMonthHours}h / {goalHours}h
            </span>
            {!isAchieved && hoursPerDay > 0 && (
              <span className="text-[#4ecdc4]">
                하루 {hoursPerDay.toFixed(1)}시간이면 충분해요!
              </span>
            )}
            {isAchieved && (
              <span className="font-medium text-green-500">
                목표 달성 완료!
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
