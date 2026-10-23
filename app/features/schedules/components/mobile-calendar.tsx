import { addMonths, format, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  ListIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";

import { MobileDayEvents } from "./mobile-day-events";
import { MobileMonthGrid } from "./mobile-month-grid";

interface CalendarEvent {
  id: string;
  title: string;
  start: string | Date;
  end: string | Date;
  extendedProps?: {
    scheduleId: number;
    programTitle: string | null;
  };
}

interface SelectedEvent {
  scheduleId: number;
  title: string;
  start: Date;
  end: Date;
  programTitle: string | null;
}

interface MobileCalendarProps {
  events: CalendarEvent[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onEventClick: (event: SelectedEvent) => void;
  onAddClick: (date: Date) => void;
  displayedMonth?: Date;
  onMonthChange?: (date: Date) => void;
  bookingDisabledReason?: string | null;
  allowedStartDate: string;
  allowedEndDate: string;
}

export function MobileCalendar({
  events,
  displayedMonth: controlledMonth,
  onMonthChange,
  bookingDisabledReason,
  selectedDate,
  onDateSelect,
  onEventClick,
  onAddClick,
  allowedStartDate,
  allowedEndDate,
}: MobileCalendarProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [internalMonth, setInternalMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const displayedMonth = controlledMonth ?? internalMonth;
  const setDisplayedMonth = (date: Date) => {
    setInternalMonth(date);
    onMonthChange?.(date);
  };

  const navigateMonth = (direction: -1 | 1) => {
    const next =
      direction === -1
        ? subMonths(displayedMonth, 1)
        : addMonths(displayedMonth, 1);
    setDisplayedMonth(next);
  };

  const handleDateSelect = (date: Date) => {
    onDateSelect(date);
    // If tapped date is in a different month, switch displayed month
    if (
      !controlledMonth &&
      (date.getMonth() !== displayedMonth.getMonth() ||
        date.getFullYear() !== displayedMonth.getFullYear())
    ) {
      setDisplayedMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col"
      onClick={() => setShowInfo(false)}
    >
      {/* Header */}
      <div className="bg-background/95 sticky top-0 z-10 border-b pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full"
              aria-label="이전 달"
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <h2 className="min-w-[120px] text-center text-base font-bold tracking-tight">
              {format(displayedMonth, "yyyy년 M월", { locale: ko })}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full"
              aria-label="다음 달"
              onClick={() => navigateMonth(1)}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11" asChild>
            <Link
              to={`/my-schedules/list?year=${displayedMonth.getFullYear()}&month=${displayedMonth.getMonth() + 1}`}
              aria-label="일정 목록 보기"
            >
              <ListIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Month grid */}
        <MobileMonthGrid
          events={events}
          selectedDate={selectedDate}
          displayedMonth={displayedMonth}
          onDateSelect={handleDateSelect}
          onMonthChange={navigateMonth}
          disableDateRestrictions
        />
      </div>

      {/* Selected date header */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-foreground text-sm font-semibold">
          {format(selectedDate, "M월 d일 EEEE", { locale: ko })}
        </h3>
      </div>

      {bookingDisabledReason && (
        <p className="text-muted-foreground px-4 pb-3 text-sm leading-relaxed">
          {bookingDisabledReason}
        </p>
      )}

      {/* Day events */}
      <div className="flex-1">
        <MobileDayEvents
          events={events}
          selectedDate={selectedDate}
          onEventClick={onEventClick}
          bookingDisabledReason={bookingDisabledReason}
        />
      </div>

      {/* Info button */}
      {showInfo && (
        <div
          className="bg-card animate-in fade-in slide-in-from-bottom-2 fixed bottom-40 left-6 z-30 w-64 rounded-xl border p-4 shadow-lg shadow-black/5"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-medium">등록 가능 기간</p>
          <p className="text-muted-foreground text-sm">
            {new Date(allowedStartDate).toLocaleDateString("ko-KR")} ~{" "}
            {new Date(allowedEndDate).toLocaleDateString("ko-KR")}
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            * 매월 25일 이후부터 다음 달 일정을 등록할 수 있습니다.
          </p>
        </div>
      )}
      <button
        type="button"
        aria-label="예약 가능 기간 안내"
        aria-expanded={showInfo}
        className="bg-card text-muted-foreground fixed bottom-24 left-6 z-20 flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-transform active:scale-95"
        onClick={(e) => {
          e.stopPropagation();
          setShowInfo((v) => !v);
        }}
      >
        <InfoIcon className="h-5 w-5" />
      </button>

      {/* FAB */}
      <button
        type="button"
        aria-label="선택한 날짜에 수업 예약"
        disabled={!!bookingDisabledReason}
        title={bookingDisabledReason || undefined}
        className="bg-primary text-primary-foreground shadow-primary/25 fixed right-6 bottom-24 z-20 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:shadow-xl active:scale-95 disabled:opacity-40 disabled:shadow-none"
        onClick={() => onAddClick(selectedDate)}
      >
        <PlusIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
