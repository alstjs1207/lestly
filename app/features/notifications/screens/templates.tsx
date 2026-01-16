import type { Route } from "./+types/templates";

import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { ChevronLeftIcon, SendIcon } from "lucide-react";

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
import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole } from "~/features/admin/guards.server";

import { getTemplatesWithOrgSettings, getTodayTestSendCount, upsertOrgTemplate } from "../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId, user } = await requireAdminRole(client);

  const [templates, testSendCount] = await Promise.all([
    getTemplatesWithOrgSettings(client, { organizationId }),
    getTodayTestSendCount(client, { organizationId, profileId: user.id }),
  ]);

  return {
    templates,
    testSendCount,
    maxTestSendPerDay: 5,
    organizationId,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateTemplate") {
    const superTemplateId = parseInt(formData.get("superTemplateId") as string);
    const sendTiming = formData.get("sendTiming") as "IMMEDIATE" | "SCHEDULED";
    const hoursBefore = formData.get("hoursBefore") ? parseInt(formData.get("hoursBefore") as string) : undefined;
    const scheduledSendTime = formData.get("scheduledSendTime") as string | undefined;
    const batchStartHour = formData.get("batchStartHour") ? parseInt(formData.get("batchStartHour") as string) : undefined;

    await upsertOrgTemplate(client, {
      organizationId,
      superTemplateId,
      sendTiming,
      hoursBefore: hoursBefore || undefined,
      scheduledSendTime: scheduledSendTime || undefined,
      batchStartHour: batchStartHour || undefined,
    });

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

export default function TemplatesScreen({
  loaderData,
}: Route.ComponentProps) {
  const { templates, testSendCount, maxTestSendPerDay } = loaderData;
  const updateFetcher = useFetcher<{ success: boolean; templateId?: number }>();
  const testSendFetcher = useFetcher<{ success: boolean; error?: string }>();
  const [selectedTemplate, setSelectedTemplate] = useState<typeof templates[0] | null>(null);

  const canTestSend = testSendCount < maxTestSendPerDay;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/notifications">
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">템플릿 설정</h1>
          <p className="text-muted-foreground">
            알림톡 템플릿의 발송 설정을 관리합니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>오늘 테스트 발송: {testSendCount} / {maxTestSendPerDay}회</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.super_template_id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {templateTypeLabels[template.type] || template.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {template.kakao_template_code}
                  </CardDescription>
                </div>
                <Badge variant={template.orgSettings ? "default" : "outline"}>
                  {template.orgSettings ? "설정됨" : "기본값"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm">
                <p className="text-muted-foreground">발송 타이밍</p>
                <p className="font-medium">
                  {sendTimingLabels[template.orgSettings?.send_timing || template.default_timing] || "-"}
                </p>
              </div>

              {(template.orgSettings?.send_timing || template.default_timing) === "SCHEDULED" && (
                <>
                  {template.type === "SYS_REMIND_STUDENT" && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">발송 시간</p>
                      <p className="font-medium">
                        수업 {template.orgSettings?.hours_before ?? template.default_hours_before ?? 24}시간 전
                      </p>
                    </div>
                  )}
                  {(template.type === "ADM_BOOK_STUDENT" || template.type === "ADM_CANCEL_STUDENT") && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">배치 발송 시간</p>
                      <p className="font-medium">
                        {template.orgSettings?.scheduled_send_time || "09:00"}
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="text-sm">
                <p className="text-muted-foreground">사용 변수</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Array.isArray(template.variables) && (template.variables as string[]).map((v) => (
                    <Badge key={v} variant="secondary" className="text-xs">
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedTemplate(template)}
                    >
                      설정
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>템플릿 설정</DialogTitle>
                      <DialogDescription>
                        {templateTypeLabels[template.type] || template.name} 템플릿의 발송 설정을 변경합니다.
                      </DialogDescription>
                    </DialogHeader>
                    <updateFetcher.Form method="post" className="space-y-4">
                      <input type="hidden" name="intent" value="updateTemplate" />
                      <input type="hidden" name="superTemplateId" value={template.super_template_id} />

                      <div className="space-y-2">
                        <Label>발송 타이밍</Label>
                        <Select
                          name="sendTiming"
                          defaultValue={template.orgSettings?.send_timing || template.default_timing}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IMMEDIATE">즉시 발송</SelectItem>
                            <SelectItem value="SCHEDULED">예약 발송</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {template.type === "SYS_REMIND_STUDENT" && (
                        <div className="space-y-2">
                          <Label>수업 몇 시간 전 발송</Label>
                          <Input
                            type="number"
                            name="hoursBefore"
                            defaultValue={template.orgSettings?.hours_before ?? template.default_hours_before ?? 24}
                            min={1}
                            max={72}
                          />
                          <p className="text-xs text-muted-foreground">
                            1~72 시간 사이의 값을 입력하세요.
                          </p>
                        </div>
                      )}

                      {(template.type === "ADM_BOOK_STUDENT" || template.type === "ADM_CANCEL_STUDENT") && (
                        <>
                          <div className="space-y-2">
                            <Label>배치 발송 시간</Label>
                            <Input
                              type="time"
                              name="scheduledSendTime"
                              defaultValue={template.orgSettings?.scheduled_send_time || "09:00"}
                            />
                            <p className="text-xs text-muted-foreground">
                              야간(해당 시간 이후)에 생성된 알림은 다음날 이 시간에 일괄 발송됩니다.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label>야간 시작 시간</Label>
                            <Select
                              name="batchStartHour"
                              defaultValue={String(template.orgSettings?.batch_start_hour ?? 23)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 24 }, (_, i) => (
                                  <SelectItem key={i} value={String(i)}>
                                    {String(i).padStart(2, "0")}:00
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              이 시간 이후에 생성된 알림은 예약 발송됩니다.
                            </p>
                          </div>
                        </>
                      )}

                      {updateFetcher.data?.success && updateFetcher.data.templateId === template.super_template_id && (
                        <p className="text-sm text-green-600">저장되었습니다.</p>
                      )}

                      <DialogFooter>
                        <Button
                          type="submit"
                          disabled={updateFetcher.state !== "idle"}
                        >
                          {updateFetcher.state !== "idle" ? "저장 중..." : "저장"}
                        </Button>
                      </DialogFooter>
                    </updateFetcher.Form>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canTestSend}
                    >
                      <SendIcon className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>테스트 발송</DialogTitle>
                      <DialogDescription>
                        {templateTypeLabels[template.type] || template.name} 템플릿을 테스트 발송합니다.
                        테스트 알림은 로그인한 관리자의 전화번호로 발송됩니다.
                      </DialogDescription>
                    </DialogHeader>
                    <testSendFetcher.Form method="post" action="/api/notifications/test-send" className="space-y-4">
                      <input type="hidden" name="superTemplateId" value={template.super_template_id} />

                      <div className="rounded-md bg-muted p-4">
                        <p className="text-sm font-medium mb-2">템플릿 내용</p>
                        <p className="text-sm whitespace-pre-wrap">{template.content}</p>
                      </div>

                      {testSendFetcher.data?.success === false && (
                        <p className="text-sm text-destructive">
                          {testSendFetcher.data.error || "발송에 실패했습니다."}
                        </p>
                      )}

                      {testSendFetcher.data?.success === true && (
                        <p className="text-sm text-green-600">
                          테스트 알림이 발송되었습니다.
                        </p>
                      )}

                      <DialogFooter>
                        <Button
                          type="submit"
                          disabled={testSendFetcher.state !== "idle" || !canTestSend}
                        >
                          {testSendFetcher.state !== "idle" ? "발송 중..." : "테스트 발송"}
                        </Button>
                      </DialogFooter>
                    </testSendFetcher.Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">등록된 템플릿이 없습니다.</p>
        </div>
      )}
    </div>
  );
}
