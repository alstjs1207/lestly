import type { Route } from "./+types/detail";

import { Link, useFetcher } from "react-router";
import { ChevronLeftIcon, RefreshCwIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Label } from "~/core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole, requireNotificationsEnabled } from "~/features/admin/guards.server";

import { getNotificationById, updateConsultNotification } from "../queries";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  await requireNotificationsEnabled(organizationId);

  const notificationId = parseInt(params.notificationId);
  const notification = await getNotificationById(client, {
    organizationId,
    notificationId,
  });

  return { notification };
}

export async function action({ request, params }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  await requireNotificationsEnabled(organizationId);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateConsult") {
    const consultStatus = formData.get("consultStatus") as "WAITING" | "COMPLETED" | undefined;
    const consultResult = formData.get("consultResult") as "SUCCESS" | "FAILED" | undefined;
    const consultNotes = formData.get("consultNotes") as string | undefined;

    await updateConsultNotification(client, {
      organizationId,
      notificationId: parseInt(params.notificationId),
      consultStatus: consultStatus || undefined,
      consultResult: consultResult || undefined,
      consultNotes,
    });

    return { success: true };
  }

  return { success: false };
}

const typeLabels: Record<string, { label: string; variant: "default" | "secondary" }> = {
  ALIMTALK: { label: "알림톡", variant: "default" },
  CONSULT_REQUEST: { label: "상담 신청", variant: "secondary" },
};

const alimtalkStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { label: "대기", variant: "outline" },
  SENT: { label: "발송 완료", variant: "default" },
  FAILED: { label: "발송 실패", variant: "destructive" },
};

const emailStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { label: "대기", variant: "outline" },
  SENT: { label: "발송 완료", variant: "default" },
  FAILED: { label: "발송 실패", variant: "destructive" },
  SKIPPED: { label: "건너뜀", variant: "secondary" },
};

const consultStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  WAITING: { label: "상담 대기", variant: "outline" },
  COMPLETED: { label: "상담 완료", variant: "default" },
};

const consultResultLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  SUCCESS: { label: "등록 성공", variant: "default" },
  FAILED: { label: "등록 실패", variant: "destructive" },
};

export default function NotificationDetailScreen({
  loaderData,
}: Route.ComponentProps) {
  const { notification } = loaderData;
  const updateFetcher = useFetcher<{ success: boolean }>();
  const resendFetcher = useFetcher();

  const isAlimtalk = notification.type === "ALIMTALK";
  const isConsult = notification.type === "CONSULT_REQUEST";

  const getStatusBadges = () => {
    if (isConsult && notification.consult_status) {
      const status = consultStatusLabels[notification.consult_status];
      return <Badge variant={status?.variant || "default"}>{status?.label || notification.consult_status}</Badge>;
    }

    if (isAlimtalk) {
      const badges = [];
      if (notification.alimtalk_status) {
        const alimtalkStatus = alimtalkStatusLabels[notification.alimtalk_status];
        badges.push(
          <Badge key="alimtalk" variant={alimtalkStatus?.variant || "default"} className="text-xs">
            알림톡: {alimtalkStatus?.label || notification.alimtalk_status}
          </Badge>
        );
      }
      if (notification.email_status) {
        const emailStatus = emailStatusLabels[notification.email_status];
        badges.push(
          <Badge key="email" variant={emailStatus?.variant || "default"} className="text-xs">
            이메일: {emailStatus?.label || notification.email_status}
          </Badge>
        );
      }
      return badges.length > 0 ? <div className="flex flex-wrap gap-1">{badges}</div> : null;
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/notifications">
              <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">알림 상세</h1>
              <Badge variant={typeLabels[notification.type]?.variant || "default"}>
                {typeLabels[notification.type]?.label || notification.type}
              </Badge>
              {getStatusBadges()}
            </div>
            <p className="text-muted-foreground">
              {new Date(notification.created_at).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
        {isAlimtalk && notification.alimtalk_status === "FAILED" && (
          <resendFetcher.Form method="post" action="/api/notifications/test-send">
            <input type="hidden" name="notificationId" value={notification.notification_id} />
            <Button
              type="submit"
              variant="outline"
              disabled={resendFetcher.state !== "idle"}
            >
              <RefreshCwIcon className="mr-2 h-4 w-4" />
              재발송
            </Button>
          </resendFetcher.Form>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>수신자 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">이름</Label>
                <p className="font-medium">{notification.recipient_name || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">전화번호</Label>
                <p className="font-medium">{notification.recipient_phone}</p>
              </div>
            </div>
            {notification.recipient_email && (
              <div>
                <Label className="text-muted-foreground">이메일</Label>
                <p className="font-medium">{notification.recipient_email}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isAlimtalk && (
          <Card>
            <CardHeader>
              <CardTitle>알림톡 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">템플릿 코드</Label>
                <p className="font-medium">{notification.alimtalk_template_code || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">발송 모드</Label>
                <p className="font-medium">
                  {notification.send_mode === "TEST" ? "테스트" : "운영"}
                </p>
              </div>
              {notification.alimtalk_sent_at && (
                <div>
                  <Label className="text-muted-foreground">발송 시각</Label>
                  <p className="font-medium">
                    {new Date(notification.alimtalk_sent_at).toLocaleString("ko-KR")}
                  </p>
                </div>
              )}
              {notification.alimtalk_status === "FAILED" && (
                <>
                  <div>
                    <Label className="text-muted-foreground">에러 코드</Label>
                    <p className="font-medium text-destructive">
                      {notification.alimtalk_error_code || "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">에러 메시지</Label>
                    <p className="font-medium text-destructive">
                      {notification.alimtalk_error_message || "-"}
                    </p>
                  </div>
                </>
              )}
              {notification.alimtalk_variables && (
                <div>
                  <Label className="text-muted-foreground">변수</Label>
                  <pre className="mt-1 rounded-md bg-muted p-2 text-sm overflow-auto">
                    {JSON.stringify(notification.alimtalk_variables, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isAlimtalk && notification.email_status && (
          <Card>
            <CardHeader>
              <CardTitle>이메일 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">발송 상태</Label>
                <div className="mt-1">
                  <Badge variant={emailStatusLabels[notification.email_status]?.variant || "default"}>
                    {emailStatusLabels[notification.email_status]?.label || notification.email_status}
                  </Badge>
                </div>
              </div>
              {notification.email_sent_at && (
                <div>
                  <Label className="text-muted-foreground">발송 시각</Label>
                  <p className="font-medium">
                    {new Date(notification.email_sent_at).toLocaleString("ko-KR")}
                  </p>
                </div>
              )}
              {notification.email_status === "FAILED" && notification.email_error_message && (
                <div>
                  <Label className="text-muted-foreground">에러 메시지</Label>
                  <p className="font-medium text-destructive">
                    {notification.email_error_message}
                  </p>
                </div>
              )}
              {notification.email_status === "SKIPPED" && notification.email_error_message && (
                <div>
                  <Label className="text-muted-foreground">건너뜀 사유</Label>
                  <p className="font-medium text-muted-foreground">
                    {notification.email_error_message}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isConsult && (
          <Card>
            <CardHeader>
              <CardTitle>상담 정보</CardTitle>
              <CardDescription>상담 상태와 결과를 수정할 수 있습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <updateFetcher.Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="updateConsult" />

                {notification.consult_message && (
                  <div>
                    <Label className="text-muted-foreground">상담 메시지</Label>
                    <p className="font-medium mt-1">{notification.consult_message}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="consultStatus">상담 상태</Label>
                    <Select
                      name="consultStatus"
                      defaultValue={notification.consult_status || "WAITING"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WAITING">상담 대기</SelectItem>
                        <SelectItem value="COMPLETED">상담 완료</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consultResult">최종 결과</Label>
                    <Select
                      name="consultResult"
                      defaultValue={notification.consult_result || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SUCCESS">등록 성공</SelectItem>
                        <SelectItem value="FAILED">등록 실패</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consultNotes">메모</Label>
                  <Textarea
                    id="consultNotes"
                    name="consultNotes"
                    defaultValue={notification.consult_notes || ""}
                    placeholder="상담 내용이나 메모를 입력하세요"
                    rows={4}
                  />
                </div>

                {notification.consult_completed_at && (
                  <div>
                    <Label className="text-muted-foreground">상담 완료 시각</Label>
                    <p className="font-medium">
                      {new Date(notification.consult_completed_at).toLocaleString("ko-KR")}
                    </p>
                  </div>
                )}

                {updateFetcher.data?.success && (
                  <p className="text-sm text-green-600">저장되었습니다.</p>
                )}

                <Button
                  type="submit"
                  disabled={updateFetcher.state !== "idle"}
                >
                  {updateFetcher.state !== "idle" ? "저장 중..." : "저장"}
                </Button>
              </updateFetcher.Form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
