import { useMemo } from "react";
import { isSameDay, format } from "date-fns";
import { cn } from "~/core/lib/utils";

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
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">일정이 없습니다</p>
        <p className="text-xs mt-1">+ 버튼을 눌러 일정을 등록하세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4">
      {dayEvents.map((event) => {
        const start = new Date(event.start);
        const end = new Date(event.end);

        return (
          <button
            key={event.id}
            type="button"
            className={cn(
              "w-full text-left rounded-lg border p-3",
              "active:bg-accent transition-colors",
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
              <div className="mt-1.5 w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
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
