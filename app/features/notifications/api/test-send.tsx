/**
 * Test AlimTalk Send API
 *
 * Allows administrators to test AlimTalk templates before live use.
 * - Super admin: Unlimited sends, any recipient phone
 * - Org admin: 5 sends/day, own phone only
 */
import type { Route } from "./+types/test-send";

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_URL?.replace(
  ".supabase.co",
  ".supabase.co/functions/v1"
);

const DAILY_TEST_LIMIT = 5;

interface TestSendRequest {
  super_template_id: number;
  org_template_id?: number;
  recipient_phone?: string; // Only for super admin
}

export async function action({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);

  // Get current user
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return data({ error: "Unauthorized" }, { status: 401, headers });
  }

  const body: TestSendRequest = await request.json();
  const { super_template_id, org_template_id, recipient_phone: inputPhone } = body;

  // Check if super admin
  const isSuperAdmin =
    user.app_metadata?.is_super_admin === true ||
    user.app_metadata?.role === "SUPER_ADMIN";

  // Get user profile
  const { data: profile } = await adminClient
    .from("profiles")
    .select("profile_id, phone")
    .eq("profile_id", user.id)
    .single();

  if (!profile) {
    return data({ error: "Profile not found" }, { status: 400, headers });
  }

  // Get template info
  const { data: template } = await adminClient
    .from("super_templates")
    .select("*")
    .eq("super_template_id", super_template_id)
    .single();

  if (!template) {
    return data({ error: "Template not found" }, { status: 404, headers });
  }

  let recipientPhone: string;
  let organizationId: string | null = null;

  if (isSuperAdmin) {
    // Super admin: use input phone or own phone
    const phone = inputPhone || profile.phone;
    if (!phone) {
      return data(
        { error: "Recipient phone is required" },
        { status: 400, headers }
      );
    }
    recipientPhone = phone;
  } else {
    // Org admin: check daily limit and use own phone only

    // Get user's organization
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", user.id)
      .eq("role", "ADMIN")
      .eq("state", "NORMAL")
      .single();

    if (!membership) {
      return data(
        { error: "Not authorized as admin" },
        { status: 403, headers }
      );
    }

    organizationId = membership.organization_id;

    // Check own phone
    if (!profile.phone) {
      return data(
        { error: "프로필에 전화번호가 등록되어 있지 않습니다." },
        { status: 400, headers }
      );
    }
    recipientPhone = profile.phone;

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { count } = await adminClient
      .from("test_send_logs")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .gte("sent_at", todayStart.toISOString())
      .lte("sent_at", todayEnd.toISOString());

    if ((count || 0) >= DAILY_TEST_LIMIT) {
      return data(
        { error: "일일 테스트 발송 한도(5회)를 초과했습니다." },
        { status: 429, headers }
      );
    }
  }

  // Get organization name for variables
  let orgName = "테스트 조직";
  if (organizationId) {
    const { data: org } = await adminClient
      .from("organizations")
      .select("name")
      .eq("organization_id", organizationId)
      .single();
    if (org) orgName = org.name;
  }

  // Build dummy variables for test
  const dummyVariables: Record<string, string> = {
    organization_name: orgName,
    program_title: "테스트 클래스",
    schedule_datetime: new Date().toISOString().slice(0, 16).replace("T", " "),
    student_name: "테스트 수강생",
    student_phone: recipientPhone,
    instructor_name: "테스트 강사",
    requester_name: "테스트 신청자",
    requester_phone: recipientPhone,
    consult_message: "테스트 상담 메시지입니다.",
    cancel_reason: "테스트 취소",
  };

  // Create test notification
  const { data: notification, error: insertError } = await adminClient
    .from("notifications")
    .insert({
      organization_id: organizationId || "00000000-0000-0000-0000-000000000000", // Dummy for super admin
      type: "ALIMTALK",
      recipient_phone: recipientPhone,
      recipient_name: "테스트",
      alimtalk_status: "PENDING",
      alimtalk_template_code: template.kakao_template_code,
      alimtalk_variables: dummyVariables,
      send_mode: "TEST",
    })
    .select()
    .single();

  if (insertError || !notification) {
    return data(
      { error: "Failed to create test notification" },
      { status: 500, headers }
    );
  }

  // Log test send
  await adminClient.from("test_send_logs").insert({
    organization_id: organizationId,
    profile_id: user.id,
    super_template_id,
    org_template_id,
    recipient_phone: recipientPhone,
  });

  // Invoke Edge Function
  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/send-alimtalk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ notification_id: notification.notification_id }),
    });

    const result = await response.json();

    return data(
      {
        success: true,
        notification_id: notification.notification_id,
        result,
      },
      { headers }
    );
  } catch (error) {
    return data(
      {
        success: false,
        notification_id: notification.notification_id,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { headers }
    );
  }
}
