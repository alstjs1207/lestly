import type { Route } from "./+types/edit";

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
import { getInstructor } from "~/features/instructors/queries";
import { getInstructorPushAccounts } from "~/features/notifications/push/store.server";

import InstructorForm from "../../components/instructor-form";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const pushAccounts = Array.from(
    await getInstructorPushAccounts(organizationId),
  );

  const instructorId = parseInt(params.instructorId);
  const instructor = await getInstructor(client, { instructorId });

  if (!instructor) {
    throw new Response("Not Found", { status: 404 });
  }

  return { instructor, pushAccounts };
}

export default function InstructorEditScreen({
  loaderData,
}: Route.ComponentProps) {
  const { instructor } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/instructors">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">강사 수정</h1>
          <p className="text-muted-foreground hidden md:block">
            {instructor.name}의 정보를 수정합니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>강사 정보</CardTitle>
          <CardDescription>
            * 표시된 항목은 필수 입력 항목입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstructorForm
            mode="edit"
            pushAccounts={loaderData.pushAccounts}
            defaultValues={{
              instructor_id: instructor.instructor_id,
              name: instructor.name,
              push_profile_id: instructor.push_profile_id ?? undefined,
              info: instructor.info || undefined,
              photo_url: instructor.photo_url || undefined,
              career: (instructor.career as string[]) || undefined,
              sns:
                (instructor.sns as { instagram?: string; youtube?: string }) ||
                undefined,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
