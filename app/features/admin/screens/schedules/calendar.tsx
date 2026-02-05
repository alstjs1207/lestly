import type { Route } from "./+types/calendar";
import type { DatesSetArg } from "@fullcalendar/core";

import { Link, useSearchParams } from "react-router";
import { ListIcon, PlusIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { useIsMobile } from "~/core/hooks/use-mobile";
import makeServerClient from "~/core/lib/supa-client.server";
import { getMonthlySchedules } from "~/features/schedules/queries";

import AdminCalendar from "../../components/admin-calendar";
import { AdminMobileCalendar } from "../../components/admin-mobile-calendar";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const url = new URL(request.url);
  const now = new Date();
  const year = parseInt(url.searchParams.get("year") || String(now.getFullYear()));
  const month = parseInt(url.searchParams.get("month") || String(now.getMonth() + 1));

  const schedules = await getMonthlySchedules(client, { organizationId, year, month });

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

  return { events, year, month };
}

export default function ScheduleCalendarScreen({
  loaderData,
}: Route.ComponentProps) {
  const { events, year, month } = loaderData;
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleDatesSet = (dateInfo: DatesSetArg) => {
    const viewStart = dateInfo.view.currentStart;
    const newYear = viewStart.getFullYear();
    const newMonth = viewStart.getMonth() + 1;

    const currentYear = parseInt(searchParams.get("year") || "0");
    const currentMonth = parseInt(searchParams.get("month") || "0");

    if (newYear !== currentYear || newMonth !== currentMonth) {
      setSearchParams({ year: String(newYear), month: String(newMonth) });
    }
  };

  if (isMobile) {
    return (
      <AdminMobileCalendar events={events} year={year} month={month} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">일정 관리</h1>
          <p className="hidden md:block text-sm text-muted-foreground">
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

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <AdminCalendar events={events} onDatesSet={handleDatesSet} />
      </div>
    </div>
  );
}
