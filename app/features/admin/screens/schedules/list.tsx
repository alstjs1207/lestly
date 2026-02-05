import type { Route } from "./+types/list";

import { Link, useSearchParams } from "react-router";
import { CalendarIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { getMonthlySchedules } from "~/features/schedules/queries";
import { nowKST, toKSTDateString } from "~/features/schedules/utils/kst";

import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const url = new URL(request.url);
  const now = nowKST();
  const year = parseInt(url.searchParams.get("year") || String(now.year));
  const month = parseInt(url.searchParams.get("month") || String(now.month + 1));

  const schedules = await getMonthlySchedules(client, { organizationId, year, month });

  // Group schedules by KST date
  const schedulesByDate = schedules.reduce(
    (acc, schedule) => {
      const date = toKSTDateString(new Date(schedule.start_time));
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(schedule);
      return acc;
    },
    {} as Record<string, typeof schedules>,
  );

  // Get all days in the month
  const todayStr = `${now.year}-${String(now.month + 1).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return {
      date: dateStr,
      day,
      schedules: schedulesByDate[dateStr] || [],
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    };
  });

  return { allDays, year, month };
}

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export default function ScheduleListScreen({ loaderData }: Route.ComponentProps) {
  const { allDays, year, month } = loaderData;
  const [, setSearchParams] = useSearchParams();

  const handlePrevMonth = () => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    setSearchParams({ year: String(prevYear), month: String(prevMonth) });
  };

  const handleNextMonth = () => {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    setSearchParams({ year: String(nextYear), month: String(nextMonth) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">일정 관리</h1>
          <p className="hidden md:block text-muted-foreground">
            수강생들의 수업 일정을 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/admin/schedules?year=${year}&month=${month}`}>
              <CalendarIcon className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">캘린더 보기</span>
            </Link>
          </Button>
          <Button asChild>
            <Link to="/admin/schedules/new">
              <PlusIcon className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">일정 등록</span>
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={handlePrevMonth}>
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">
          {year}년 {month}월
        </h2>
        <Button variant="outline" size="icon" onClick={handleNextMonth}>
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20 md:w-32">날짜</TableHead>
              <TableHead className="hidden md:table-cell w-16">요일</TableHead>
              <TableHead>일정</TableHead>
              <TableHead className="w-16 md:w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allDays.map(({ date, day, schedules, isToday, isPast }) => {
              const dayOfWeek = new Date(date).getDay();
              return (
                <TableRow
                  key={date}
                  className={`${isToday ? "bg-accent" : ""} ${isPast ? "opacity-60" : ""}`}
                >
                  <TableCell className="font-medium">
                    {month}월 {day}일
                  </TableCell>
                  <TableCell
                    className={`hidden md:table-cell ${dayOfWeek === 0 ? "text-red-500" : ""} ${dayOfWeek === 6 ? "text-blue-500" : ""}`}
                  >
                    {dayLabels[dayOfWeek]}
                  </TableCell>
                  <TableCell>
                    {schedules.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {schedules.map((schedule) => (
                          <Badge
                            key={schedule.schedule_id}
                            variant="outline"
                            className="cursor-pointer hover:bg-accent"
                            style={{
                              borderColor: schedule.student?.color || "#3B82F6",
                              backgroundColor: `${schedule.student?.color || "#3B82F6"}20`,
                            }}
                            asChild
                          >
                            <Link to={`/admin/schedules/${schedule.schedule_id}/edit`}>
                              {schedule.student?.name || "알 수 없음"}
                              {schedule.program?.title && (
                                <span className="hidden md:inline text-muted-foreground ml-1">
                                  ({schedule.program.title})
                                </span>
                              )}
                              {" "}
                              {new Date(schedule.start_time).toLocaleTimeString(
                                "ko-KR",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                              -
                              {new Date(schedule.end_time).toLocaleTimeString(
                                "ko-KR",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </Link>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {!isPast && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/admin/schedules/new?date=${date}`}>추가</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
