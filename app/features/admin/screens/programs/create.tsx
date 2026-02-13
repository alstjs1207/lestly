import type { Route } from "./+types/create";

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
import makeServerClient from "~/core/lib/supa-client.server";
import { getInstructors } from "~/features/instructors/queries";

import ProgramForm from "../../components/program-form";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const instructors = await getInstructors(client, { organizationId });
  return { instructors };
}

export default function ProgramCreateScreen({ loaderData }: Route.ComponentProps) {
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
          <h1 className="text-xl md:text-2xl font-bold">클래스 등록</h1>
          <p className="hidden md:block text-muted-foreground">
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
          <ProgramForm mode="create" instructors={instructors} />
        </CardContent>
      </Card>
    </div>
  );
}
