import type { Route } from "./+types/detail";

import { Link, useFetcher } from "react-router";
import { ChevronLeftIcon, EditIcon, ExternalLinkIcon, TrashIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/core/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/core/components/ui/tooltip";
import makeServerClient from "~/core/lib/supa-client.server";
import { getProgram, hasSchedules } from "~/features/programs/queries";

import { requireAdminRole } from "../../guards.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const programId = parseInt(params.programId);
  const program = await getProgram(client, { programId });

  if (!program) {
    throw new Response("Not Found", { status: 404 });
  }

  const programHasSchedules = await hasSchedules(client, { programId });

  return { program, hasSchedules: programHasSchedules };
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

const locationTypeLabels: Record<string, string> = {
  online: "온라인",
  offline: "오프라인",
};

interface CurriculumItem {
  session: number;
  title: string;
  description?: string;
}

export default function ProgramDetailScreen({
  loaderData,
}: Route.ComponentProps) {
  const { program, hasSchedules: programHasSchedules } = loaderData;
  const deleteFetcher = useFetcher();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/programs">
              <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{program.title}</h1>
              <Badge variant={statusLabels[program.status]?.variant || "default"}>
                {statusLabels[program.status]?.label || program.status}
              </Badge>
            </div>
            {program.subtitle && (
              <p className="text-muted-foreground">{program.subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/admin/programs/${program.program_id}/edit`}>
              <EditIcon className="mr-2 h-4 w-4" />
              수정
            </Link>
          </Button>
          {programHasSchedules ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="destructive" disabled>
                      <TrashIcon className="mr-2 h-4 w-4" />
                      삭제
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>스케줄이 존재하는 클래스는 삭제할 수 없습니다.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <TrashIcon className="mr-2 h-4 w-4" />
                  삭제
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>클래스 삭제</DialogTitle>
                  <DialogDescription>
                    &quot;{program.title}&quot; 클래스를 삭제하시겠습니까?
                    이 작업은 되돌릴 수 없습니다.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <deleteFetcher.Form
                    method="post"
                    action={`/api/admin/programs/${program.program_id}/delete`}
                  >
                    <Button type="submit" variant="destructive">
                      삭제
                    </Button>
                  </deleteFetcher.Form>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">클래스명</p>
                <p className="font-medium">{program.title}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">상태</p>
                <Badge variant={statusLabels[program.status]?.variant || "default"}>
                  {statusLabels[program.status]?.label || program.status}
                </Badge>
              </div>
              {program.subtitle && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">부제목</p>
                  <p className="font-medium">{program.subtitle}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">난이도</p>
                <p className="font-medium">
                  {program.level ? levelLabels[program.level] || program.level : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">가격</p>
                <p className="font-medium">
                  {program.price ? `${program.price.toLocaleString()}원` : "-"}
                </p>
              </div>
            </div>
            {program.description && (
              <div>
                <p className="text-sm text-muted-foreground">클래스 설명</p>
                <p className="font-medium whitespace-pre-wrap">
                  {program.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>강사 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">강사명</p>
              <p className="font-medium">{program.instructor?.name || "-"}</p>
            </div>
            {program.instructor?.info && (
              <div>
                <p className="text-sm text-muted-foreground">강사 소개</p>
                <p className="font-medium whitespace-pre-wrap">
                  {program.instructor.info}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 공개 설정 & 클래스 운영 정보 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>공개 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">공개 여부</p>
                <Badge variant={program.is_public ? "default" : "outline"}>
                  {program.is_public ? "공개" : "비공개"}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">공개 URL</p>
                {program.slug ? (
                  <a
                    href={`/class/${program.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                  >
                    /class/{program.slug}
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="font-medium text-muted-foreground">-</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>클래스 운영 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">진행 방식</p>
                <p className="font-medium">
                  {program.location_type ? locationTypeLabels[program.location_type] || program.location_type : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">최대 인원</p>
                <p className="font-medium">
                  {program.max_capacity ? `${program.max_capacity}명` : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">수업 시간</p>
                <p className="font-medium">
                  {program.duration_minutes ? `${program.duration_minutes}분` : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 회차</p>
                <p className="font-medium">
                  {program.total_sessions ? `${program.total_sessions}회` : "-"}
                </p>
              </div>
            </div>
            {program.location_type === "offline" && program.location_address && (
              <div>
                <p className="text-sm text-muted-foreground">장소</p>
                <p className="font-medium">{program.location_address}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 이미지 정보 */}
      {(program.thumbnail_url || program.cover_image_url) && (
        <Card>
          <CardHeader>
            <CardTitle>이미지</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {program.thumbnail_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">썸네일</p>
                  <img
                    src={program.thumbnail_url}
                    alt="썸네일"
                    className="w-full max-w-xs rounded-lg border object-cover"
                  />
                </div>
              )}
              {program.cover_image_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">커버 이미지</p>
                  <img
                    src={program.cover_image_url}
                    alt="커버 이미지"
                    className="w-full max-w-md rounded-lg border object-cover"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 커리큘럼 */}
      {program.curriculum && (program.curriculum as unknown as CurriculumItem[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>커리큘럼</CardTitle>
            <CardDescription>총 {(program.curriculum as unknown as CurriculumItem[]).length}개 세션</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(program.curriculum as unknown as CurriculumItem[]).map((item, index) => (
                <div key={index} className="flex gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {item.session}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.title}</p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>등록 정보</CardTitle>
          <CardDescription>클래스 등록 및 수정 기록</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">등록일</p>
              <p className="font-medium">
                {new Date(program.created_at).toLocaleString("ko-KR")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">최종 수정일</p>
              <p className="font-medium">
                {new Date(program.updated_at).toLocaleString("ko-KR")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
