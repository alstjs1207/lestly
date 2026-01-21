/**
 * 상담 신청 API
 *
 * POST: 비회원이 상담을 신청하면 notifications 테이블에 저장
 * 트리거가 자동으로 관리자 알림톡 발송 처리
 */
import type { Route } from "./+types/consult-request";

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

interface ConsultRequestBody {
  organizationId: string;
  programId: number;
  programTitle: string;
  name: string;
  phone: string;
  message?: string;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const [client, headers] = makeServerClient(request);

  try {
    const body = (await request.json()) as ConsultRequestBody;
    const { organizationId, programId, programTitle, name, phone, message } =
      body;

    // 필수 필드 검증
    if (!organizationId || !programId || !name || !phone) {
      return data(
        { error: "필수 정보를 모두 입력해주세요." },
        { status: 400, headers }
      );
    }

    // 전화번호 형식 검증 (숫자만, 10-11자리)
    const phoneDigits = phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return data(
        { error: "올바른 전화번호를 입력해주세요." },
        { status: 400, headers }
      );
    }

    // notifications 테이블에 INSERT
    const { error } = await client.from("notifications").insert({
      organization_id: organizationId,
      type: "CONSULT_REQUEST",
      recipient_name: name,
      recipient_phone: phoneDigits,
      consult_message: message || null,
      consult_status: "WAITING",
      program_id: programId,
      alimtalk_variables: {
        program_id: programId,
        program_title: programTitle,
      },
    });

    if (error) {
      console.error("Failed to create consult request:", error);
      return data(
        { error: "상담 신청 중 오류가 발생했습니다." },
        { status: 500, headers }
      );
    }

    return data({ success: true }, { headers });
  } catch (error) {
    console.error("Consult request error:", error);
    return data(
      { error: "상담 신청 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
