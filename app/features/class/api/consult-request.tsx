/**
 * 상담 신청 API
 *
 * POST: 비회원이 상담을 신청하면 notifications 테이블에 저장
 * 트리거가 자동으로 관리자 알림톡 발송 처리
 */
import type { Route } from "./+types/consult-request";

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";

interface ConsultRequestBody {
  programId: number;
  name: string;
  phone: string;
  message?: string;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json()) as ConsultRequestBody;
    const { programId, name, phone, message } = body;

    // 필수 필드 검증
    if (!programId || !name || !phone) {
      return data(
        { error: "필수 정보를 모두 입력해주세요." },
        { status: 400 }
      );
    }

    // 전화번호 형식 검증 (숫자만, 10-11자리)
    const phoneDigits = phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return data(
        { error: "올바른 전화번호를 입력해주세요." },
        { status: 400 }
      );
    }

    // programId로 organization_id, title 서버에서 조회 (보안: 클라이언트 값 신뢰하지 않음)
    const { data: program } = await adminClient
      .from("programs")
      .select("organization_id, title")
      .eq("program_id", programId)
      .single();

    if (!program) {
      return data({ error: "프로그램을 찾을 수 없습니다" }, { status: 404 });
    }

    // notifications 테이블에 INSERT (adminClient 사용하여 RLS 우회)
    // 트리거가 ALIMTALK 타입의 알림을 추가 생성하므로 service_role 권한 필요
    const { error } = await adminClient.from("notifications").insert({
      organization_id: program.organization_id,
      type: "CONSULT_REQUEST",
      recipient_name: name,
      recipient_phone: phoneDigits,
      consult_message: message || null,
      consult_status: "WAITING",
      program_id: programId,
      alimtalk_variables: {
        program_id: programId,
        program_title: program.title,
      },
    });

    if (error) {
      console.error("Failed to create consult request:", error);
      return data(
        { error: "상담 신청 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    return data({ success: true });
  } catch (error) {
    console.error("Consult request error:", error);
    return data(
      { error: "상담 신청 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
