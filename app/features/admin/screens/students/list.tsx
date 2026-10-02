import type { Route } from "./+types/list";

import {
  CalendarPlusIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  Clock3Icon,
  LinkIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PhoneIcon,
  RotateCcwIcon,
  SearchIcon,
  UserPlusIcon,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useNavigate,
  useSearchParams,
} from "react-router";

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
import { EmptyState } from "~/core/components/ui/empty-state";
import { Input } from "~/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/core/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import { getStudentsPaginated, getStudentsTotalHours } from "../../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || "1");
  const search = url.searchParams.get("search") || undefined;
  const state = url.searchParams.get("state");
  const stateFilter =
    state === "NORMAL" || state === "GRADUATE" || state === "DELETED"
      ? state
      : undefined;
  const type = url.searchParams.get("type");
  const typeFilter =
    type === "EXAMINEE" || type === "DROPPER" || type === "ADULT"
      ? type
      : undefined;

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
  const totalHours = await getStudentsTotalHours(client, {
    organizationId,
    studentIds,
  });

  return data(
    {
      ...result,
      totalHours,
    },
    { headers },
  );
}

const stateLabels: Record<
  string,
  { label: string; variant: "success" | "secondary" | "destructive" }
> = {
  NORMAL: { label: "정상", variant: "success" },
  GRADUATE: { label: "졸업", variant: "secondary" },
  DELETED: { label: "탈퇴", variant: "destructive" },
};

const typeLabels: Record<string, string> = {
  EXAMINEE: "입시생",
  DROPPER: "재수생",
  ADULT: "성인",
};

const mobileStateFilters = [
  { value: "all", label: "전체" },
  { value: "NORMAL", label: "정상" },
  { value: "GRADUATE", label: "졸업" },
  { value: "DELETED", label: "탈퇴" },
];

const mobileTypeFilters = [
  { value: "EXAMINEE", label: "입시생" },
  { value: "DROPPER", label: "재수생" },
  { value: "ADULT", label: "성인" },
];

function formatPhoneNumber(value: string | null) {
  if (!value) return "연락처 없음";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }
  return value;
}

function InviteLinkDialog({
  student,
  onClose,
}: {
  student: { id: string; name: string };
  onClose: () => void;
}) {
  const inviteFetcher = useFetcher<{
    success: boolean;
    error?: string;
    inviteUrl?: string;
    expiresAt?: string;
  }>();
  const [copied, setCopied] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>초대 링크 만들기</DialogTitle>
          <DialogDescription>
            링크를 복사해 {student.name} 수강생에게 카카오톡으로 전달하세요.
            링크는 7일 동안 유효하며 한 번만 사용할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        {inviteFetcher.data?.success === false && (
          <p className="text-destructive text-sm">{inviteFetcher.data.error}</p>
        )}
        {inviteFetcher.data?.success === true && (
          <p className="text-sm text-green-600">초대 링크가 생성되었습니다.</p>
        )}
        {inviteFetcher.data?.inviteUrl && (
          <div className="flex gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 text-xs">
              {inviteFetcher.data.inviteUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(inviteFetcher.data!.inviteUrl!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <ClipboardIcon className="size-4" />
              )}
              <span className="ml-1">{copied ? "복사됨" : "복사"}</span>
            </Button>
          </div>
        )}
        <DialogFooter>
          <inviteFetcher.Form
            method="post"
            action={`/api/admin/students/${student.id}/invite`}
          >
            <Button type="submit" disabled={inviteFetcher.state !== "idle"}>
              {inviteFetcher.state !== "idle"
                ? "생성 중..."
                : inviteFetcher.data?.inviteUrl
                  ? "새 링크 만들기"
                  : "링크 만들기"}
            </Button>
          </inviteFetcher.Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StudentListScreen({
  loaderData,
}: Route.ComponentProps) {
  const { students, totalCount, totalPages, currentPage, totalHours } =
    loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const [inviteStudent, setInviteStudent] = useState<{
    id: string;
    name: string;
    email?: string;
  } | null>(null);
  const [quickStudent, setQuickStudent] = useState<{
    id: string;
    name: string;
    phone: string | null;
    canInvite: boolean;
  } | null>(null);
  const navigate = useNavigate();
  const activeFilterCount = [
    searchParams.get("state"),
    searchParams.get("type"),
  ].filter(Boolean).length;
  const hasSearchOrFilters = Boolean(
    searchParams.get("search") || activeFilterCount,
  );

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

  const clearSearchAndFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">수강생 관리</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            총 {totalCount}명의 수강생이 등록되어 있습니다.
          </p>
        </div>
        <Button
          className="min-h-11 shrink-0 rounded-full px-4 shadow-sm"
          asChild
        >
          <Link to="/admin/students/new">
            <UserPlusIcon className="mr-1.5 h-4 w-4" />
            <span>수강생 등록</span>
          </Link>
        </Button>
      </div>

      <div className="bg-background/95 sticky top-0 z-20 -mx-4 space-y-3 border-y px-4 py-3 backdrop-blur md:static md:mx-0 md:flex md:items-center md:gap-3 md:space-y-0 md:border-0 md:bg-transparent md:p-0">
        <form onSubmit={handleSearch} className="flex gap-2 md:flex-1">
          <div className="relative min-w-0 flex-1 md:max-w-72">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              key={searchParams.get("search") || "empty-search"}
              name="search"
              placeholder="이름 또는 전화번호 검색"
              defaultValue={searchParams.get("search") || ""}
              className="h-11 w-full pl-9 md:h-9"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            className="min-h-11 md:min-h-9"
          >
            검색
          </Button>
        </form>

        <div className="hidden gap-2 md:flex">
          <Select
            value={searchParams.get("state") || "all"}
            onValueChange={handleStateFilter}
          >
            <SelectTrigger className="h-11 w-full md:h-9 md:w-32">
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
            <SelectTrigger className="h-11 w-full md:h-9 md:w-32">
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

        <div className="space-y-2 md:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <ListFilterIcon className="size-4" aria-hidden="true" />
              필터
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="rounded-full px-1.5">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            {hasSearchOrFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground min-h-9"
                onClick={clearSearchAndFilters}
              >
                <RotateCcwIcon className="size-3.5" aria-hidden="true" />
                초기화
              </Button>
            )}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mobileStateFilters.map((filter) => {
              const active =
                (searchParams.get("state") || "all") === filter.value;
              return (
                <Button
                  key={filter.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="min-h-10 shrink-0 rounded-full"
                  onClick={() => handleStateFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              );
            })}
            <span className="bg-border my-1 w-px shrink-0" aria-hidden="true" />
            {mobileTypeFilters.map((filter) => {
              const active = searchParams.get("type") === filter.value;
              return (
                <Button
                  key={filter.value}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="sm"
                  className="min-h-10 shrink-0 rounded-full"
                  onClick={() =>
                    handleTypeFilter(active ? "all" : filter.value)
                  }
                >
                  {filter.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {students.length === 0 ? (
          <div className="bg-card rounded-xl border">
            <EmptyState
              icon={hasSearchOrFilters ? SearchIcon : UserPlusIcon}
              title={
                hasSearchOrFilters
                  ? "조건에 맞는 수강생이 없습니다."
                  : "아직 등록된 수강생이 없습니다."
              }
              description={
                hasSearchOrFilters
                  ? "검색어나 필터를 바꾸거나 초기화해 보세요."
                  : "이름과 전화번호만 입력하면 바로 등록할 수 있습니다."
              }
              action={
                hasSearchOrFilters ? (
                  <Button variant="outline" onClick={clearSearchAndFilters}>
                    필터 초기화
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/admin/students/new">수강생 등록</Link>
                  </Button>
                )
              }
            />
          </div>
        ) : (
          students.map((student) => (
            <article
              key={student.profile_id}
              className="bg-card overflow-hidden rounded-xl border shadow-sm"
            >
              <button
                type="button"
                className="group block w-full p-4 text-left"
                onClick={() =>
                  setQuickStudent({
                    id: student.profile_id,
                    name: student.name,
                    phone: student.phone,
                    canInvite:
                      student.state === "NORMAL" && !student.auth_user_id,
                  })
                }
                aria-label={`${student.name} 빠른 작업 열기`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="ring-background mt-1 size-3 shrink-0 rounded-full ring-2"
                    style={{ backgroundColor: student.color || "#EA580C" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{student.name}</h2>
                      <Badge
                        variant={
                          stateLabels[student.state]?.variant || "secondary"
                        }
                      >
                        {stateLabels[student.state]?.label || student.state}
                      </Badge>
                      {student.type && (
                        <Badge variant="info">
                          {typeLabels[student.type] || student.type}
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-sm">
                      <PhoneIcon className="size-3.5" aria-hidden="true" />
                      <span>{formatPhoneNumber(student.phone)}</span>
                    </div>
                    <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                      <Clock3Icon className="size-3.5" aria-hidden="true" />
                      <span>
                        누적{" "}
                        {Math.round(
                          (totalHours[student.profile_id] || 0) * 10,
                        ) / 10}
                        시간
                      </span>
                      {student.contact_email && (
                        <span className="truncate">
                          · {student.contact_email}
                        </span>
                      )}
                    </div>
                  </div>
                  <MoreHorizontalIcon className="text-muted-foreground mt-2 size-5 shrink-0" />
                </div>
                <span className="text-muted-foreground mt-3 block border-t pt-2 text-right text-xs">
                  눌러서 빠른 작업
                </span>
              </button>
            </article>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-20 md:table-cell">ID</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead className="w-24">유형</TableHead>
              <TableHead>이름</TableHead>
              <TableHead className="hidden md:table-cell">전화번호</TableHead>
              <TableHead className="hidden md:table-cell">이메일</TableHead>
              <TableHead className="hidden w-28 md:table-cell">
                총 수강시간
              </TableHead>
              <TableHead className="hidden w-32 md:table-cell">
                등록일
              </TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState
                    icon={hasSearchOrFilters ? SearchIcon : UserPlusIcon}
                    title={
                      hasSearchOrFilters
                        ? "조건에 맞는 수강생이 없습니다."
                        : "아직 등록된 수강생이 없습니다."
                    }
                    description={
                      hasSearchOrFilters
                        ? "검색어나 필터를 바꾸거나 초기화해 보세요."
                        : "수강생을 등록하면 이곳에서 관리할 수 있습니다."
                    }
                    compact
                  />
                </TableCell>
              </TableRow>
            ) : (
              students.map((student) => (
                <TableRow
                  key={student.profile_id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() =>
                    navigate(`/admin/students/${student.profile_id}`)
                  }
                >
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {student.profile_id.slice(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={stateLabels[student.state]?.variant || "default"}
                    >
                      {stateLabels[student.state]?.label || student.state}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {student.type
                      ? typeLabels[student.type] || student.type
                      : "-"}
                  </TableCell>
                  <TableCell className="font-medium">{student.name}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {student.phone ? (
                      <a
                        href={`tel:${student.phone.replace(/\D/g, "")}`}
                        className="font-medium hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {formatPhoneNumber(student.phone)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {student.contact_email || "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {Math.round((totalHours[student.profile_id] || 0) * 10) /
                      10}
                    시간
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {new Date(student.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {student.state === "NORMAL" && !student.auth_user_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 min-w-11"
                          aria-label={`${student.name} 초대 링크 생성`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInviteStudent({
                              id: student.profile_id,
                              name: student.name,
                            });
                          }}
                        >
                          <LinkIcon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
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
          <span className="text-muted-foreground text-sm">
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

      {inviteStudent && (
        <InviteLinkDialog
          key={inviteStudent.id}
          student={inviteStudent}
          onClose={() => setInviteStudent(null)}
        />
      )}

      <Sheet
        open={!!quickStudent}
        onOpenChange={(open) => !open && setQuickStudent(null)}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <SheetHeader className="text-left">
            <SheetTitle>{quickStudent?.name}</SheetTitle>
            <SheetDescription>
              필요한 작업을 바로 선택할 수 있습니다.
            </SheetDescription>
          </SheetHeader>
          {quickStudent && (
            <div className="grid gap-2 px-4 pb-2">
              {quickStudent.phone && (
                <Button
                  variant="outline"
                  className="min-h-12 justify-start"
                  asChild
                >
                  <a href={`tel:${quickStudent.phone.replace(/\D/g, "")}`}>
                    <PhoneIcon className="size-4" aria-hidden="true" />
                    {formatPhoneNumber(quickStudent.phone)} 전화하기
                  </a>
                </Button>
              )}
              <Button className="min-h-12 justify-start" asChild>
                <Link
                  to={`/admin/schedules/new?studentId=${quickStudent.id}`}
                  onClick={() => setQuickStudent(null)}
                >
                  <CalendarPlusIcon className="size-4" aria-hidden="true" />
                  일정 등록
                </Link>
              </Button>
              {quickStudent.canInvite && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 justify-start"
                  onClick={() => {
                    setInviteStudent({
                      id: quickStudent.id,
                      name: quickStudent.name,
                    });
                    setQuickStudent(null);
                  }}
                >
                  <LinkIcon className="size-4" aria-hidden="true" />
                  초대 링크 만들기
                </Button>
              )}
              <Button
                variant="ghost"
                className="min-h-12 justify-between"
                asChild
              >
                <Link
                  to={`/admin/students/${quickStudent.id}`}
                  onClick={() => setQuickStudent(null)}
                >
                  상세 정보 보기
                  <ChevronRightIcon className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
