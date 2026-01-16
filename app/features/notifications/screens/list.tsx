import type { Route } from "./+types/list";

import { Link, useNavigate, useSearchParams } from "react-router";
import { FileTextIcon } from "lucide-react";

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
import { requireAdminRole } from "~/features/admin/guards.server";

import { getNotificationsPaginated } from "../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const typeFilter = url.searchParams.get("type") as
    | "ALIMTALK"
    | "CONSULT_REQUEST"
    | undefined;
  const statusFilter = url.searchParams.get("status") as
    | "PENDING"
    | "SENT"
    | "FAILED"
    | "WAITING"
    | "COMPLETED"
    | undefined;

  const result = await getNotificationsPaginated(client, {
    organizationId,
    page,
    pageSize: 20,
    typeFilter: typeFilter || undefined,
    statusFilter: statusFilter || undefined,
  });

  return result;
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

const consultStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  WAITING: { label: "상담 대기", variant: "outline" },
  COMPLETED: { label: "상담 완료", variant: "default" },
};

const consultResultLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  SUCCESS: { label: "등록 성공", variant: "default" },
  FAILED: { label: "등록 실패", variant: "destructive" },
};

export default function NotificationListScreen({
  loaderData,
}: Route.ComponentProps) {
  const { notifications, totalCount, totalPages, currentPage } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleTypeFilter = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      newParams.set("type", value);
    } else {
      newParams.delete("type");
    }
    newParams.delete("status");
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

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

  const getStatusBadge = (notification: typeof notifications[0]) => {
    if (notification.type === "ALIMTALK" && notification.alimtalk_status) {
      const status = alimtalkStatusLabels[notification.alimtalk_status];
      return <Badge variant={status?.variant || "default"}>{status?.label || notification.alimtalk_status}</Badge>;
    }
    if (notification.type === "CONSULT_REQUEST" && notification.consult_status) {
      const status = consultStatusLabels[notification.consult_status];
      return <Badge variant={status?.variant || "default"}>{status?.label || notification.consult_status}</Badge>;
    }
    return <Badge variant="outline">-</Badge>;
  };

  const currentTypeFilter = searchParams.get("type");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">알림 관리</h1>
          <p className="text-muted-foreground">
            총 {totalCount}건의 알림 이력이 있습니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/notifications/templates">
            <FileTextIcon className="mr-2 h-4 w-4" />
            템플릿 설정
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select
          value={searchParams.get("type") || "all"}
          onValueChange={handleTypeFilter}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            <SelectItem value="ALIMTALK">알림톡</SelectItem>
            <SelectItem value="CONSULT_REQUEST">상담 신청</SelectItem>
          </SelectContent>
        </Select>

        {currentTypeFilter === "ALIMTALK" && (
          <Select
            value={searchParams.get("status") || "all"}
            onValueChange={handleStatusFilter}
          >
            <SelectTrigger className="w-40">
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

        {currentTypeFilter === "CONSULT_REQUEST" && (
          <Select
            value={searchParams.get("status") || "all"}
            onValueChange={handleStatusFilter}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="WAITING">상담 대기</SelectItem>
              <SelectItem value="COMPLETED">상담 완료</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">유형</TableHead>
              <TableHead className="w-32">상태</TableHead>
              <TableHead>수신자</TableHead>
              <TableHead>내용</TableHead>
              <TableHead className="w-32">최종 결과</TableHead>
              <TableHead className="w-40">발송일시</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  알림 이력이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              notifications.map((notification) => (
                <TableRow
                  key={notification.notification_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/admin/notifications/${notification.notification_id}`)}
                >
                  <TableCell>
                    <Badge variant={typeLabels[notification.type]?.variant || "default"}>
                      {typeLabels[notification.type]?.label || notification.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(notification)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{notification.recipient_name || "-"}</div>
                      <div className="text-sm text-muted-foreground">{notification.recipient_phone}</div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {notification.type === "ALIMTALK"
                      ? notification.alimtalk_template_code
                      : notification.consult_message || "-"}
                  </TableCell>
                  <TableCell>
                    {notification.type === "CONSULT_REQUEST" && notification.consult_result ? (
                      <Badge variant={consultResultLabels[notification.consult_result]?.variant || "default"}>
                        {consultResultLabels[notification.consult_result]?.label || notification.consult_result}
                      </Badge>
                    ) : (
                      "-"
                    )}
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
                      <Link to={`/admin/notifications/${notification.notification_id}`}>
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
    </div>
  );
}
