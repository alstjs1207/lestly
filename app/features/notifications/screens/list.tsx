import type { Route } from "./+types/list";

import {
  ChevronRightIcon,
  FileTextIcon,
  MailIcon,
  SmartphoneIcon,
} from "lucide-react";
import {
  Link,
  data,
  redirect,
  useNavigate,
  useSearchParams,
} from "react-router";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/core/components/ui/tooltip";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  requireAdminRole,
  requireNotificationsEnabled,
} from "~/features/admin/guards.server";

import { getNotificationsPaginated } from "../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  await requireNotificationsEnabled(organizationId);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  if (url.searchParams.get("type") === "CONSULT_REQUEST")
    return redirect("/admin/consultations");
  const typeFilter = "ALIMTALK" as const;
  const status = url.searchParams.get("status");
  const statusFilter =
    status === "PENDING" || status === "SENT" || status === "FAILED"
      ? status
      : undefined;

  const result = await getNotificationsPaginated(client, {
    organizationId,
    page,
    pageSize: 20,
    typeFilter: typeFilter || undefined,
    statusFilter: statusFilter || undefined,
  });

  headers.set("Cache-Control", "no-store");
  return data(result, { headers });
}

const typeLabels: Record<
  string,
  { label: string; variant: "info" | "secondary" }
> = {
  ALIMTALK: { label: "알림톡", variant: "info" },
  CONSULT_REQUEST: { label: "상담 신청", variant: "secondary" },
};

const alimtalkStatusLabels: Record<
  string,
  {
    label: string;
    variant: "success" | "warning" | "destructive" | "secondary";
  }
> = {
  PENDING: { label: "대기", variant: "warning" },
  SENT: { label: "완료", variant: "success" },
  FAILED: { label: "실패", variant: "destructive" },
};

const emailStatusLabels: Record<
  string,
  {
    label: string;
    variant: "success" | "warning" | "destructive" | "secondary";
  }
> = {
  PENDING: { label: "대기", variant: "warning" },
  SENT: { label: "완료", variant: "success" },
  FAILED: { label: "실패", variant: "destructive" },
  SKIPPED: { label: "건너뜀", variant: "secondary" },
};

const consultStatusLabels: Record<
  string,
  {
    label: string;
    variant: "success" | "warning";
  }
> = {
  WAITING: { label: "상담 대기", variant: "warning" },
  COMPLETED: { label: "상담 완료", variant: "success" },
};

function formatPhoneNumber(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }
  return value;
}

export default function NotificationListScreen({
  loaderData,
}: Route.ComponentProps) {
  const { notifications, totalCount, totalPages, currentPage } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleStatusFilter = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      newParams.set("status", value);
    } else {
      newParams.delete("status");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  // 발송 채널 아이콘 렌더링
  const getChannelIcons = (notification: (typeof notifications)[0]) => {
    if (notification.type === "CONSULT_REQUEST") {
      return null;
    }

    const hasAlimtalk = notification.alimtalk_status !== null;
    const hasEmail = notification.email_status !== null;

    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {hasAlimtalk ? (
            <Tooltip>
              <TooltipTrigger>
                <SmartphoneIcon
                  className={`h-4 w-4 ${
                    notification.alimtalk_status === "SENT"
                      ? "text-green-600"
                      : notification.alimtalk_status === "FAILED"
                        ? "text-red-600"
                        : "text-muted-foreground"
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent>
                알림톡:{" "}
                {alimtalkStatusLabels[notification.alimtalk_status || ""]
                  ?.label || "-"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <SmartphoneIcon className="h-4 w-4 text-gray-300" />
          )}
          {hasEmail ? (
            <Tooltip>
              <TooltipTrigger>
                <MailIcon
                  className={`h-4 w-4 ${
                    notification.email_status === "SENT"
                      ? "text-green-600"
                      : notification.email_status === "FAILED"
                        ? "text-red-600"
                        : notification.email_status === "SKIPPED"
                          ? "text-gray-400"
                          : "text-muted-foreground"
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent>
                이메일:{" "}
                {emailStatusLabels[notification.email_status || ""]?.label ||
                  "-"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <MailIcon className="h-4 w-4 text-gray-300" />
          )}
        </div>
      </TooltipProvider>
    );
  };

  // 상태 뱃지 렌더링 (알림톡 + 이메일)
  const getStatusBadge = (notification: (typeof notifications)[0]) => {
    if (
      notification.type === "CONSULT_REQUEST" &&
      notification.consult_status
    ) {
      const status = consultStatusLabels[notification.consult_status];
      return (
        <Badge variant={status?.variant || "default"}>
          {status?.label || notification.consult_status}
        </Badge>
      );
    }

    if (notification.type === "ALIMTALK") {
      const alimtalkStatus = notification.alimtalk_status
        ? alimtalkStatusLabels[notification.alimtalk_status]
        : null;
      const emailStatus = notification.email_status
        ? emailStatusLabels[notification.email_status]
        : null;

      return (
        <div className="flex flex-wrap gap-1.5">
          {alimtalkStatus && (
            <Badge variant={alimtalkStatus.variant} className="text-xs">
              알림톡: {alimtalkStatus.label}
            </Badge>
          )}
          {emailStatus && (
            <Badge variant={emailStatus.variant} className="text-xs">
              이메일: {emailStatus.label}
            </Badge>
          )}
          {!alimtalkStatus && !emailStatus && (
            <Badge variant="outline">-</Badge>
          )}
        </div>
      );
    }

    return <Badge variant="outline">-</Badge>;
  };

  const currentTypeFilter = "ALIMTALK";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">알림 관리</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            총 {totalCount}건의 알림 이력이 있습니다.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="min-h-11 shrink-0 rounded-full px-4"
        >
          <Link to="/admin/notifications/templates">
            <FileTextIcon className="mr-1.5 h-4 w-4" />
            <span className="md:hidden">템플릿</span>
            <span className="hidden md:inline">템플릿 설정</span>
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
        {currentTypeFilter === "ALIMTALK" && (
          <Select
            value={searchParams.get("status") || "all"}
            onValueChange={handleStatusFilter}
          >
            <SelectTrigger className="h-11 w-full md:h-9 md:w-40">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="PENDING">대기</SelectItem>
              <SelectItem value="SENT">발송 완료</SelectItem>
              <SelectItem value="FAILED">발송 실패</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {notifications.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
            알림 이력이 없습니다.
          </div>
        ) : (
          notifications.map((notification) => (
            <Link
              key={notification.notification_id}
              to={`/admin/notifications/${notification.notification_id}`}
              className="bg-card active:bg-accent block rounded-xl border p-4 shadow-sm transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <Badge
                  variant={typeLabels[notification.type]?.variant || "default"}
                >
                  {typeLabels[notification.type]?.label || notification.type}
                </Badge>
                <time className="text-muted-foreground text-xs">
                  {new Date(notification.created_at).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <div className="mt-2 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {notification.recipient_name || "수신자 미지정"}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {formatPhoneNumber(notification.recipient_phone) ||
                      notification.recipient_email ||
                      "연락처 없음"}
                  </p>
                </div>
                <ChevronRightIcon className="text-muted-foreground mt-1 size-5 shrink-0" />
              </div>
              <p className="mt-2 line-clamp-1 text-sm">
                {notification.type === "ALIMTALK"
                  ? notification.template_name ||
                    notification.alimtalk_template_code ||
                    "알림톡"
                  : notification.consult_message || "상담 내용 없음"}
              </p>
              <div className="mt-3 border-t pt-3">
                {getStatusBadge(notification)}
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">채널</TableHead>
              <TableHead className="w-28">유형</TableHead>
              <TableHead className="w-40">상태</TableHead>
              <TableHead>수신자</TableHead>
              <TableHead>내용</TableHead>
              <TableHead className="w-40">발송일시</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center">
                  알림 이력이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              notifications.map((notification) => (
                <TableRow
                  key={notification.notification_id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() =>
                    navigate(
                      `/admin/notifications/${notification.notification_id}`,
                    )
                  }
                >
                  <TableCell>{getChannelIcons(notification)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        typeLabels[notification.type]?.variant || "default"
                      }
                    >
                      {typeLabels[notification.type]?.label ||
                        notification.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(notification)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {notification.recipient_name || "-"}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {formatPhoneNumber(notification.recipient_phone)}
                      </div>
                      {notification.recipient_email && (
                        <div className="text-muted-foreground text-xs">
                          {notification.recipient_email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {notification.type === "ALIMTALK"
                      ? notification.template_name ||
                        notification.alimtalk_template_code
                      : notification.consult_message || "-"}
                  </TableCell>
                  <TableCell>
                    {new Date(notification.created_at).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        to={`/admin/notifications/${notification.notification_id}`}
                      >
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
    </div>
  );
}
