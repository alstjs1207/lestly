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
import { getInstructors } from "~/features/instructors/queries";
import { getProgram } from "~/features/programs/queries";

import ProgramForm from "../../components/program-form";
import { requireAdminRole } from "../../guards.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const programId = parseInt(params.programId);
  const [program, instructors] = await Promise.all([
    getProgram(client, { programId }),
    getInstructors(client, { organizationId }),
  ]);

  if (!program) {
    throw new Response("Not Found", { status: 404 });
  }

  return { program, instructors };
}

export default function ProgramEditScreen({ loaderData }: Route.ComponentProps) {
  const { program, instructors } = loaderData;

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
            instructors={instructors}
            defaultValues={{
              program_id: program.program_id,
              instructor_id: program.instructor_id || undefined,
              title: program.title,
              subtitle: program.subtitle || undefined,
              description: program.description || undefined,
              status: program.status,
              level: program.level || undefined,
              price: program.price || undefined,
              slug: program.slug || undefined,
              cover_image_url: program.cover_image_url || undefined,
              location_type: program.location_type || undefined,
              location_address: program.location_address || undefined,
              duration_minutes: program.duration_minutes || undefined,
              total_sessions: program.total_sessions || undefined,
              curriculum: (program.curriculum as any[]) || undefined,
              max_capacity: program.max_capacity || undefined,
              is_public: program.is_public || undefined,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
