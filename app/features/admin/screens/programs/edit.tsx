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
import makeServerClient from "~/core/lib/supa-client.server";
import { getProgram } from "~/features/programs/queries";

import ProgramForm from "../../components/program-form";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const programId = parseInt(params.programId);
  const program = await getProgram(client, { programId });

  if (!program) {
    throw new Response("Not Found", { status: 404 });
  }

  return { program };
}

export default function ProgramEditScreen({ loaderData }: Route.ComponentProps) {
  const { program } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/admin/programs/${program.program_id}`}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">클래스 수정</h1>
          <p className="text-muted-foreground">{program.title}의 정보를 수정합니다.</p>
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
            mode="edit"
            defaultValues={{
              program_id: program.program_id,
              title: program.title,
              subtitle: program.subtitle || undefined,
              description: program.description || undefined,
              instructor_name: program.instructor_name || undefined,
              instructor_info: program.instructor_info || undefined,
              status: program.status,
              level: program.level || undefined,
              price: program.price || undefined,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
