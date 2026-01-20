import type { Route } from "./+types/templates";

import { useState } from "react";
import { useFetcher } from "react-router";
import { FileTextIcon, PencilIcon } from "lucide-react";

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
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
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
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { requireSuperAdmin } from "~/features/admin/guards.server";
import { getAllSuperTemplates } from "../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireSuperAdmin(client);

  const templates = await getAllSuperTemplates(adminClient);

  return { templates };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  await requireSuperAdmin(client);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateTemplate") {
    const superTemplateId = parseInt(formData.get("superTemplateId") as string);
    const name = formData.get("name") as string;
    const kakaoTemplateCode = formData.get("kakaoTemplateCode") as string;
    const content = formData.get("content") as string;
    const variablesRaw = formData.get("variables") as string;
    const defaultTiming = formData.get("defaultTiming") as "IMMEDIATE" | "SCHEDULED";
    const defaultHoursBefore = formData.get("defaultHoursBefore")
      ? parseInt(formData.get("defaultHoursBefore") as string)
      : null;
    const status = formData.get("status") as "ACTIVE" | "INACTIVE";

    let variables: string[] = [];
    try {
      variables = JSON.parse(variablesRaw);
      if (!Array.isArray(variables)) {
        variables = [];
      }
    } catch {
      variables = [];
    }

    const updates: Record<string, unknown> = {
      name,
      kakao_template_code: kakaoTemplateCode,
      content,
      variables,
      default_timing: defaultTiming,
      default_hours_before: defaultHoursBefore,
      status,
      updated_at: new Date().toISOString(),
    };

    const { error } = await adminClient
      .from("super_templates")
      .update(updates)
      .eq("super_template_id", superTemplateId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, templateId: superTemplateId };
  }

  return { success: false };
}

const templateTypeLabels: Record<string, string> = {
  STD_BOOK_ADMIN: "수강생 예약 알림 (관리자)",
  STD_CANCEL_ADMIN: "수강생 취소 알림 (관리자)",
  ADM_BOOK_STUDENT: "관리자 예약 알림 (수강생)",
  ADM_CANCEL_STUDENT: "관리자 취소 알림 (수강생)",
  SYS_CONSULT_ADMIN: "상담 신청 알림 (관리자)",
  SYS_REMIND_STUDENT: "수업 리마인더 (수강생)",
};

const sendTimingLabels: Record<string, string> = {
  IMMEDIATE: "즉시 발송",
  SCHEDULED: "예약 발송",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "활성",
  INACTIVE: "비활성",
};

export default function SuperAdminTemplatesScreen({
  loaderData,
}: Route.ComponentProps) {
  const { templates } = loaderData;
  const updateFetcher = useFetcher<{ success: boolean; templateId?: number; error?: string }>();
  const [selectedTemplate, setSelectedTemplate] = useState<typeof templates[0] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleEditClick = (template: typeof templates[0]) => {
    setSelectedTemplate(template);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileTextIcon className="h-6 w-6" />
          알림 템플릿 관리
        </h1>
        <p className="text-muted-foreground">
          마스터 템플릿을 관리합니다. 여기서 변경한 내용은 모든 조직에 적용됩니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>마스터 템플릿 목록</CardTitle>
          <CardDescription>
            등록된 알림톡 템플릿입니다. 수정 버튼을 클릭하여 템플릿 내용을 변경할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">ID</TableHead>
                <TableHead>타입</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>카카오 코드</TableHead>
                <TableHead>기본 타이밍</TableHead>
                <TableHead>기본 시간</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-[80px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.super_template_id}>
                  <TableCell className="font-mono text-sm">
                    {template.super_template_id}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {template.type}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {templateTypeLabels[template.type] || template.name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {template.kakao_template_code}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {sendTimingLabels[template.default_timing]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {template.default_hours_before
                      ? `${template.default_hours_before}시간 전`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={template.status === "ACTIVE" ? "default" : "destructive"}
                    >
                      {statusLabels[template.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(template)}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    등록된 템플릿이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>템플릿 수정</DialogTitle>
            <DialogDescription>
              {selectedTemplate &&
                (templateTypeLabels[selectedTemplate.type] || selectedTemplate.name)}{" "}
              템플릿을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <updateFetcher.Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="updateTemplate" />
              <input
                type="hidden"
                name="superTemplateId"
                value={selectedTemplate.super_template_id}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">이름</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={selectedTemplate.name}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kakaoTemplateCode">카카오 템플릿 코드</Label>
                  <Input
                    id="kakaoTemplateCode"
                    name="kakaoTemplateCode"
                    defaultValue={selectedTemplate.kakao_template_code}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">템플릿 내용</Label>
                <Textarea
                  id="content"
                  name="content"
                  rows={6}
                  defaultValue={selectedTemplate.content}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  변수는 {"{{변수명}}"} 형식으로 사용합니다.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="variables">변수 (JSON 배열)</Label>
                <Input
                  id="variables"
                  name="variables"
                  defaultValue={JSON.stringify(selectedTemplate.variables)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  예: ["studentName", "programName", "scheduledAt"]
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultTiming">기본 발송 타이밍</Label>
                  <Select
                    name="defaultTiming"
                    defaultValue={selectedTemplate.default_timing}
                  >
                    <SelectTrigger id="defaultTiming">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMMEDIATE">즉시 발송</SelectItem>
                      <SelectItem value="SCHEDULED">예약 발송</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultHoursBefore">기본 시간 (시간 전)</Label>
                  <Input
                    id="defaultHoursBefore"
                    name="defaultHoursBefore"
                    type="number"
                    min={1}
                    max={72}
                    defaultValue={selectedTemplate.default_hours_before ?? ""}
                    placeholder="예: 24"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">상태</Label>
                <Select name="status" defaultValue={selectedTemplate.status}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">활성</SelectItem>
                    <SelectItem value="INACTIVE">비활성</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {updateFetcher.data?.success === true && (
                <p className="text-sm text-green-600">저장되었습니다.</p>
              )}

              {updateFetcher.data?.success === false && updateFetcher.data.error && (
                <p className="text-sm text-destructive">{updateFetcher.data.error}</p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" disabled={updateFetcher.state !== "idle"}>
                  {updateFetcher.state !== "idle" ? "저장 중..." : "저장"}
                </Button>
              </DialogFooter>
            </updateFetcher.Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
