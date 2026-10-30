import type { Route } from "./+types/create";

import { ChevronLeftIcon, UsersIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { EmptyState } from "~/core/components/ui/empty-state";
import makeServerClient from "~/core/lib/supa-client.server";
import { getActivePrograms } from "~/features/programs/queries";
import { toKSTDateString } from "~/features/schedules/utils/kst";

import { getBookingPolicy } from "../../../app-settings/booking-policy.server";
import ScheduleForm from "../../components/schedule-form";
import { requireAdminRole } from "../../guards.server";
import { getActiveStudents } from "../../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const bookingPolicy = await getBookingPolicy(client, { organizationId });

  const [students, programs] = await Promise.all([
    getActiveStudents(client, { organizationId }),
    getActivePrograms(client, { organizationId }),
  ]);

  return { students, programs, bookingPolicy };
}

export default function ScheduleCreateScreen({
  loaderData,
}: Route.ComponentProps) {
  const { students, programs } = loaderData;
  const [searchParams] = useSearchParams();
  const defaultDate = searchParams.get("date") || toKSTDateString(new Date());
  const defaultStudentId = searchParams.get("studentId") || undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/schedules" aria-label="일정 관리로 돌아가기">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">일정 등록</h1>
          <p className="text-muted-foreground">
            새로운 수업 일정을 등록합니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>일정 정보</CardTitle>
          <CardDescription>
            * 표시된 항목은 필수 입력 항목입니다. 선택한 클래스에 설정한 수업
            길이를 선택할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="예약할 활성 클래스가 없습니다."
              description="클래스를 먼저 등록하고 활성 상태로 설정해 주세요."
              action={
                <Button asChild>
                  <Link to="/admin/programs/new">클래스 등록하기</Link>
                </Button>
              }
            />
          ) : students.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="등록 가능한 수강생이 없습니다."
              description="수강생을 먼저 등록하면 바로 일정을 만들 수 있습니다."
              action={
                <Button asChild>
                  <Link to="/admin/students/new">수강생 등록하기</Link>
                </Button>
              }
            />
          ) : (
            <ScheduleForm
              bookingPolicy={loaderData.bookingPolicy}
              mode="create"
              students={students}
              programs={programs}
              defaultValues={{
                date: defaultDate,
                student_id: defaultStudentId,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
