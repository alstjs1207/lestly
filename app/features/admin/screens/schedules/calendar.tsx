import type { DatesSetArg } from "@fullcalendar/core";

import type { Route } from "./+types/calendar";

import { ListIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link, data, useNavigate, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { useIsMobile } from "~/core/hooks/use-mobile";
import makeServerClient from "~/core/lib/supa-client.server";
import { getMonthlySchedules } from "~/features/schedules/queries";
import { parseCalendarMonth } from "~/features/schedules/utils/calendar-month";

import AdminCalendar from "../../components/admin-calendar";
import { AdminMobileCalendar } from "../../components/admin-mobile-calendar";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const url = new URL(request.url);
  const { year, month } = parseCalendarMonth(url.searchParams);

  const schedules = await getMonthlySchedules(client, {
    organizationId,
    year,
    month,
  });

  // Transform schedules to calendar events
  const events = schedules.map((schedule) => {
    const studentName = schedule.student?.name || "알 수 없음";
    const studentRegion = schedule.student?.region || null;
    const programName = schedule.program?.title || null;
    const studentColor = schedule.student?.color || "#3B82F6";

    return {
      id: String(schedule.schedule_id),
      title: studentName,
      start: schedule.start_time,
      end: schedule.end_time,
      backgroundColor: `${studentColor}20`,
      borderColor: studentColor,
      textColor: "inherit",
      extendedProps: {
        studentId: schedule.student_id,
        scheduleId: schedule.schedule_id,
        programId: schedule.program_id,
        studentName,
        studentRegion,
        programName,
        studentColor,
      },
    };
  });

  return data({ events, year, month }, { headers });
}

function DaySchedulePanel({
  date,
  events,
  onClose,
}: {
  date: Date;
  events: {
    id: string;
    start: string;
    extendedProps: {
      scheduleId: number;
      studentName: string;
      programName: string | null;
      studentColor: string;
    };
  }[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  const dateLabel = date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  return (
    <div
      className="bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm"
      style={{ maxHeight: "calc(100vh - 220px)" }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{dateLabel}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {sorted.length > 0 ? `${sorted.length}개 일정` : "일정 없음"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            asChild
          >
            <Link to={`/admin/schedules/new?date=${dateStr}`}>
              <PlusIcon className="mr-1 h-3 w-3" />
              등록
            </Link>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onClose}
          >
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <p className="text-muted-foreground text-sm">일정이 없습니다</p>
            <Link
              to={`/admin/schedules/new?date=${dateStr}`}
              className="text-primary text-xs hover:underline"
            >
              일정 등록하기 →
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {sorted.map((event) => {
              const start = new Date(event.start);
              const timeStr = start.toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              const color = event.extendedProps.studentColor;

              return (
                <button
                  key={event.id}
                  type="button"
                  className="hover:bg-muted/50 flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors"
                  onClick={() =>
                    navigate(
                      `/admin/schedules/${event.extendedProps.scheduleId}/edit`,
                    )
                  }
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-muted-foreground w-10 shrink-0 text-xs tabular-nums">
                    {timeStr}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {event.extendedProps.studentName}
                    </p>
                    {event.extendedProps.programName && (
                      <p className="text-muted-foreground truncate text-xs">
                        {event.extendedProps.programName}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScheduleCalendarScreen({
  loaderData,
}: Route.ComponentProps) {
  const { events, year, month } = loaderData;
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const handleDatesSet = (dateInfo: DatesSetArg) => {
    const viewStart = dateInfo.view.currentStart;
    const newYear = viewStart.getFullYear();
    const newMonth = viewStart.getMonth() + 1;

    const currentYear = parseInt(searchParams.get("year") || String(year));
    const currentMonth = parseInt(searchParams.get("month") || String(month));

    if (newYear !== currentYear || newMonth !== currentMonth) {
      setSearchParams({ year: String(newYear), month: String(newMonth) });
      setSelectedDate(null);
    }
  };

  const selectedDateEvents = selectedDate
    ? events.filter((e) => {
        const d = new Date(e.start);
        return (
          d.getFullYear() === selectedDate.getFullYear() &&
          d.getMonth() === selectedDate.getMonth() &&
          d.getDate() === selectedDate.getDate()
        );
      })
    : [];

  if (isMobile) {
    return <AdminMobileCalendar events={events} year={year} month={month} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            일정 관리
          </h1>
          <p className="text-muted-foreground hidden text-sm md:block">
            수강생들의 수업 일정을 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to={`/admin/schedules/list?${searchParams.toString()}`}>
              <ListIcon className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">목록 보기</span>
            </Link>
          </Button>
          <Button size="sm" className="rounded-lg" asChild>
            <Link to="/admin/schedules/new">
              <PlusIcon className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">일정 등록</span>
            </Link>
          </Button>
        </div>
      </div>

      <div
        className={selectedDate ? "grid items-start gap-6" : ""}
        style={selectedDate ? { gridTemplateColumns: "1fr 300px" } : undefined}
      >
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <AdminCalendar
            events={events}
            initialDate={`${year}-${String(month).padStart(2, "0")}-01`}
            onDatesSet={handleDatesSet}
            onDaySelect={setSelectedDate}
            selectedDate={selectedDate}
          />
        </div>
        {selectedDate && (
          <DaySchedulePanel
            date={selectedDate}
            events={selectedDateEvents}
            onClose={() => setSelectedDate(null)}
          />
        )}
      </div>
    </div>
  );
}
