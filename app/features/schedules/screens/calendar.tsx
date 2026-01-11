import type { Route } from "./+types/calendar";

import { useEffect, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { ListIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Label } from "~/core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import { requireAuthentication } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getActivePrograms } from "~/features/programs/queries";
import { getStudentSchedules } from "~/features/schedules/queries";
import {
  canStudentRegisterSchedule,
  DURATION_OPTIONS,
  generateTimeSlots,
  getStudentAllowedDateRange,
} from "~/features/schedules/utils/student-schedule-rules";
import { getOrganizationMembership } from "~/features/organizations/queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireAuthentication(client);

  const {
    data: { user },
  } = await client.auth.getUser();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Get user's organization
  const membership = await getOrganizationMembership(client, { profileId: user!.id });
  const organizationId = membership?.organization_id;

  const [schedules, programs] = await Promise.all([
    getStudentSchedules(client, {
      studentId: user!.id,
      year,
      month,
    }),
    organizationId
      ? getActivePrograms(client, { organizationId })
      : Promise.resolve([]),
  ]);

  const { startDate, endDate } = getStudentAllowedDateRange();

  // Transform schedules to calendar events
  const events = schedules.map((schedule) => ({
    id: String(schedule.schedule_id),
    title: "내 수업",
    start: schedule.start_time,
    end: schedule.end_time,
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  }));

  return {
    events,
    programs,
    allowedStartDate: startDate.toISOString(),
    allowedEndDate: endDate.toISOString(),
  };
}

export default function StudentCalendarScreen({
  loaderData,
}: Route.ComponentProps) {
  const { events, programs, allowedStartDate, allowedEndDate } = loaderData;
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<string>("1");
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProgramSelectOpen, setIsProgramSelectOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const revalidator = useRevalidator();

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data) {
      if (!fetcher.data.success && fetcher.data.error) {
        setErrorMessage(fetcher.data.error);
      } else if (fetcher.data.success) {
        // 성공 시 페이지 데이터 새로고침
        revalidator.revalidate();
      }
    }
  }, [fetcher.data, revalidator]);

  const timeSlots = generateTimeSlots(30);

  const handleDateClick = (arg: { date: Date }) => {
    const canRegister = canStudentRegisterSchedule(arg.date);
    const isPast = arg.date < new Date();

    if (!canRegister || isPast) {
      return;
    }

    setSelectedDate(arg.date);
    setSelectedTime("");

    // If multiple programs, show program selection first
    if (programs.length > 1) {
      setIsProgramSelectOpen(true);
    } else {
      // If single program or no programs, go directly to time selection
      setSelectedProgramId(programs.length === 1 ? programs[0].program_id : null);
      setIsDialogOpen(true);
    }
  };

  const handleProgramSelect = (programId: number) => {
    setSelectedProgramId(programId);
    setIsProgramSelectOpen(false);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selectedDate || !selectedTime) return;

    // Use local date format to avoid timezone issues
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    fetcher.submit(
      {
        date: dateStr,
        start_time: selectedTime,
        duration: selectedDuration,
        ...(selectedProgramId && { program_id: String(selectedProgramId) }),
      },
      {
        method: "post",
        action: "/api/schedules/create",
      },
    );

    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">나의 일정</h1>
          <p className="text-muted-foreground">
            날짜를 클릭하여 일정을 등록하세요.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/my-schedules/list">
            <ListIcon className="mr-2 h-4 w-4" />
            목록 보기
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>등록 가능 기간</CardTitle>
          <CardDescription>
            {new Date(allowedStartDate).toLocaleDateString("ko-KR")} ~{" "}
            {new Date(allowedEndDate).toLocaleDateString("ko-KR")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            * 매월 25일 이후부터 다음 달 일정을 등록할 수 있습니다.
            <br />
            * 수업 시간: 09:00 ~ 20:00 (1타임 = 3시간, 최대 3타임)
          </p>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-card p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          events={events}
          dateClick={handleDateClick}
          locale="ko"
          buttonText={{
            today: "오늘",
            month: "월",
            week: "주",
          }}
          validRange={{
            start: allowedStartDate,
            end: allowedEndDate,
          }}
          allDaySlot={false}
          slotMinTime="09:00:00"
          slotMaxTime="23:00:00"
          slotDuration="00:30:00"
          height="auto"
          dayMaxEvents={3}
          eventTimeFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일정 등록</DialogTitle>
            <DialogDescription>
              {selectedDate?.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="time">시작 시간</Label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger>
                  <SelectValue placeholder="시간 선택" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                시작 시간: 09:00 ~ 20:00
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">수업 타임</Label>
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger>
                  <SelectValue placeholder="타임 선택" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                1타임 = 3시간 (최대 3타임, 9시간)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedTime || fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!errorMessage} onOpenChange={() => setErrorMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>등록 실패</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProgramSelectOpen} onOpenChange={setIsProgramSelectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>클래스 선택</DialogTitle>
            <DialogDescription>
              {selectedDate?.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
              {" - "}수업을 등록할 클래스를 선택해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {programs.map((program) => (
              <Button
                key={program.program_id}
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => handleProgramSelect(program.program_id)}
              >
                <div className="text-left">
                  <div className="font-medium">{program.title}</div>
                  {program.subtitle && (
                    <div className="text-sm text-muted-foreground">
                      {program.subtitle}
                    </div>
                  )}
                </div>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProgramSelectOpen(false)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        .fc {
          --fc-border-color: hsl(var(--border));
          --fc-button-bg-color: hsl(var(--primary));
          --fc-button-border-color: hsl(var(--primary));
          --fc-button-hover-bg-color: hsl(var(--primary) / 0.9);
          --fc-button-hover-border-color: hsl(var(--primary) / 0.9);
          --fc-button-active-bg-color: hsl(var(--primary) / 0.8);
          --fc-button-active-border-color: hsl(var(--primary) / 0.8);
          --fc-today-bg-color: hsl(var(--accent));
        }
        .fc-toolbar-title {
          font-size: 1.25rem;
          font-weight: 600;
        }
        .fc-button {
          font-size: 0.875rem;
          padding: 0.375rem 0.75rem;
        }
        .fc-daygrid-day {
          border: 1px solid rgba(128, 128, 128, 0.4) !important;
          min-height: 100px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .fc-daygrid-day:hover {
          background-color: rgba(128, 128, 128, 0.2);
        }
        .fc-daygrid-day-frame {
          padding: 8px;
          min-height: 100px;
        }
        .fc-daygrid-day-top {
          padding: 4px;
        }
        .fc-scrollgrid {
          border: 1px solid rgba(128, 128, 128, 0.4) !important;
        }
        .fc-scrollgrid td,
        .fc-scrollgrid th {
          border: 1px solid rgba(128, 128, 128, 0.4) !important;
        }
        .fc-col-header-cell-cushion,
        .fc-daygrid-day-number {
          color: hsl(var(--foreground)) !important;
        }
        .fc-col-header-cell {
          background-color: hsl(var(--muted)) !important;
        }
        .fc-col-header {
          background-color: hsl(var(--muted)) !important;
        }
        .fc-scrollgrid-section-header th {
          background-color: hsl(var(--muted)) !important;
        }
        /* More link styles */
        .fc-more-link {
          color: hsl(var(--primary));
          font-weight: 500;
        }
        .fc-more-link:hover {
          color: hsl(var(--primary) / 0.8);
        }
      `}</style>
    </div>
  );
}
