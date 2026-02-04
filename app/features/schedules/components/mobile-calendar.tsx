import { useCallback, useState } from "react";
import { Link } from "react-router";
import { format, addMonths, subMonths, addDays } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon, ListIcon, PlusIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { MobileWeekStrip } from "./mobile-week-strip";
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
  // displayedMonth tracks the month shown in the header, driven by the week strip's mid-point (Wednesday)
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  });

  const handleWeekChange = useCallback((weekStart: Date) => {
    // Use Wednesday (mid-point) to determine the displayed month
    const midWeek = addDays(weekStart, 3);
    setDisplayedMonth(new Date(midWeek.getFullYear(), midWeek.getMonth(), 1));
  }, []);

  const handlePrevMonth = () => {
    const prev = subMonths(displayedMonth, 1);
    // Navigate to 1st of previous month
    const target = new Date(prev.getFullYear(), prev.getMonth(), 1);
    onDateSelect(target);
    setDisplayedMonth(prev);
  };

  const handleNextMonth = () => {
    const next = addMonths(displayedMonth, 1);
    // Navigate to 1st of next month
    const target = new Date(next.getFullYear(), next.getMonth(), 1);
    onDateSelect(target);
    setDisplayedMonth(next);
  };

  const today = new Date();

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-semibold min-w-[120px] text-center">
              {format(displayedMonth, "yyyy년 M월", { locale: ko })}
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to="/my-schedules/list">
              <ListIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Today banner */}
        <div className="px-4 pb-2 text-sm text-muted-foreground">
          오늘 · {format(today, "EEE d", { locale: ko })}
        </div>

        {/* Week strip */}
        <MobileWeekStrip
          events={events}
          selectedDate={selectedDate}
          onDateSelect={onDateSelect}
          onWeekChange={handleWeekChange}
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
