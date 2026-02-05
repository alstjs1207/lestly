import type { Route } from "./+types/calendar";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { ListIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "~/core/components/ui/sheet";
import { useIsMobile } from "~/core/hooks/use-mobile";
import { requireAuthentication } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getOrganizationMembership } from "~/features/organizations/queries";
import { getActivePrograms } from "~/features/programs/queries";
import { MobileCalendar } from "~/features/schedules/components/mobile-calendar";
import { getStudentSchedules } from "~/features/schedules/queries";
import {
  DURATION_OPTIONS,
  canStudentCancelSchedule,
  canStudentRegisterSchedule,
  generateTimeSlots,
  getStudentAllowedDateRange,
} from "~/features/schedules/utils/student-schedule-rules";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireAuthentication(client);

  const {
    data: { user },
  } = await client.auth.getUser();

  // Get user's organization
  const membership = await getOrganizationMembership(client, {
    profileId: user!.id,
  });
  const organizationId = membership?.organization_id;

  const { startDate, endDate } = getStudentAllowedDateRange();

  const [schedules, programs] = await Promise.all([
    getStudentSchedules(client, {
      studentId: user!.id,
      startDate,
      endDate,
    }),
    organizationId
      ? getActivePrograms(client, { organizationId })
      : Promise.resolve([]),
  ]);

  // Transform schedules to calendar events
  const events = schedules.map((schedule) => ({
    id: String(schedule.schedule_id),
    title: schedule.program?.title || "내 수업",
    start: schedule.start_time,
    end: schedule.end_time,
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
    extendedProps: {
      scheduleId: schedule.schedule_id,
      programTitle: schedule.program?.title || null,
    },
  }));

  return {
    events,
    programs,
    allowedStartDate: startDate.toISOString(),
    allowedEndDate: endDate.toISOString(),
  };
}

type SelectedEvent = {
  scheduleId: number;
  title: string;
  start: Date;
  end: Date;
  programTitle: string | null;
};

export default function StudentCalendarScreen({
  loaderData,
}: Route.ComponentProps) {
  const { events, programs, allowedStartDate, allowedEndDate } = loaderData;
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    isMobile ? new Date() : null,
  );
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<string>("1");
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProgramSelectOpen, setIsProgramSelectOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(
    null,
  );
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false);
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const deleteFetcher = useFetcher<{ success: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const isLoading =
    fetcher.state !== "idle" ||
    deleteFetcher.state !== "idle" ||
    revalidator.state === "loading";

  // Initialize selectedDate to today when switching to mobile
  useEffect(() => {
    if (isMobile && !selectedDate) {
      setSelectedDate(new Date());
    }
  }, [isMobile, selectedDate]);

  // Handle create fetcher response
  useEffect(() => {
    if (fetcher.data) {
      if (!fetcher.data.success && fetcher.data.error) {
        setErrorMessage(fetcher.data.error);
      } else if (fetcher.data.success) {
        revalidator.revalidate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  // Handle delete fetcher response
  useEffect(() => {
    if (deleteFetcher.data) {
      if (!deleteFetcher.data.success && deleteFetcher.data.error) {
        setErrorMessage(deleteFetcher.data.error);
      } else if (deleteFetcher.data.success) {
        setIsEventDetailOpen(false);
        setSelectedEvent(null);
        revalidator.revalidate();
      }
    }
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [deleteFetcher.data]);

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
      setSelectedProgramId(
        programs.length === 1 ? programs[0].program_id : null,
      );
      setIsDialogOpen(true);
    }
  };

  const handleProgramSelect = (programId: number) => {
    setSelectedProgramId(programId);
    setIsProgramSelectOpen(false);
    setIsDialogOpen(true);
  };

  const handleEventClick = (arg: {
    event: {
      id: string;
      title: string;
      start: Date | null;
      end: Date | null;
      extendedProps: Record<string, unknown>;
    };
  }) => {
    const { event } = arg;
    if (!event.start || !event.end) return;

    setSelectedEvent({
      scheduleId: event.extendedProps.scheduleId as number,
      title: event.title,
      start: event.start,
      end: event.end,
      programTitle: event.extendedProps.programTitle as string | null,
    });
    setIsEventDetailOpen(true);
  };

  // Mobile-specific event click handler (receives SelectedEvent directly)
  const handleMobileEventClick = (event: SelectedEvent) => {
    setSelectedEvent(event);
    setIsEventDetailOpen(true);
  };

  // Mobile-specific add handler
  const handleMobileAddClick = (date: Date) => {
    handleDateClick({ date });
  };

  const handleCancelSchedule = () => {
    if (!selectedEvent) return;

    deleteFetcher.submit(
      {},
      {
        method: "post",
        action: `/api/schedules/${selectedEvent.scheduleId}/delete`,
      },
    );
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

  // Shared dialog/sheet content components
  const scheduleFormContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="time">시작 시간</Label>
        <div className="grid grid-cols-4 gap-2">
          {timeSlots.map((slot) => (
            <Button
              key={slot.value}
              type="button"
              variant={selectedTime === slot.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTime(slot.value)}
            >
              {slot.label}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
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
        <p className="text-muted-foreground text-xs">
          1타임 = 3시간 (최대 3타임, 9시간)
        </p>
      </div>
    </div>
  );

  const dateDescription = selectedDate?.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const eventDateDescription = selectedEvent?.start.toLocaleDateString(
    "ko-KR",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    },
  );

  return (
    <>
      {/* Loading overlay */}
      {isLoading && (
        <div className="bg-background/60 fixed inset-0 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />
            <p className="text-foreground text-sm font-medium">일정 반영 중...</p>
          </div>
        </div>
      )}

      {/* ===== Mobile UI ===== */}
      {isMobile && (
        <>
          <MobileCalendar
            events={events}
            selectedDate={selectedDate ?? new Date()}
            onDateSelect={setSelectedDate}
            onEventClick={handleMobileEventClick}
            onAddClick={handleMobileAddClick}
            allowedStartDate={allowedStartDate}
            allowedEndDate={allowedEndDate}
          />

          {/* Schedule registration Sheet */}
          <Sheet open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[80vh] overflow-y-auto rounded-t-2xl"
            >
              <SheetHeader>
                <SheetTitle>일정 등록</SheetTitle>
                <SheetDescription>{dateDescription}</SheetDescription>
              </SheetHeader>
              <div className="px-4">{scheduleFormContent}</div>
              <SheetFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  취소
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedTime || fetcher.state !== "idle"}
                >
                  {fetcher.state !== "idle" ? "등록 중..." : "등록"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Program selection Sheet */}
          <Sheet
            open={isProgramSelectOpen}
            onOpenChange={setIsProgramSelectOpen}
          >
            <SheetContent
              side="bottom"
              className="max-h-[80vh] overflow-y-auto rounded-t-2xl"
            >
              <SheetHeader>
                <SheetTitle>클래스 선택</SheetTitle>
                <SheetDescription>
                  {dateDescription}
                  {" - "}수업을 등록할 클래스를 선택해주세요.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 px-4">
                {programs.map((program) => (
                  <Button
                    key={program.program_id}
                    variant="outline"
                    className="h-auto w-full justify-start py-3"
                    onClick={() => handleProgramSelect(program.program_id)}
                  >
                    <div className="text-left">
                      <div className="font-medium">{program.title}</div>
                      {program.subtitle && (
                        <div className="text-muted-foreground text-sm">
                          {program.subtitle}
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
              <SheetFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsProgramSelectOpen(false)}
                >
                  취소
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Event detail Sheet */}
          <Sheet open={isEventDetailOpen} onOpenChange={setIsEventDetailOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[80vh] overflow-y-auto rounded-t-2xl"
            >
              <SheetHeader>
                <SheetTitle>일정 상세</SheetTitle>
                <SheetDescription>{eventDateDescription}</SheetDescription>
              </SheetHeader>
              {selectedEvent && (
                <div className="space-y-4 px-4">
                  <div className="space-y-2">
                    <Label>클래스</Label>
                    <p className="text-sm">
                      {selectedEvent.programTitle || "미지정"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>시간</Label>
                    <p className="text-sm">
                      {selectedEvent.start.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" - "}
                      {selectedEvent.end.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {canStudentCancelSchedule(selectedEvent.start) ? (
                    <p className="text-muted-foreground text-sm">
                      일정을 취소하려면 아래 버튼을 클릭하세요.
                    </p>
                  ) : (
                    <p className="text-destructive text-sm">
                      당일 일정은 취소할 수 없습니다. 강사에게 문의해주세요.
                    </p>
                  )}
                </div>
              )}
              <SheetFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsEventDetailOpen(false)}
                >
                  닫기
                </Button>
                {selectedEvent &&
                  canStudentCancelSchedule(selectedEvent.start) && (
                    <Button
                      variant="destructive"
                      onClick={handleCancelSchedule}
                      disabled={deleteFetcher.state !== "idle"}
                    >
                      {deleteFetcher.state !== "idle"
                        ? "취소 중..."
                        : "일정 취소"}
                    </Button>
                  )}
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Error message Sheet */}
          <Sheet
            open={!!errorMessage}
            onOpenChange={() => setErrorMessage(null)}
          >
            <SheetContent
              side="bottom"
              className="max-h-[80vh] overflow-y-auto rounded-t-2xl"
            >
              <SheetHeader>
                <SheetTitle>등록 실패</SheetTitle>
                <SheetDescription>{errorMessage}</SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <Button onClick={() => setErrorMessage(null)}>확인</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* ===== Desktop UI ===== */}
      {!isMobile && (
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
              <p className="text-muted-foreground text-sm">
                * 매월 25일 이후부터 다음 달 일정을 등록할 수 있습니다.
                <br />* 수업 시간: 09:00 ~ 20:00 (1타임 = 3시간, 최대 3타임)
              </p>
            </CardContent>
          </Card>

          <div className="bg-card rounded-md border p-4">
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
              eventClick={handleEventClick}
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
                <DialogDescription>{dateDescription}</DialogDescription>
              </DialogHeader>
              {scheduleFormContent}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
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

          <Dialog
            open={!!errorMessage}
            onOpenChange={() => setErrorMessage(null)}
          >
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

          <Dialog
            open={isProgramSelectOpen}
            onOpenChange={setIsProgramSelectOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>클래스 선택</DialogTitle>
                <DialogDescription>
                  {dateDescription}
                  {" - "}수업을 등록할 클래스를 선택해주세요.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {programs.map((program) => (
                  <Button
                    key={program.program_id}
                    variant="outline"
                    className="h-auto w-full justify-start py-3"
                    onClick={() => handleProgramSelect(program.program_id)}
                  >
                    <div className="text-left">
                      <div className="font-medium">{program.title}</div>
                      {program.subtitle && (
                        <div className="text-muted-foreground text-sm">
                          {program.subtitle}
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsProgramSelectOpen(false)}
                >
                  취소
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEventDetailOpen} onOpenChange={setIsEventDetailOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>일정 상세</DialogTitle>
                <DialogDescription>{eventDateDescription}</DialogDescription>
              </DialogHeader>
              {selectedEvent && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>클래스</Label>
                    <p className="text-sm">
                      {selectedEvent.programTitle || "미지정"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>시간</Label>
                    <p className="text-sm">
                      {selectedEvent.start.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" - "}
                      {selectedEvent.end.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {canStudentCancelSchedule(selectedEvent.start) ? (
                    <p className="text-muted-foreground text-sm">
                      일정을 취소하려면 아래 버튼을 클릭하세요.
                    </p>
                  ) : (
                    <p className="text-destructive text-sm">
                      당일 일정은 취소할 수 없습니다. 강사에게 문의해주세요.
                    </p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsEventDetailOpen(false)}
                >
                  닫기
                </Button>
                {selectedEvent &&
                  canStudentCancelSchedule(selectedEvent.start) && (
                    <Button
                      variant="destructive"
                      onClick={handleCancelSchedule}
                      disabled={deleteFetcher.state !== "idle"}
                    >
                      {deleteFetcher.state !== "idle"
                        ? "취소 중..."
                        : "일정 취소"}
                    </Button>
                  )}
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
      )}
    </>
  );
}
