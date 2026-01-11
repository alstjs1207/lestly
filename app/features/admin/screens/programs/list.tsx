import type { Route } from "./+types/list";

import { Link, useSearchParams } from "react-router";
import { PlusIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { getPrograms, countSchedulesByProgram } from "~/features/programs/queries";

import { requireAdminRole } from "../../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") as
    | "DRAFT"
    | "ACTIVE"
    | "ARCHIVED"
    | undefined;

  let programs = await getPrograms(client, { organizationId });

  if (statusFilter) {
    programs = programs.filter(p => p.status === statusFilter);
  }

  const scheduleCounts = await countSchedulesByProgram(client, { organizationId });

  return {
    programs,
    scheduleCounts,
    totalCount: programs.length,
  };
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  DRAFT: { label: "초안", variant: "outline" },
  ACTIVE: { label: "활성", variant: "default" },
  ARCHIVED: { label: "보관됨", variant: "secondary" },
};

const levelLabels: Record<string, string> = {
  BEGINNER: "초급",
  INTERMEDIATE: "중급",
  ADVANCED: "고급",
};

export default function ProgramListScreen({
  loaderData,
}: Route.ComponentProps) {
  const { programs, scheduleCounts, totalCount } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const handleStatusFilter = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      newParams.set("status", value);
    } else {
      newParams.delete("status");
    }
    setSearchParams(newParams);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">클래스 관리</h1>
          <p className="text-muted-foreground">
            총 {totalCount}개의 클래스가 등록되어 있습니다.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/programs/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            클래스 등록
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Select
          value={searchParams.get("status") || "all"}
          onValueChange={handleStatusFilter}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="DRAFT">초안</SelectItem>
            <SelectItem value="ACTIVE">활성</SelectItem>
            <SelectItem value="ARCHIVED">보관됨</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>클래스명</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead>강사명</TableHead>
              <TableHead className="w-24">난이도</TableHead>
              <TableHead className="w-28">가격</TableHead>
              <TableHead className="w-24">스케줄 수</TableHead>
              <TableHead className="w-32">등록일</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  등록된 클래스가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              programs.map((program) => (
                <TableRow key={program.program_id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{program.title}</div>
                      {program.subtitle && (
                        <div className="text-sm text-muted-foreground">
                          {program.subtitle}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusLabels[program.status]?.variant || "default"}>
                      {statusLabels[program.status]?.label || program.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{program.instructor_name || "-"}</TableCell>
                  <TableCell>
                    {program.level ? levelLabels[program.level] || program.level : "-"}
                  </TableCell>
                  <TableCell>
                    {program.price ? `${program.price.toLocaleString()}원` : "-"}
                  </TableCell>
                  <TableCell>
                    {scheduleCounts[program.program_id] || 0}개
                  </TableCell>
                  <TableCell>
                    {new Date(program.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/admin/programs/${program.program_id}`}>
                        상세
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
