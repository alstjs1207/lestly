import type { Route } from "./+types/create";

import { ChevronLeftIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";

import StudentForm from "../../components/student-form";
import { requireAdminRole } from "../../guards.server";
import { getDefaultStudentClassDates } from "../../lib/student-class-dates";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireAdminRole(client);
  return getDefaultStudentClassDates();
}

export default function StudentCreateScreen({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/students">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">수강생 등록</h1>
          <p className="text-muted-foreground hidden md:block">
            새로운 수강생 정보를 입력하세요.
          </p>
        </div>
        <Button variant="outline" className="ml-auto" asChild>
          <Link to="/admin/students/bulk">일괄 등록</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>수강생 정보</CardTitle>
          <CardDescription>
            * 표시된 항목은 필수 입력 항목입니다. 이메일은 선택 사항이며, 등록
            후 초대 링크를 복사해 카카오톡으로 전달할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StudentForm
            mode="create"
            defaultValues={{
              class_start_date: loaderData.classStartDate,
              class_end_date: loaderData.classEndDate,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
