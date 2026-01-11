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

import ProgramForm from "../../components/program-form";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireAdminRole(client);
  return {};
}

export default function ProgramCreateScreen() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/programs">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">클래스 등록</h1>
          <p className="text-muted-foreground">
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
          <ProgramForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
