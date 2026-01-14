import { UsersIcon, CalendarIcon, ChevronRightIcon } from "lucide-react";

interface ClassFooterProps {
  maxCapacity?: number | null;
  nextSchedule?: {
    schedule_id: number;
    start_time: string;
    end_time: string;
  } | null;
}

export default function ClassFooter({
  maxCapacity,
  nextSchedule,
}: ClassFooterProps) {
  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const weekday = weekdays[date.getDay()];
    const hours = date.getHours();
    const ampm = hours >= 12 ? "오후" : "오전";
    const hour12 = hours % 12 || 12;

    return `${month}월 ${day}일 (${weekday}) ${ampm} ${hour12}시`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#5a4a3f] text-white z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* 왼쪽: 정원 */}
          <div className="flex items-center gap-6">
            {maxCapacity && (
              <div className="flex items-center gap-2">
                <UsersIcon className="w-4 h-4" />
                <span className="text-sm">
                  모집 정원 <span className="font-bold">{maxCapacity}석</span>
                </span>
              </div>
            )}
          </div>

          {/* 구분선 */}
          <div className="h-8 w-px bg-white/30" />

          {/* 오른쪽: 다음 일정 */}
          <div className="flex items-center gap-4">
            {nextSchedule ? (
              <>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  <span className="text-sm">
                    다음 일정:{" "}
                    <span className="font-bold">
                      {formatDate(nextSchedule.start_time)}
                    </span>
                  </span>
                </div>
                <ChevronRightIcon className="w-5 h-5" />
              </>
            ) : (
              <span className="text-sm text-white/70">일정 준비 중</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
