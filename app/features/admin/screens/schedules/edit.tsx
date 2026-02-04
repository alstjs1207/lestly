import type { Route } from "./+types/edit";

import { Link, useFetcher } from "react-router";
import { ChevronLeftIcon, TrashIcon } from "lucide-react";

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

import ScheduleForm from "../../components/schedule-form";
import { requireAdminRole } from "../../guards.server";
import { getActiveStudents } from "../../queries";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const [schedule, students, programs] = await Promise.all([
    getScheduleById(client, {
      scheduleId: parseInt(params.scheduleId),
    }),
    getActiveStudents(client, { organizationId }),
    getActivePrograms(client, { organizationId }),
  ]);

  // Check if schedule is in the past (compare date only, not time)
  const scheduleDate = new Date(schedule.start_time);
  const today = new Date();
  scheduleDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const isPast = scheduleDate < today;

  return { schedule, students, programs, isPast };
}

export default function ScheduleEditScreen({
  loaderData,
}: Route.ComponentProps) {
  const { schedule, students, programs, isPast } = loaderData;
  const deleteFetcher = useFetcher();

  const startTime = new Date(schedule.start_time);
  const endTime = new Date(schedule.end_time);
  const timeStr = `${String(startTime.getHours()).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`;

  // Use local date format to avoid timezone issues
  const year = startTime.getFullYear();
  const month = String(startTime.getMonth() + 1).padStart(2, "0");
  const day = String(startTime.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Calculate duration from start and end time
  const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  const durationSlots = String(Math.round(durationHours / 3)); // 3시간 = 1타임

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/schedules">
              <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">일정 수정</h1>
            <p className="text-muted-foreground">
              {schedule.student?.name || "알 수 없음"}의 일정을 수정합니다.
            </p>
          </div>
        </div>
        {!isPast && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <TrashIcon className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">삭제</span>
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
                <deleteFetcher.Form
                  method="post"
                  action={`/api/admin/schedules/${schedule.schedule_id}/delete`}
                >
                  <div className="flex gap-4">
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
                    {schedule.parent_schedule_id && (
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
                    <Button type="submit" variant="destructive">
                      삭제
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
            <div className="text-center py-8 text-muted-foreground">
              과거 날짜의 일정은 수정할 수 없습니다.
            </div>
          ) : (
            <ScheduleForm
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
                is_recurring: !!schedule.parent_schedule_id,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
