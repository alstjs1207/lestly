import { useMemo } from "react";
import { Link } from "react-router";
import { isSameDay, format } from "date-fns";

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

interface AdminMobileDayEventsProps {
  events: AdminCalendarEvent[];
  selectedDate: Date;
}

interface TimeGroup {
  timeLabel: string;
  events: AdminCalendarEvent[];
}

export function AdminMobileDayEvents({
  events,
  selectedDate,
}: AdminMobileDayEventsProps) {
  const timeGroups = useMemo(() => {
    const dayEvents = events
      .filter((event) => isSameDay(new Date(event.start), selectedDate))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const groups: TimeGroup[] = [];
    for (const event of dayEvents) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const timeLabel = `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`;

      const existing = groups.find((g) => g.timeLabel === timeLabel);
      if (existing) {
        existing.events.push(event);
      } else {
        groups.push({ timeLabel, events: [event] });
      }
    }
    return groups;
  }, [events, selectedDate]);

  if (timeGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">일정이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4">
      {timeGroups.map((group) => (
        <div key={group.timeLabel}>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            {group.timeLabel}
          </p>
          <div className="space-y-1.5">
            {group.events.map((event) => {
              const scheduleId = event.extendedProps?.scheduleId ?? Number(event.id);
              const studentColor = event.extendedProps?.studentColor ?? "#3B82F6";
              const programName = event.extendedProps?.programName;
              const studentName = event.extendedProps?.studentName ?? event.title;
              const studentRegion = event.extendedProps?.studentRegion;

              return (
                <Link
                  key={event.id}
                  to={`/admin/schedules/${scheduleId}/edit`}
                  className="block w-full text-left rounded-lg border p-3 active:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: studentColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {studentName}{studentRegion ? ` (${studentRegion})` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(event.start), "HH:mm")} - {format(new Date(event.end), "HH:mm")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {programName || "미지정"}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
