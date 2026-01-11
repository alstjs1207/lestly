import type { Route } from "./+types/list";

import { useState } from "react";
import { Link, useFetcher, useNavigate, useSearchParams } from "react-router";
import { MailIcon, PlusIcon, SearchIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
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
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import { getStudentEmails, getStudentsPaginated, getStudentsTotalHours } from "../../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const search = url.searchParams.get("search") || undefined;
  const stateFilter = url.searchParams.get("state") as
    | "NORMAL"
    | "GRADUATE"
    | "DELETED"
    | undefined;
  const typeFilter = url.searchParams.get("type") as
    | "EXAMINEE"
    | "DROPPER"
    | "ADULT"
    | undefined;

  const result = await getStudentsPaginated(client, {
    organizationId,
    page,
    pageSize: 20,
    search,
    stateFilter: stateFilter || undefined,
    typeFilter: typeFilter || undefined,
  });

  // 각 학생의 총 수강시간과 이메일 조회
  const studentIds = result.students.map((s) => s.profile_id);
  const [totalHours, emails] = await Promise.all([
    getStudentsTotalHours(client, { organizationId, studentIds }),
    getStudentEmails(adminClient, { studentIds }),
  ]);

  return {
    ...result,
    totalHours,
    emails,
  };
}

const stateLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  NORMAL: { label: "정상", variant: "default" },
  GRADUATE: { label: "졸업", variant: "secondary" },
  DELETED: { label: "탈퇴", variant: "destructive" },
};

const typeLabels: Record<string, string> = {
  EXAMINEE: "입시생",
  DROPPER: "재수생",
  ADULT: "성인",
};

export default function StudentListScreen({
  loaderData,
}: Route.ComponentProps) {
  const { students, totalCount, totalPages, currentPage, totalHours, emails } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const [inviteStudent, setInviteStudent] = useState<{ id: string; name: string; email?: string } | null>(null);
  const inviteFetcher = useFetcher<{ success: boolean; error?: string }>();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const search = formData.get("search") as string;
    const newParams = new URLSearchParams(searchParams);
    if (search) {
      newParams.set("search", search);
    } else {
      newParams.delete("search");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleStateFilter = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      newParams.set("state", value);
    } else {
      newParams.delete("state");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleTypeFilter = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      newParams.set("type", value);
    } else {
      newParams.delete("type");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">수강생 관리</h1>
          <p className="text-muted-foreground">
            총 {totalCount}명의 수강생이 등록되어 있습니다.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/students/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            수강생 등록
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="search"
              placeholder="이름 또는 전화번호 검색"
              defaultValue={searchParams.get("search") || ""}
              className="pl-9 w-64"
            />
          </div>
          <Button type="submit" variant="secondary">
            검색
          </Button>
        </form>

        <Select
          value={searchParams.get("state") || "all"}
          onValueChange={handleStateFilter}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="NORMAL">정상</SelectItem>
            <SelectItem value="GRADUATE">졸업</SelectItem>
            <SelectItem value="DELETED">탈퇴</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("type") || "all"}
          onValueChange={handleTypeFilter}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            <SelectItem value="EXAMINEE">입시생</SelectItem>
            <SelectItem value="DROPPER">재수생</SelectItem>
            <SelectItem value="ADULT">성인</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead className="w-24">유형</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead className="w-28">총 수강시간</TableHead>
              <TableHead className="w-32">등록일</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  등록된 수강생이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              students.map((student) => (
                <TableRow
                  key={student.profile_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/admin/students/${student.profile_id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    {student.profile_id.slice(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <Badge variant={stateLabels[student.state]?.variant || "default"}>
                      {stateLabels[student.state]?.label || student.state}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {student.type ? typeLabels[student.type] || student.type : "-"}
                  </TableCell>
                  <TableCell className="font-medium">{student.name}</TableCell>
                  <TableCell className="text-sm">{emails[student.profile_id] || "-"}</TableCell>
                  <TableCell>
                    {Math.round((totalHours[student.profile_id] || 0) * 10) / 10}시간
                  </TableCell>
                  <TableCell>
                    {new Date(student.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {student.state === "NORMAL" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInviteStudent({ id: student.profile_id, name: student.name });
                          }}
                        >
                          <MailIcon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link to={`/admin/students/${student.profile_id}`}>
                          상세
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => {
              const newParams = new URLSearchParams(searchParams);
              newParams.set("page", String(currentPage - 1));
              setSearchParams(newParams);
            }}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => {
              const newParams = new URLSearchParams(searchParams);
              newParams.set("page", String(currentPage + 1));
              setSearchParams(newParams);
            }}
          >
            다음
          </Button>
        </div>
      )}

      <Dialog open={!!inviteStudent} onOpenChange={(open) => !open && setInviteStudent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>초대 이메일 발송</DialogTitle>
            <DialogDescription>
              {inviteStudent?.name} 수강생에게 초대 이메일을 발송하시겠습니까?
              수강생은 이메일을 통해 비밀번호를 설정하고 로그인할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          {inviteFetcher.data?.success === false && (
            <p className="text-sm text-destructive">
              {inviteFetcher.data.error}
            </p>
          )}
          {inviteFetcher.data?.success === true && (
            <p className="text-sm text-green-600">
              초대 이메일이 발송되었습니다.
            </p>
          )}
          <DialogFooter>
            <inviteFetcher.Form
              method="post"
              action={`/api/admin/students/${inviteStudent?.id}/invite`}
            >
              <Button
                type="submit"
                disabled={inviteFetcher.state !== "idle"}
              >
                {inviteFetcher.state !== "idle" ? "발송 중..." : "발송"}
              </Button>
            </inviteFetcher.Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
