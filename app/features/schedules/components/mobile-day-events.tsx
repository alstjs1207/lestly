import { format, isBefore, isSameDay, startOfDay } from "date-fns";
import { CalendarIcon, ClockIcon, InfoIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "~/core/lib/utils";
import { canStudentRegisterSchedule } from "~/features/schedules/utils/student-schedule-rules";

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

interface MobileDayEventsProps {
  events: CalendarEvent[];
  bookingDisabledReason?: string | null;
  selectedDate: Date;
  onEventClick: (event: SelectedEvent) => void;
}

export function MobileDayEvents({
  events,
  bookingDisabledReason,
  selectedDate,
  onEventClick,
}: MobileDayEventsProps) {
  const dayEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventDate = new Date(event.start);
        return isSameDay(eventDate, selectedDate);
      })
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }, [events, selectedDate]);

  if (dayEvents.length === 0) {
    const isPast = isBefore(selectedDate, startOfDay(new Date()));
    const canRegister = !bookingDisabledReason;

    if (isPast) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-muted mb-3 flex h-12 w-12 items-center justify-center rounded-full">
            <ClockIcon className="text-muted-foreground h-5 w-5" />
          </div>
          <p className="text-muted-foreground text-sm">
            지난 날짜에는 일정을 등록할 수 없습니다
          </p>
        </div>
      );
    }

    if (!canRegister) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-muted mb-3 flex h-12 w-12 items-center justify-center rounded-full">
            <InfoIcon className="text-muted-foreground h-5 w-5" />
          </div>
          <p className="text-muted-foreground text-sm">
            예약 가능한 날짜를 선택해주세요
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="bg-muted mb-3 flex h-12 w-12 items-center justify-center rounded-full">
          <CalendarIcon className="text-muted-foreground h-5 w-5" />
        </div>
        <p className="text-muted-foreground text-sm">일정이 없습니다</p>
        <p className="text-muted-foreground mt-1 text-sm">
          + 버튼을 눌러 일정을 등록하세요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 px-4 pb-24">
      {dayEvents.map((event) => {
        const start = new Date(event.start);
        const end = new Date(event.end);

        return (
          <button
            key={event.id}
            type="button"
            className={cn(
              "bg-card w-full rounded-xl border p-3.5 text-left shadow-sm",
              "transition-all duration-150 active:scale-[0.98]",
            )}
            onClick={() =>
              onEventClick({
                scheduleId: event.extendedProps?.scheduleId ?? Number(event.id),
                title: event.title,
                start,
                end,
                programTitle: event.extendedProps?.programTitle ?? null,
              })
            }
          >
            <div className="flex items-start gap-3">
              <div className="bg-primary min-h-[36px] w-1 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {event.extendedProps?.programTitle || event.title}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {format(start, "HH:mm")} - {format(end, "HH:mm")}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
