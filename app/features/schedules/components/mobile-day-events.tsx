import { useMemo } from "react";
import { isSameDay, isBefore, startOfDay, format } from "date-fns";
import { CalendarIcon, ClockIcon, InfoIcon } from "lucide-react";
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
  selectedDate: Date;
  onEventClick: (event: SelectedEvent) => void;
}

export function MobileDayEvents({
  events,
  selectedDate,
  onEventClick,
}: MobileDayEventsProps) {
  const dayEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventDate = new Date(event.start);
        return isSameDay(eventDate, selectedDate);
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, selectedDate]);

  if (dayEvents.length === 0) {
    const isPast = isBefore(selectedDate, startOfDay(new Date()));
    const canRegister = canStudentRegisterSchedule(selectedDate);

    if (isPast) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <ClockIcon className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="text-sm text-muted-foreground/60">지난 날짜에는 일정을 등록할 수 없습니다</p>
        </div>
      );
    }

    if (!canRegister) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <InfoIcon className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="text-sm text-muted-foreground/60">다음 달 일정은 매월 25일부터 등록할 수 있습니다</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <CalendarIcon className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <p className="text-sm text-muted-foreground/60">일정이 없습니다</p>
        <p className="text-xs mt-1 text-muted-foreground/40">+ 버튼을 눌러 일정을 등록하세요</p>
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
              "w-full text-left rounded-xl border bg-card p-3.5 shadow-sm",
              "active:scale-[0.98] transition-all duration-150",
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
              <div className="w-1 min-h-[36px] rounded-full bg-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {event.extendedProps?.programTitle || event.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
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
