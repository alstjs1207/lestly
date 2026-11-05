import type { Route } from "./+types/consultation-detail";

import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole } from "~/features/admin/guards.server";

import {
  consultUpdateSchema,
  consultationId,
  consultationPhone,
} from "../consult-validation";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const id = consultationId(params.consultationId);
  if (!id) throw data(null, { status: 404 });
  const { data: consultation, error } = await client
    .from("notifications")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("notification_id", id)
    .eq("type", "CONSULT_REQUEST")
    .maybeSingle();
  if (error)
    throw data({ error: "상담을 불러오지 못했습니다." }, { status: 500 });
  if (!consultation) throw data(null, { status: 404 });
  headers.set("Cache-Control", "no-store");
  return data({ consultation }, { headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  headers.set("Cache-Control", "no-store");
  const id = consultationId(params.consultationId);
  if (!id)
    return data(
      { error: "상담을 찾을 수 없습니다." },
      { status: 404, headers },
    );
  const form = await request.formData();
  const parsed = consultUpdateSchema.safeParse({
    status: form.get("status"),
    result: form.get("result"),
    notes: form.get("notes"),
  });
  if (!parsed.success)
    return data(
      { error: "상태·결과와 메모(최대 5,000자)를 확인해 주세요." },
      { status: 400, headers },
    );
  const { status, result, notes } = parsed.data;
  const { data: saved, error } = await client
    .from("notifications")
    .update({
      consult_status: status,
      consult_result: result || null,
      consult_notes: notes,
    })
    .eq("organization_id", organizationId)
    .eq("notification_id", id)
    .eq("type", "CONSULT_REQUEST")
    .select("notification_id")
    .maybeSingle();
  if (error)
    return data(
      { error: "상담을 저장하지 못했습니다." },
      { status: 500, headers },
    );
  if (!saved)
    return data(
      { error: "상담을 찾을 수 없습니다." },
      { status: 404, headers },
    );
  return data({ success: true }, { headers });
}

export default function ConsultationDetail({
  loaderData,
}: Route.ComponentProps) {
  const { consultation: item } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const phone = consultationPhone(item.recipient_phone);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost">
        <Link to="/admin/consultations">← 상담 목록</Link>
      </Button>
      <h1 className="text-xl font-bold md:text-2xl">상담 상세</h1>
      <Card>
        <CardHeader>
          <CardTitle className="[overflow-wrap:anywhere] break-words">
            {item.recipient_name || "이름 없음"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {phone ? (
            <a
              href={phone}
              className="text-primary inline-flex min-h-11 items-center underline"
            >
              {item.recipient_phone}
            </a>
          ) : (
            <p>{item.recipient_phone || "전화번호 없음"}</p>
          )}
          <p className="text-muted-foreground text-sm">
            접수:{" "}
            {new Date(item.created_at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </p>
          <div>
            <h2 className="mb-2 font-medium">남긴 내용</h2>
            <p className="break-words whitespace-pre-wrap">
              {item.consult_message || "남긴 내용이 없습니다."}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>상담 처리</CardTitle>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">상담 상태</Label>
              <select
                id="status"
                name="status"
                defaultValue={item.consult_status || "WAITING"}
                className="bg-background h-11 w-full rounded-md border px-3"
              >
                <option value="WAITING">상담 대기</option>
                <option value="COMPLETED">상담 완료</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="result">등록 결과</Label>
              <select
                id="result"
                name="result"
                defaultValue={item.consult_result || ""}
                className="bg-background h-11 w-full rounded-md border px-3"
              >
                <option value="">미정</option>
                <option value="SUCCESS">등록 성공</option>
                <option value="FAILED">등록 실패</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">관리자 메모</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={5}
                maxLength={5000}
                defaultValue={item.consult_notes || ""}
              />
            </div>
            {item.consult_completed_at && (
              <p className="text-muted-foreground text-sm">
                완료:{" "}
                {new Date(item.consult_completed_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </p>
            )}
            <p role="status" className="text-sm">
              {fetcher.data &&
                ("error" in fetcher.data
                  ? fetcher.data.error
                  : "저장되었습니다.")}
            </p>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? "저장 중..." : "저장"}
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  );
}
