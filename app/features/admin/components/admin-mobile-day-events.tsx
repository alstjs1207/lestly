import { format, isSameDay } from "date-fns";
import { CalendarPlusIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { EmptyState } from "~/core/components/ui/empty-state";

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
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

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
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    return (
      <EmptyState
        icon={CalendarPlusIcon}
        title="이 날짜에는 일정이 없습니다."
        description="선택한 날짜에 첫 수업을 등록해 보세요."
        action={
          <Button variant="outline" asChild>
            <Link to={`/admin/schedules/new?date=${selectedDateStr}`}>
              일정 등록
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4 px-4">
      {timeGroups.map((group) => (
        <div key={group.timeLabel}>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">
            {group.timeLabel}
          </p>
          <div className="space-y-1.5">
            {group.events.map((event) => {
              const scheduleId =
                event.extendedProps?.scheduleId ?? Number(event.id);
              const studentColor =
                event.extendedProps?.studentColor ?? "#3B82F6";
              const programName = event.extendedProps?.programName;
              const studentName =
                event.extendedProps?.studentName ?? event.title;
              const studentRegion = event.extendedProps?.studentRegion;

              return (
                <Link
                  key={event.id}
                  to={`/admin/schedules/${scheduleId}/edit`}
                  className="bg-card active:bg-accent block w-full rounded-xl border p-3 text-left shadow-sm transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/30"
                      style={{ backgroundColor: studentColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {studentName}
                        {studentRegion ? ` (${studentRegion})` : ""}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
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
