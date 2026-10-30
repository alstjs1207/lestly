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
import { getBookingPolicy } from "~/features/app-settings/booking-policy.server";
import { getMaxConcurrentStudents } from "~/features/app-settings/queries";
import { getInstructors } from "~/features/instructors/queries";
import { programBookingDefaults } from "~/features/programs/booking-policy";

import ProgramForm from "../../components/program-form";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const [instructors, policy, capacity] = await Promise.all([
    getInstructors(client, { organizationId }),
    getBookingPolicy(client, { organizationId }),
    getMaxConcurrentStudents(client, { organizationId }),
  ]);
  return { instructors, defaults: programBookingDefaults(policy, capacity) };
}

export default function ProgramCreateScreen({
  loaderData,
}: Route.ComponentProps) {
  const { instructors } = loaderData;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/programs">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">클래스 등록</h1>
          <p className="text-muted-foreground hidden md:block">
            새로운 클래스 정보를 입력하세요.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>클래스 정보</CardTitle>
          <CardDescription>
            * 표시된 항목은 필수 입력 항목입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProgramForm
            mode="create"
            instructors={instructors}
            defaultValues={loaderData.defaults}
          />
        </CardContent>
      </Card>
    </div>
  );
}
