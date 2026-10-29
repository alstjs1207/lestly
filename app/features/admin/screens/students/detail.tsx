import type { Route } from "./+types/detail";

import {
  CheckIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  EditIcon,
  LinkIcon,
  PhoneIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data } from "react-router";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";

import { studentTypeLabelMap } from "../../../organizations/student-types";
import { getStudentTypes } from "../../../organizations/student-types.server";
import StudentInviteDialog from "../../components/student-invite-dialog";
import StudentRestoreDialog from "../../components/student-restore-dialog";
import StudentStateDialog from "../../components/student-state-dialog";
import { StudentTotalHours } from "../../components/student-total-hours";
import { requireAdminRole } from "../../guards.server";
import {
  studentAge,
  studentScheduleDate,
  studentScheduleDay,
  studentScheduleTime,
} from "../../lib/student-display";
import { getStudentById, getStudentsTotalHours } from "../../queries";
import { getStudentScheduleOverview } from "../../utils/student-schedule-overview";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const totalHours = getStudentsTotalHours(client, {
    organizationId,
    studentIds: [params.studentId],
  });
  // Keep early rejection handled until React Router attaches its stream reader.
  void totalHours.catch(() => {});

  const [student, overview, studentTypes] = await Promise.all([
    getStudentById(client, { organizationId, studentId: params.studentId }),
    getStudentScheduleOverview(client, {
      studentId: params.studentId,
      organizationId,
    }),
    getStudentTypes(client, organizationId),
  ]);

  return data(
    {
      student,
      studentTypes,
      ...overview,
      totalHours,
    },
    { headers },
  );
}

const stateLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  NORMAL: { label: "수강 중", variant: "default" },
  GRADUATE: { label: "수강 종료", variant: "secondary" },
  DELETED: { label: "탈퇴", variant: "destructive" },
};

function formatPhoneNumber(value: string | null) {
  if (!value) return "연락처 없음";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }
  return value;
}

export default function StudentDetailScreen({
  loaderData,
}: Route.ComponentProps) {
  const {
    student,
    weeklySchedules,
    nextWeekSchedules,
    monthlySchedules,
    nextMonthSchedules,
    currentYear,
    currentMonth,
    nextMonthYear,
    nextMonth,
    totalHours,
  } = loaderData;
  const typeLabels = studentTypeLabelMap(loaderData.studentTypes);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copiedCurrent, setCopiedCurrent] = useState(false);
  const [copiedNext, setCopiedNext] = useState(false);
  const [copyError, setCopyError] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/students">
              <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold md:text-2xl">{student.name}</h1>
              <Badge variant={stateLabels[student.state]?.variant || "default"}>
                {stateLabels[student.state]?.label || student.state}
              </Badge>
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {student.phone ? (
                <a
                  href={`tel:${student.phone.replace(/\D/g, "")}`}
                  className="text-foreground inline-flex items-center gap-1.5 font-medium hover:underline"
                >
                  <PhoneIcon className="size-3.5" aria-hidden="true" />
                  {formatPhoneNumber(student.phone)}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <PhoneIcon className="size-3.5" aria-hidden="true" />
                  연락처 없음
                </span>
              )}
              <span className="hidden md:inline">
                {student.type ? typeLabels[student.type] : "-"} ·{" "}
                {student.region || "-"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/admin/students/${student.profile_id}/edit`}>
              <EditIcon className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">수정</span>
            </Link>
          </Button>
          {student.state === "NORMAL" && (
            <>
              {!student.auth_user_id && (
                <>
                  <Button
                    variant="outline"
                    aria-label="초대 링크 만들기"
                    onClick={() => setInviteOpen(true)}
                  >
                    <LinkIcon className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">초대 링크</span>
                  </Button>
                  {inviteOpen && (
                    <StudentInviteDialog
                      student={{ id: student.profile_id, name: student.name }}
                      onClose={() => setInviteOpen(false)}
                    />
                  )}
                </>
              )}

              <StudentStateDialog
                key={`${student.profile_id}-graduate`}
                studentId={student.profile_id}
                studentName={student.name}
                kind="graduate"
              />
            </>
          )}
          {(student.state === "NORMAL" || student.state === "GRADUATE") && (
            <StudentStateDialog
              key={`${student.profile_id}-delete`}
              studentId={student.profile_id}
              studentName={student.name}
              kind="delete"
            />
          )}
          {(student.state === "GRADUATE" || student.state === "DELETED") && (
            <StudentRestoreDialog
              key={`${student.profile_id}-restore`}
              studentId={student.profile_id}
              studentName={student.name}
              withdrawn={student.state === "DELETED"}
            />
          )}
        </div>
      </div>

      {copyError && (
        <p role="alert" className="text-destructive text-sm">
          일정을 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-sm">이름</p>
                <p className="font-medium">{student.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">이메일</p>
                <p className="font-medium">{student.contact_email || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">로그인 연결</p>
                <p className="font-medium">
                  {student.auth_user_id ? "연결됨" : "관리 전용"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">유형</p>
                <p className="font-medium">
                  {student.type ? typeLabels[student.type] : "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">지역</p>
                <p className="font-medium">{student.region || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">나이</p>
                <p className="font-medium">
                  {student.birth_date
                    ? `${studentAge(student.birth_date)}세 (${student.birth_date})`
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">전화번호</p>
                <p className="font-medium">{student.phone || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">캘린더 색상</p>
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded"
                    style={{ backgroundColor: student.color || "#3B82F6" }}
                  />
                  <span className="font-medium">
                    {student.color || "#3B82F6"}
                  </span>
                </div>
              </div>
            </div>
            {student.description && (
              <div>
                <p className="text-muted-foreground text-sm">설명</p>
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
                <p className="text-muted-foreground text-sm">수업 시작일</p>
                <p className="font-medium">{student.class_start_date || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">수업 종료일</p>
                <p className="font-medium">{student.class_end_date || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">총 수강시간</p>
                <p className="font-medium">
                  <StudentTotalHours
                    totals={totalHours}
                    studentId={student.profile_id}
                  />
                </p>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">보호자 정보</p>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                {currentYear}년 {currentMonth}월 일정
              </CardTitle>
              <CardDescription>이번 달의 수업 일정입니다.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={monthlySchedules.length === 0}
              onClick={() => {
                const lines = monthlySchedules.map((schedule) => {
                  const startDate = new Date(schedule.start_time);
                  const endDate = new Date(schedule.end_time);
                  const dateStr = studentScheduleDate(startDate, "long");
                  const day = studentScheduleDay(startDate);
                  const startTime = studentScheduleTime(startDate);
                  const endTime = studentScheduleTime(endDate);
                  const program = schedule.program?.title || "-";
                  return `${dateStr} (${day}) ${startTime}-${endTime} ${program}`;
                });
                const text = `[${student.name}] ${currentYear}년 ${currentMonth}월 일정\n${lines.join("\n")}`;
                setCopyError(false);
                navigator.clipboard
                  .writeText(text)
                  .then(() => {
                    setCopiedCurrent(true);
                    setTimeout(() => setCopiedCurrent(false), 2000);
                  })
                  .catch(() => setCopyError(true));
              }}
            >
              {copiedCurrent ? (
                <>
                  <CheckIcon className="mr-1 h-4 w-4" />
                  복사됨
                </>
              ) : (
                <>
                  <ClipboardIcon className="mr-1 h-4 w-4" />
                  복사
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {monthlySchedules.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                이번 달 등록된 일정이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="hidden md:table-cell">요일</TableHead>
                    <TableHead>클래스</TableHead>
                    <TableHead>시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlySchedules.map((schedule) => {
                    const startDate = new Date(schedule.start_time);
                    const endDate = new Date(schedule.end_time);
                    return (
                      <TableRow key={schedule.schedule_id}>
                        <TableCell>
                          {studentScheduleDate(startDate, "short")}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {studentScheduleDay(startDate)}
                        </TableCell>
                        <TableCell>{schedule.program?.title || "-"}</TableCell>
                        <TableCell>
                          {studentScheduleTime(startDate)}
                          {" - "}
                          {studentScheduleTime(endDate)}
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                {nextMonthYear}년 {nextMonth}월 일정
              </CardTitle>
              <CardDescription>다음 달의 수업 일정입니다.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={nextMonthSchedules.length === 0}
              onClick={() => {
                const lines = nextMonthSchedules.map((schedule) => {
                  const startDate = new Date(schedule.start_time);
                  const endDate = new Date(schedule.end_time);
                  const dateStr = studentScheduleDate(startDate, "long");
                  const day = studentScheduleDay(startDate);
                  const startTime = studentScheduleTime(startDate);
                  const endTime = studentScheduleTime(endDate);
                  const program = schedule.program?.title || "-";
                  return `${dateStr} (${day}) ${startTime}-${endTime} ${program}`;
                });
                const text = `[${student.name}] ${nextMonthYear}년 ${nextMonth}월 일정\n${lines.join("\n")}`;
                setCopyError(false);
                navigator.clipboard
                  .writeText(text)
                  .then(() => {
                    setCopiedNext(true);
                    setTimeout(() => setCopiedNext(false), 2000);
                  })
                  .catch(() => setCopyError(true));
              }}
            >
              {copiedNext ? (
                <>
                  <CheckIcon className="mr-1 h-4 w-4" />
                  복사됨
                </>
              ) : (
                <>
                  <ClipboardIcon className="mr-1 h-4 w-4" />
                  복사
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {nextMonthSchedules.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                다음 달 등록된 일정이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="hidden md:table-cell">요일</TableHead>
                    <TableHead>클래스</TableHead>
                    <TableHead>시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nextMonthSchedules.map((schedule) => {
                    const startDate = new Date(schedule.start_time);
                    const endDate = new Date(schedule.end_time);
                    return (
                      <TableRow key={schedule.schedule_id}>
                        <TableCell>
                          {studentScheduleDate(startDate, "short")}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {studentScheduleDay(startDate)}
                        </TableCell>
                        <TableCell>{schedule.program?.title || "-"}</TableCell>
                        <TableCell>
                          {studentScheduleTime(startDate)}
                          {" - "}
                          {studentScheduleTime(endDate)}
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>이번 주 일정</CardTitle>
            <CardDescription>현재 주의 수업 일정입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {weeklySchedules.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                이번 주 등록된 일정이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="hidden md:table-cell">요일</TableHead>
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
                          {studentScheduleDate(startDate, "short")}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {studentScheduleDay(startDate)}
                        </TableCell>
                        <TableCell>{schedule.program?.title || "-"}</TableCell>
                        <TableCell>
                          {studentScheduleTime(startDate)}
                          {" - "}
                          {studentScheduleTime(endDate)}
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
              <p className="text-muted-foreground py-8 text-center">
                다음 주 등록된 일정이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="hidden md:table-cell">요일</TableHead>
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
                          {studentScheduleDate(startDate, "short")}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {studentScheduleDay(startDate)}
                        </TableCell>
                        <TableCell>{schedule.program?.title || "-"}</TableCell>
                        <TableCell>
                          {studentScheduleTime(startDate)}
                          {" - "}
                          {studentScheduleTime(endDate)}
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
