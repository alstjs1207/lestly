import type { Route } from "./+types/consult-request";

import { data } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import { RequestBodyError, readBoundedJson } from "~/core/lib/request-body";
import { dispatchConsultPush } from "~/features/notifications/push/dispatch.server";

import {
  consultClientIp,
  consultHash,
  getConsultConfig,
} from "../consult-security.server";
import {
  consumeConsultIpBudget,
  findAcceptedConsultation,
  submitConsultation,
} from "../consult-store.server";
import { publicConsultRequestSchema } from "../consult-validation";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const headers = { "Cache-Control": "no-store" };
  const failure = (error: string, status: number) =>
    data({ error }, { status, headers });
  const config = getConsultConfig();
  const ip = consultClientIp(request);
  if (!config || !ip)
    return failure(
      "상담 신청을 준비 중입니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  let body: unknown;
  try {
    body = await readBoundedJson(request, 16_384);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return failure(error.message, error.status);
    throw error;
  }
  const parsed = publicConsultRequestSchema.safeParse(body);
  if (!parsed.success)
    return failure("이름과 연락처, 문의 내용을 확인해 주세요.", 400);
  const { programId, name, phone, message, requestId } = parsed.data;
  try {
    if (!(await consumeConsultIpBudget(consultHash(config.secret, "ip", ip))))
      return data(
        { error: "신청이 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { ...headers, "Retry-After": "600" } },
      );
    const payloadHash = consultHash(
      config.secret,
      "payload",
      JSON.stringify([programId, name, phone, message ?? ""]),
    );
    // A committed retry never creates a second consultation or push event.
    if (await findAcceptedConsultation(requestId, payloadHash))
      return data({ success: true }, { headers });
    const id = await submitConsultation({
      programId,
      name,
      phone,
      message,
      requestId,
      payloadHash,
      phoneHash: consultHash(config.secret, "phone", phone),
    });
    if (!id)
      return data(
        { error: "신청이 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { ...headers, "Retry-After": "3600" } },
      );
    await dispatchConsultPush(id);
    return data({ success: true }, { headers });
  } catch (error) {
    // SQL errors can contain bound contact data; never expose/log their payload.
    const message =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "";
    if (message.includes("consult_program_unavailable"))
      return failure("상담 신청이 가능한 클래스를 찾을 수 없습니다.", 404);
    if (message.includes("consult_request_conflict"))
      return failure(
        "신청 정보가 변경되었습니다. 창을 다시 열어 신청해 주세요.",
        409,
      );
    return failure(
      "상담을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
}
