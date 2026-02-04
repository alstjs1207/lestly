import type { Route } from "./+types/edit";

import { Link } from "react-router";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import StudentForm from "../../components/student-form";
import { requireAdminRole } from "../../guards.server";
import { getStudentById } from "../../queries";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const student = await getStudentById(client, { organizationId, studentId: params.studentId });

  // auth.users에서 이메일 조회
  const { data: authUser } = await adminClient.auth.admin.getUserById(params.studentId);
  const email = authUser?.user?.email;

  return { student, email };
}

export default function StudentEditScreen({ loaderData }: Route.ComponentProps) {
  const { student, email } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/admin/students/${student.profile_id}`}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">수강생 수정</h1>
          <p className="hidden md:block text-muted-foreground">{student.name}의 정보를 수정합니다.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>수강생 정보</CardTitle>
          <CardDescription>
            * 표시된 항목은 필수 입력 항목입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StudentForm
            mode="edit"
            defaultValues={{
              profile_id: student.profile_id,
              email: email || undefined,
              name: student.name,
              state: student.state,
              type: student.type || undefined,
              region: student.region || undefined,
              birth_date: student.birth_date || undefined,
              description: student.description || undefined,
              class_start_date: student.class_start_date || undefined,
              class_end_date: student.class_end_date || undefined,
              phone: student.phone || undefined,
              parent_name: student.parent_name || undefined,
              parent_phone: student.parent_phone || undefined,
              color: student.color || undefined,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
