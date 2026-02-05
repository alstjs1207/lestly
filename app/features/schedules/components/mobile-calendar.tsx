import { useState } from "react";
import { Link } from "react-router";
import { format, addMonths, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon, InfoIcon, ListIcon, PlusIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { MobileMonthGrid } from "./mobile-month-grid";
import { MobileDayEvents } from "./mobile-day-events";

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
  allowedStartDate: string;
  allowedEndDate: string;
}

export function MobileCalendar({
  events,
  selectedDate,
  onDateSelect,
  onEventClick,
  onAddClick,
  allowedStartDate,
  allowedEndDate,
}: MobileCalendarProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [displayedMonth, setDisplayedMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

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
      date.getMonth() !== displayedMonth.getMonth() ||
      date.getFullYear() !== displayedMonth.getFullYear()
    ) {
      setDisplayedMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const today = new Date();

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)]" onClick={() => setShowInfo(false)}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b pb-2">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-semibold min-w-[120px] text-center">
              {format(displayedMonth, "yyyy년 M월", { locale: ko })}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigateMonth(1)}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to="/my-schedules/list">
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
        />
      </div>

      {/* Selected date header */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {format(selectedDate, "M월 d일 EEEE", { locale: ko })}
        </h3>
      </div>

      {/* Day events */}
      <div className="flex-1">
        <MobileDayEvents
          events={events}
          selectedDate={selectedDate}
          onEventClick={onEventClick}
        />
      </div>

      {/* Info button */}
      {showInfo && (
        <div
          className="fixed bottom-22 left-6 z-30 w-64 rounded-lg border bg-card p-4 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-medium">등록 가능 기간</p>
          <p className="text-sm text-muted-foreground">
            {new Date(allowedStartDate).toLocaleDateString("ko-KR")} ~{" "}
            {new Date(allowedEndDate).toLocaleDateString("ko-KR")}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            * 매월 25일 이후부터 다음 달 일정을 등록할 수 있습니다.
          </p>
        </div>
      )}
      <button
        type="button"
        className="fixed bottom-6 left-6 z-20 w-10 h-10 rounded-full bg-muted text-muted-foreground shadow-md flex items-center justify-center active:scale-95 transition-transform"
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
        className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        onClick={() => onAddClick(selectedDate)}
      >
        <PlusIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
