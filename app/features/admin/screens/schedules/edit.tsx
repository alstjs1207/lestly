import type { Route } from "./+types/edit";

import { ChevronLeftIcon, TrashIcon } from "lucide-react";
import { Link, useFetcher } from "react-router";

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
  DialogTrigger,
} from "~/core/components/ui/dialog";
import makeServerClient from "~/core/lib/supa-client.server";
import { getActivePrograms } from "~/features/programs/queries";
import { getScheduleById } from "~/features/schedules/queries";
import { toKSTDateString } from "~/features/schedules/utils/kst";

import { getBookingPolicy } from "../../../app-settings/booking-policy.server";
import ScheduleForm from "../../components/schedule-form";
import { requireAdminRole } from "../../guards.server";
import { getActiveStudents } from "../../queries";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const bookingPolicy = await getBookingPolicy(client, { organizationId });

  const [schedule, students, programs] = await Promise.all([
    getScheduleById(client, {
      scheduleId: parseInt(params.scheduleId),
    }),
    getActiveStudents(client, { organizationId }),
    getActivePrograms(client, { organizationId }),
  ]);

  const isPast =
    toKSTDateString(new Date(schedule.start_time)) <
    toKSTDateString(new Date());

  return { schedule, students, programs, isPast, bookingPolicy };
}

export default function ScheduleEditScreen({
  loaderData,
}: Route.ComponentProps) {
  const { schedule, students, programs, isPast } = loaderData;
  const deleteFetcher = useFetcher<{ success: false; error?: string }>();

  const startTime = new Date(schedule.start_time);
  const endTime = new Date(schedule.end_time);
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(startTime);
  const dateStr = toKSTDateString(startTime);
  // Calculate duration from start and end time
  const durationSlots = String(
    (endTime.getTime() - startTime.getTime()) / 60_000,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/schedules" aria-label="일정 관리로 돌아가기">
              <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold md:text-2xl">일정 수정</h1>
            <p className="text-muted-foreground">
              {schedule.student?.name || "알 수 없음"}의 일정을 수정합니다.
            </p>
          </div>
        </div>
        {!isPast && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive min-h-11 self-start md:self-auto"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                일정 삭제
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>일정 삭제</DialogTitle>
                <DialogDescription>
                  이 일정을 삭제하시겠습니까?
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {deleteFetcher.data?.error && (
                  <p className="text-destructive text-sm" role="alert">
                    {deleteFetcher.data.error}
                  </p>
                )}
                <deleteFetcher.Form
                  method="post"
                  action={`/api/admin/schedules/${schedule.schedule_id}/delete`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="delete_single"
                        name="delete_scope"
                        value="single"
                        defaultChecked
                      />
                      <label htmlFor="delete_single" className="text-sm">
                        선택한 일정만 삭제
                      </label>
                    </div>
                    {(schedule.parent_schedule_id || schedule.rrule) && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="delete_future"
                          name="delete_scope"
                          value="future"
                        />
                        <label htmlFor="delete_future" className="text-sm">
                          이후 일정 일괄 삭제
                        </label>
                      </div>
                    )}
                  </div>
                  <DialogFooter className="mt-4">
                    <Button
                      type="submit"
                      variant="destructive"
                      disabled={deleteFetcher.state !== "idle"}
                    >
                      {deleteFetcher.state !== "idle" ? "삭제 중..." : "삭제"}
                    </Button>
                  </DialogFooter>
                </deleteFetcher.Form>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>일정 정보</CardTitle>
          <CardDescription>
            {isPast
              ? "과거 일정은 수정할 수 없습니다."
              : "* 표시된 항목은 필수 입력 항목입니다."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPast ? (
            <div className="text-muted-foreground py-8 text-center">
              과거 날짜의 일정은 수정할 수 없습니다.
            </div>
          ) : (
            <ScheduleForm
              bookingPolicy={loaderData.bookingPolicy}
              mode="edit"
              students={students}
              programs={programs}
              defaultValues={{
                schedule_id: schedule.schedule_id,
                student_id: schedule.student_id,
                program_id: schedule.program_id ?? undefined,
                date: dateStr,
                start_time: timeStr,
                duration: durationSlots,
                is_recurring: !!schedule.parent_schedule_id || !!schedule.rrule,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
