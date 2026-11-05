import type { Route } from "./+types/detail";

import { ChevronLeftIcon, RefreshCwIcon } from "lucide-react";
import { Link, redirect, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Label } from "~/core/components/ui/label";
import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  requireAdminRole,
  requireNotificationsEnabled,
} from "~/features/admin/guards.server";

import { getNotificationById } from "../queries";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const notificationId = parseInt(params.notificationId);
  const notification = await getNotificationById(client, {
    organizationId,
    notificationId,
  });

  if (notification.type === "CONSULT_REQUEST")
    return redirect(`/admin/consultations/${notification.notification_id}`);
  await requireNotificationsEnabled(organizationId);
  return { notification };
}

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  await requireNotificationsEnabled(organizationId);

  return redirect(`/admin/consultations/${params.notificationId}`);
}

const typeLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" }
> = {
  ALIMTALK: { label: "알림톡", variant: "default" },
  CONSULT_REQUEST: { label: "상담 신청", variant: "secondary" },
};

const alimtalkStatusLabels: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDING: { label: "대기", variant: "outline" },
  SENT: { label: "발송 완료", variant: "default" },
  FAILED: { label: "발송 실패", variant: "destructive" },
};

const emailStatusLabels: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDING: { label: "대기", variant: "outline" },
  SENT: { label: "발송 완료", variant: "default" },
  FAILED: { label: "발송 실패", variant: "destructive" },
  SKIPPED: { label: "건너뜀", variant: "secondary" },
};

const consultStatusLabels: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  WAITING: { label: "상담 대기", variant: "outline" },
  COMPLETED: { label: "상담 완료", variant: "default" },
};

export default function NotificationDetailScreen({
  loaderData,
}: Route.ComponentProps) {
  const { notification } = loaderData;
  const resendFetcher = useFetcher();

  const isAlimtalk = notification.type === "ALIMTALK";
  const isConsult = notification.type === "CONSULT_REQUEST";

  const getStatusBadges = () => {
    if (isConsult && notification.consult_status) {
      const status = consultStatusLabels[notification.consult_status];
      return (
        <Badge variant={status?.variant || "default"}>
          {status?.label || notification.consult_status}
        </Badge>
      );
    }

    if (isAlimtalk) {
      const badges = [];
      if (notification.alimtalk_status) {
        const alimtalkStatus =
          alimtalkStatusLabels[notification.alimtalk_status];
        badges.push(
          <Badge
            key="alimtalk"
            variant={alimtalkStatus?.variant || "default"}
            className="text-xs"
          >
            알림톡: {alimtalkStatus?.label || notification.alimtalk_status}
          </Badge>,
        );
      }
      if (notification.email_status) {
        const emailStatus = emailStatusLabels[notification.email_status];
        badges.push(
          <Badge
            key="email"
            variant={emailStatus?.variant || "default"}
            className="text-xs"
          >
            이메일: {emailStatus?.label || notification.email_status}
          </Badge>,
        );
      }
      return badges.length > 0 ? (
        <div className="flex flex-wrap gap-1">{badges}</div>
      ) : null;
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
              <Badge
                variant={typeLabels[notification.type]?.variant || "default"}
              >
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
          <resendFetcher.Form
            method="post"
            action="/api/notifications/test-send"
          >
            <input
              type="hidden"
              name="notificationId"
              value={notification.notification_id}
            />
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
                <p className="font-medium">
                  {notification.recipient_name || "-"}
                </p>
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
                <p className="font-medium">
                  {notification.alimtalk_template_code || "-"}
                </p>
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
                    {new Date(notification.alimtalk_sent_at).toLocaleString(
                      "ko-KR",
                    )}
                  </p>
                </div>
              )}
              {notification.alimtalk_status === "FAILED" && (
                <>
                  <div>
                    <Label className="text-muted-foreground">에러 코드</Label>
                    <p className="text-destructive font-medium">
                      {notification.alimtalk_error_code || "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">에러 메시지</Label>
                    <p className="text-destructive font-medium">
                      {notification.alimtalk_error_message || "-"}
                    </p>
                  </div>
                </>
              )}
              {notification.alimtalk_variables && (
                <div>
                  <Label className="text-muted-foreground">변수</Label>
                  <pre className="bg-muted mt-1 overflow-auto rounded-md p-2 text-sm">
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
                  <Badge
                    variant={
                      emailStatusLabels[notification.email_status]?.variant ||
                      "default"
                    }
                  >
                    {emailStatusLabels[notification.email_status]?.label ||
                      notification.email_status}
                  </Badge>
                </div>
              </div>
              {notification.email_sent_at && (
                <div>
                  <Label className="text-muted-foreground">발송 시각</Label>
                  <p className="font-medium">
                    {new Date(notification.email_sent_at).toLocaleString(
                      "ko-KR",
                    )}
                  </p>
                </div>
              )}
              {notification.email_status === "FAILED" &&
                notification.email_error_message && (
                  <div>
                    <Label className="text-muted-foreground">에러 메시지</Label>
                    <p className="text-destructive font-medium">
                      {notification.email_error_message}
                    </p>
                  </div>
                )}
              {notification.email_status === "SKIPPED" &&
                notification.email_error_message && (
                  <div>
                    <Label className="text-muted-foreground">건너뜀 사유</Label>
                    <p className="text-muted-foreground font-medium">
                      {notification.email_error_message}
                    </p>
                  </div>
                )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
