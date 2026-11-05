import type { Route } from "./+types/consultations";

import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole } from "~/features/admin/guards.server";

import { consultationPhone } from "../consult-validation";
import { getNotificationsPaginated } from "../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const result = await getNotificationsPaginated(client, {
    organizationId,
    page: Number(url.searchParams.get("page") || 1),
    typeFilter: "CONSULT_REQUEST",
    statusFilter:
      status === "WAITING" || status === "COMPLETED" ? status : undefined,
  });
  headers.set("Cache-Control", "no-store");
  return data({ ...result, status }, { headers });
}

export default function Consultations({ loaderData }: Route.ComponentProps) {
  const { notifications, totalCount, totalPages, currentPage, status } =
    loaderData;
  const pageUrl = (page: number) =>
    `?${new URLSearchParams({ page: String(page), ...(status ? { status } : {}) })}`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">상담 관리</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          총 {totalCount}건의 상담 신청
        </p>
      </div>
      <nav aria-label="상담 상태" className="flex gap-2">
        {[
          ["", "전체"],
          ["WAITING", "상담 대기"],
          ["COMPLETED", "상담 완료"],
        ].map(([value, label]) => (
          <Button
            key={value}
            asChild
            variant={(status || "") === value ? "default" : "outline"}
          >
            <Link to={value ? `?status=${value}` : "/admin/consultations"}>
              {label}
            </Link>
          </Button>
        ))}
      </nav>
      <div className="space-y-3">
        {!notifications.length && (
          <p className="text-muted-foreground rounded-xl border p-8 text-center">
            상담 신청이 없습니다.
          </p>
        )}
        {notifications.map((item) => (
          <article
            key={item.notification_id}
            className="hover:bg-muted/40 relative rounded-xl border p-4 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to={`/admin/consultations/${item.notification_id}`}
                className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] break-words after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2"
              >
                {item.recipient_name || "이름 없음"}
                <span className="sr-only"> 상담 상세 보기</span>
              </Link>
              <Badge
                variant={
                  item.consult_status === "COMPLETED" ? "default" : "outline"
                }
              >
                {item.consult_status === "COMPLETED"
                  ? "상담 완료"
                  : "상담 대기"}
              </Badge>
            </div>
            {consultationPhone(item.recipient_phone) ? (
              <a
                href={consultationPhone(item.recipient_phone)}
                className="text-primary relative z-10 mt-1 inline-flex min-h-11 items-center text-sm underline"
                aria-label={`${item.recipient_name || "신청자"}에게 전화 ${item.recipient_phone}`}
              >
                {item.recipient_phone}
              </a>
            ) : (
              <p className="text-muted-foreground py-2 text-sm">
                {item.recipient_phone || "전화번호 없음"}
              </p>
            )}
            <p className="mt-1 line-clamp-2 text-sm break-words">
              {item.consult_message || "남긴 내용이 없습니다."}
            </p>
            <p className="text-muted-foreground mt-3 text-xs">
              {new Date(item.created_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </p>
          </article>
        ))}
      </div>
      {totalPages > 1 && (
        <nav
          aria-label="상담 페이지"
          className="flex items-center justify-center gap-4"
        >
          {currentPage > 1 && (
            <Button asChild variant="outline">
              <Link to={pageUrl(currentPage - 1)}>이전</Link>
            </Button>
          )}
          <span className="text-sm">
            {currentPage} / {totalPages}
          </span>
          {currentPage < totalPages && (
            <Button asChild variant="outline">
              <Link to={pageUrl(currentPage + 1)}>다음</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
