import type { Route } from "./+types/today";

import { Link } from "react-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { getDailySchedules } from "~/features/schedules/queries";

import { requireAdminRole } from "../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const today = new Date();
  const schedules = await getDailySchedules(client, { organizationId, date: today });

  return { schedules, today: today.toISOString() };
}


export default function TodayScreen({ loaderData }: Route.ComponentProps) {
  const { schedules, today } = loaderData;
  const todayDate = new Date(today);

  // Get unique students from schedules
  const studentsMap = new Map<string, typeof schedules[0]["student"]>();
  schedules.forEach((schedule) => {
    if (schedule.student && !studentsMap.has(schedule.student.profile_id)) {
      studentsMap.set(schedule.student.profile_id, schedule.student);
    }
  });
  const todayStudents = Array.from(studentsMap.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">오늘의 수업</h1>
        <p className="text-muted-foreground">
          {todayDate.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>수업 일정</CardTitle>
            <CardDescription>
              오늘 예정된 수업 {schedules.length}건
            </CardDescription>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                오늘 예정된 수업이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시간</TableHead>
                    <TableHead>수강생</TableHead>
                    <TableHead>클래스</TableHead>
                    <TableHead>지역</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => {
                    const startTime = new Date(schedule.start_time);
                    const endTime = new Date(schedule.end_time);
                    return (
                      <TableRow key={schedule.schedule_id}>
                        <TableCell className="font-medium">
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
                        <TableCell>
                          <Link
                            to={`/admin/students/${schedule.student?.profile_id}`}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{
                                backgroundColor:
                                  schedule.student?.color || "#3B82F6",
                              }}
                            />
                            {schedule.student?.name || "알 수 없음"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {schedule.program?.title || "-"}
                        </TableCell>
                        <TableCell>
                          {schedule.student?.region || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>오늘의 수강생</CardTitle>
            <CardDescription>오늘 수업 예정인 수강생 {todayStudents.length}명</CardDescription>
          </CardHeader>
          <CardContent>
            {todayStudents.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                오늘 수업 예정인 수강생이 없습니다.
              </p>
            ) : (
              <div className="space-y-4">
                {todayStudents.map((student) => (
                  <div
                    key={student?.profile_id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full"
                        style={{
                          backgroundColor: student?.color || "#3B82F6",
                        }}
                      />
                      <div>
                        <Link
                          to={`/admin/students/${student?.profile_id}`}
                          className="font-medium hover:underline"
                        >
                          {student?.name || "알 수 없음"}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {student?.region || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {student?.phone && (
                        <p className="text-sm text-muted-foreground">
                          {student.phone}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
