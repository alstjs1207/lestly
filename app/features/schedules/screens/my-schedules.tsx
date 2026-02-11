import type { Route } from "./+types/my-schedules";

import { useEffect, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import { CalendarIcon } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { requireAuthentication } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStudentSchedules } from "~/features/schedules/queries";
import {
  canStudentCancelSchedule,
  getStudentAllowedDateRange,
} from "~/features/schedules/utils/student-schedule-rules";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const user = await requireAuthentication(client);

  const { startDate, endDate } = getStudentAllowedDateRange();

  const schedules = await getStudentSchedules(client, {
    studentId: user.id,
    startDate,
    endDate,
  });

  return {
    schedules,
    allowedStartDate: startDate.toISOString(),
    allowedEndDate: endDate.toISOString(),
  };
}

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export default function MySchedulesScreen({ loaderData }: Route.ComponentProps) {
  const { schedules, allowedStartDate, allowedEndDate } = loaderData;
  const cancelFetcher = useFetcher<{ success: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle cancel fetcher response
  useEffect(() => {
    if (cancelFetcher.data) {
      if (!cancelFetcher.data.success && cancelFetcher.data.error) {
        setErrorMessage(cancelFetcher.data.error);
      } else if (cancelFetcher.data.success) {
        revalidator.revalidate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelFetcher.data]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">나의 일정</h1>
          <p className="text-muted-foreground">
            {new Date(allowedStartDate).toLocaleDateString("ko-KR")} ~ {new Date(allowedEndDate).toLocaleDateString("ko-KR")}
          </p>
        </div>
        <Button asChild>
          <Link to="/my-schedules">
            <CalendarIcon className="mr-2 h-4 w-4" />
            캘린더 보기
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>등록된 일정</CardTitle>
          <CardDescription>
            {schedules.length}건의 일정이 등록되어 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                등록된 일정이 없습니다.
              </p>
              <Button asChild>
                <Link to="/my-schedules">캘린더에서 일정 등록하기</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>클래스</TableHead>
                  <TableHead>시간</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const startTime = new Date(schedule.start_time);
                  const endTime = new Date(schedule.end_time);
                  const canCancel = canStudentCancelSchedule(startTime);
                  const isPast = startTime < today;

                  return (
                    <TableRow
                      key={schedule.schedule_id}
                      className={isPast ? "opacity-60" : ""}
                    >
                      <TableCell className="py-2 font-medium">
                        {startTime.getMonth() + 1}월 {startTime.getDate()}일({dayLabels[startTime.getDay()]})
                      </TableCell>
                      <TableCell className="py-2">{schedule.program?.title || "-"}</TableCell>
                      <TableCell className="py-2">
                        {startTime.toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" - "}
                        {endTime.toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="py-2">
                        {!isPast && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                취소
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>일정 취소</DialogTitle>
                                <DialogDescription>
                                  {canCancel
                                    ? "이 일정을 취소하시겠습니까?"
                                    : "당일 일정은 취소할 수 없습니다. 강사에게 문의해주세요."}
                                </DialogDescription>
                              </DialogHeader>
                              {canCancel ? (
                                <DialogFooter>
                                  <cancelFetcher.Form
                                    method="post"
                                    action={`/api/schedules/${schedule.schedule_id}/delete`}
                                  >
                                    <Button type="submit" variant="destructive">
                                      취소하기
                                    </Button>
                                  </cancelFetcher.Form>
                                </DialogFooter>
                              ) : (
                                <DialogFooter>
                                  <Button variant="outline">확인</Button>
                                </DialogFooter>
                              )}
                            </DialogContent>
                          </Dialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!errorMessage} onOpenChange={() => setErrorMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>취소 실패</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
