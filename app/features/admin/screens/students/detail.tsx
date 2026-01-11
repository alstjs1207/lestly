import type { Route } from "./+types/detail";

import { Link, useFetcher } from "react-router";
import { ChevronLeftIcon, EditIcon, GraduationCapIcon, MailIcon, TrashIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
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
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  calculateStudentTotalHours,
  getStudentNextWeekSchedules,
  getStudentWeeklySchedules,
} from "~/features/schedules/queries";

import { requireAdminRole } from "../../guards.server";
import { getStudentById } from "../../queries";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const [student, weeklySchedules, nextWeekSchedules, totalHours, authUser] = await Promise.all([
    getStudentById(client, { organizationId, studentId: params.studentId }),
    getStudentWeeklySchedules(client, { studentId: params.studentId }),
    getStudentNextWeekSchedules(client, { studentId: params.studentId }),
    calculateStudentTotalHours(client, { studentId: params.studentId }),
    adminClient.auth.admin.getUserById(params.studentId),
  ]);

  const email = authUser?.data?.user?.email;

  return {
    student,
    weeklySchedules,
    nextWeekSchedules,
    totalHours: Math.round(totalHours * 10) / 10,
    email,
  };
}

const stateLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  NORMAL: { label: "정상", variant: "default" },
  GRADUATE: { label: "졸업", variant: "secondary" },
  DELETED: { label: "탈퇴", variant: "destructive" },
};

const typeLabels: Record<string, string> = {
  EXAMINEE: "입시생",
  DROPPER: "재수생",
  ADULT: "성인",
};

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export default function StudentDetailScreen({
  loaderData,
}: Route.ComponentProps) {
  const { student, weeklySchedules, nextWeekSchedules, totalHours, email } = loaderData;
  const graduateFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const inviteFetcher = useFetcher<{ success: boolean; error?: string }>();

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/students">
              <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{student.name}</h1>
              <Badge variant={stateLabels[student.state]?.variant || "default"}>
                {stateLabels[student.state]?.label || student.state}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {student.type ? typeLabels[student.type] : "-"} · {student.region || "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/admin/students/${student.profile_id}/edit`}>
              <EditIcon className="mr-2 h-4 w-4" />
              수정
            </Link>
          </Button>
          {student.state === "NORMAL" && (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <MailIcon className="mr-2 h-4 w-4" />
                    초대 발송
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>초대 이메일 발송</DialogTitle>
                    <DialogDescription>
                      {student.name} ({email}) 수강생에게 초대 이메일을 발송하시겠습니까?
                      수강생은 이메일을 통해 비밀번호를 설정하고 로그인할 수 있습니다.
                    </DialogDescription>
                  </DialogHeader>
                  {inviteFetcher.data?.success === false && (
                    <p className="text-sm text-destructive">
                      {inviteFetcher.data.error}
                    </p>
                  )}
                  {inviteFetcher.data?.success === true && (
                    <p className="text-sm text-green-600">
                      초대 이메일이 발송되었습니다.
                    </p>
                  )}
                  <DialogFooter>
                    <inviteFetcher.Form
                      method="post"
                      action={`/api/admin/students/${student.profile_id}/invite`}
                    >
                      <Button
                        type="submit"
                        disabled={inviteFetcher.state !== "idle"}
                      >
                        {inviteFetcher.state !== "idle" ? "발송 중..." : "발송"}
                      </Button>
                    </inviteFetcher.Form>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <GraduationCapIcon className="mr-2 h-4 w-4" />
                    졸업
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>수강생 졸업 처리</DialogTitle>
                    <DialogDescription>
                      {student.name} 수강생을 졸업 처리하시겠습니까? 졸업 처리된
                      수강생은 일정 등록 시 선택할 수 없습니다.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <graduateFetcher.Form
                      method="post"
                      action={`/api/admin/students/${student.profile_id}/graduate`}
                    >
                      <Button type="submit">졸업 처리</Button>
                    </graduateFetcher.Form>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <TrashIcon className="mr-2 h-4 w-4" />
                    탈퇴
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>수강생 탈퇴 처리</DialogTitle>
                    <DialogDescription>
                      {student.name} 수강생을 탈퇴 처리하시겠습니까? 탈퇴 처리된
                      수강생은 관리자 전용 목록에서만 확인할 수 있습니다.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <deleteFetcher.Form
                      method="post"
                      action={`/api/admin/students/${student.profile_id}/delete`}
                    >
                      <Button type="submit" variant="destructive">
                        탈퇴 처리
                      </Button>
                    </deleteFetcher.Form>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">이름</p>
                <p className="font-medium">{student.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">이메일</p>
                <p className="font-medium">{email || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">유형</p>
                <p className="font-medium">
                  {student.type ? typeLabels[student.type] : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">지역</p>
                <p className="font-medium">{student.region || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">나이</p>
                <p className="font-medium">
                  {student.birth_date
                    ? `${calculateAge(student.birth_date)}세 (${student.birth_date})`
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">전화번호</p>
                <p className="font-medium">{student.phone || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">캘린더 색상</p>
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded"
                    style={{ backgroundColor: student.color || "#3B82F6" }}
                  />
                  <span className="font-medium">{student.color || "#3B82F6"}</span>
                </div>
              </div>
            </div>
            {student.description && (
              <div>
                <p className="text-sm text-muted-foreground">설명</p>
                <p className="font-medium whitespace-pre-wrap">
                  {student.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>수업 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">수업 시작일</p>
                <p className="font-medium">{student.class_start_date || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">수업 종료일</p>
                <p className="font-medium">{student.class_end_date || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 수강시간</p>
                <p className="font-medium">{totalHours}시간</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">학부모 정보</p>
              <p className="font-medium">
                {student.parent_name || "-"}{" "}
                {student.parent_phone && `(${student.parent_phone})`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>이번 주 일정</CardTitle>
            <CardDescription>현재 주의 수업 일정입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {weeklySchedules.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                이번 주 등록된 일정이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>요일</TableHead>
                    <TableHead>클래스</TableHead>
                    <TableHead>시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklySchedules.map((schedule) => {
                    const startDate = new Date(schedule.start_time);
                    const endDate = new Date(schedule.end_time);
                    return (
                      <TableRow key={schedule.schedule_id}>
                        <TableCell>
                          {startDate.toLocaleDateString("ko-KR", {
                            month: "short",
                            day: "numeric",
                          })}
                        </TableCell>
                        <TableCell>{dayLabels[startDate.getDay()]}</TableCell>
                        <TableCell>
                          {schedule.program?.title || "-"}
                        </TableCell>
                        <TableCell>
                          {startDate.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" - "}
                          {endDate.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
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
            <CardTitle>다음 주 일정</CardTitle>
            <CardDescription>다음 주의 수업 일정입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {nextWeekSchedules.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                다음 주 등록된 일정이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>요일</TableHead>
                    <TableHead>클래스</TableHead>
                    <TableHead>시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nextWeekSchedules.map((schedule) => {
                    const startDate = new Date(schedule.start_time);
                    const endDate = new Date(schedule.end_time);
                    return (
                      <TableRow key={schedule.schedule_id}>
                        <TableCell>
                          {startDate.toLocaleDateString("ko-KR", {
                            month: "short",
                            day: "numeric",
                          })}
                        </TableCell>
                        <TableCell>{dayLabels[startDate.getDay()]}</TableCell>
                        <TableCell>
                          {schedule.program?.title || "-"}
                        </TableCell>
                        <TableCell>
                          {startDate.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" - "}
                          {endDate.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
