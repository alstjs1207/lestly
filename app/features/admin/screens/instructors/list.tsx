import type { Route } from "./+types/list";

import { Link } from "react-router";
import { UserPlusIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { getInstructors } from "~/features/instructors/queries";

import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const instructors = await getInstructors(client, { organizationId });

  return { instructors };
}

export default function InstructorListScreen({
  loaderData,
}: Route.ComponentProps) {
  const { instructors } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">강사 관리</h1>
          <p className="hidden md:block text-muted-foreground">
            총 {instructors.length}명의 강사가 등록되어 있습니다.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/instructors/new">
            <UserPlusIcon className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">강사 등록</span>
          </Link>
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>강사명</TableHead>
              <TableHead className="hidden md:table-cell">소개</TableHead>
              <TableHead className="hidden md:table-cell w-32">등록일</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instructors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  등록된 강사가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              instructors.map((instructor) => (
                <TableRow key={instructor.instructor_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {instructor.photo_url && (
                        <img
                          src={instructor.photo_url}
                          alt={instructor.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      )}
                      <span className="font-medium">{instructor.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-md truncate">
                    {instructor.info || "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {new Date(instructor.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/admin/instructors/${instructor.instructor_id}/edit`}>
                        수정
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
