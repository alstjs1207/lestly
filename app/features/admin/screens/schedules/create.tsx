import type { Route } from "./+types/create";

import { Link, useSearchParams } from "react-router";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { getActivePrograms } from "~/features/programs/queries";

import ScheduleForm from "../../components/schedule-form";
import { requireAdminRole } from "../../guards.server";
import { getActiveStudents } from "../../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const [students, programs] = await Promise.all([
    getActiveStudents(client, { organizationId }),
    getActivePrograms(client, { organizationId }),
  ]);

  return { students, programs };
}

export default function ScheduleCreateScreen({
  loaderData,
}: Route.ComponentProps) {
  const { students, programs } = loaderData;
  const [searchParams] = useSearchParams();
  const defaultDate = searchParams.get("date") || undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/schedules">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">일정 등록</h1>
          <p className="text-muted-foreground">
            새로운 수업 일정을 등록합니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>일정 정보</CardTitle>
          <CardDescription>
            * 표시된 항목은 필수 입력 항목입니다. 수업 시간은 3시간으로
            고정됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                등록 가능한 수강생이 없습니다.
              </p>
              <Button asChild>
                <Link to="/admin/students/new">수강생 등록하기</Link>
              </Button>
            </div>
          ) : (
            <ScheduleForm
              mode="create"
              students={students}
              programs={programs}
              defaultValues={{
                date: defaultDate,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
