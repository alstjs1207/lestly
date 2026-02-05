import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { format, addMonths, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon, ListIcon, PlusIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { MobileMonthGrid } from "~/features/schedules/components/mobile-month-grid";
import { AdminMobileDayEvents } from "./admin-mobile-day-events";

interface AdminCalendarEvent {
  id: string;
  title: string;
  start: string | Date;
  end: string | Date;
  extendedProps?: {
    scheduleId: number;
    studentName: string;
    studentRegion: string | null;
    programName: string | null;
    studentColor: string;
  };
}

interface AdminMobileCalendarProps {
  events: AdminCalendarEvent[];
  year: number;
  month: number;
}

export function AdminMobileCalendar({
  events,
  year,
  month,
}: AdminMobileCalendarProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedDate, setSelectedDate] = useState(
    () => new Date(),
  );
  const [displayedMonth, setDisplayedMonth] = useState(
    () => new Date(year, month - 1, 1),
  );

  const eventColorsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const event of events) {
      const d = new Date(event.start);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const color = event.extendedProps?.studentColor ?? "#3B82F6";
      const existing = map.get(key) || [];
      existing.push(color);
      map.set(key, existing);
    }
    return map;
  }, [events]);

  const navigateMonth = (direction: -1 | 1) => {
    const next =
      direction === -1
        ? subMonths(displayedMonth, 1)
        : addMonths(displayedMonth, 1);
    setDisplayedMonth(next);

    const newYear = next.getFullYear();
    const newMonth = next.getMonth() + 1;
    setSearchParams({ year: String(newYear), month: String(newMonth) });
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    if (
      date.getMonth() !== displayedMonth.getMonth() ||
      date.getFullYear() !== displayedMonth.getFullYear()
    ) {
      setDisplayedMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setSearchParams({
        year: String(date.getFullYear()),
        month: String(date.getMonth() + 1),
      });
    }
  };

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="shrink-0 bg-background border-b pb-2">
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
            <Link to={`/admin/schedules/list?${searchParams.toString()}`}>
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
          eventColorsByDate={eventColorsByDate}
          disableDateRestrictions
        />
      </div>

      {/* Scrollable event list */}
      <div className="flex-1 overflow-y-auto">
        {/* Selected date header */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {format(selectedDate, "M월 d일 EEEE", { locale: ko })}
          </h3>
        </div>

        {/* Day events */}
        <div className="pb-20">
          <AdminMobileDayEvents
            events={events}
            selectedDate={selectedDate}
          />
        </div>
      </div>

      {/* FAB */}
      <Link
        to={`/admin/schedules/new?date=${selectedDateStr}`}
        className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <PlusIcon className="h-6 w-6" />
      </Link>
    </div>
  );
}
