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
import { getInstructorPushAccounts } from "~/features/notifications/push/store.server";

import InstructorForm from "../../components/instructor-form";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const pushAccounts = Array.from(
    await getInstructorPushAccounts(organizationId),
  );
  return { pushAccounts };
}

export default function InstructorCreateScreen({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/instructors">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">강사 등록</h1>
          <p className="text-muted-foreground hidden md:block">
            새로운 강사를 등록합니다.
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
            mode="create"
            pushAccounts={loaderData.pushAccounts}
          />
        </CardContent>
      </Card>
    </div>
  );
}
