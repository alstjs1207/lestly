import type { Route } from "./+types/invite";

import { data } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import { getSiteOrigin } from "~/core/lib/site-origin.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import {
  createStudentInviteToken,
  getStudentInviteExpiry,
  hashStudentInviteToken,
} from "../../lib/student-invite.server";
import { getStudentById } from "../../queries";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId, user } = await requireAdminRole(client);
  const student = await getStudentById(client, {
    organizationId,
    studentId: params.studentId,
  });

  if (student.state !== "NORMAL")
    return data(
      { success: false, error: "재원생에게만 초대 링크를 발급할 수 있습니다." },
      { status: 409 },
    );

  if (student.auth_user_id) {
    return data(
      { success: false, error: "이미 로그인 계정이 연결된 수강생입니다." },
      { status: 409 },
    );
  }

  const { data: adminProfile, error: adminProfileError } = await adminClient
    .from("profiles")
    .select("profile_id")
    .eq("auth_user_id", user.id)
    .single();

  if (adminProfileError || !adminProfile) {
    return data(
      { success: false, error: "관리자 프로필을 확인할 수 없습니다." },
      { status: 400 },
    );
  }

  const token = createStudentInviteToken();
  const tokenHash = hashStudentInviteToken(token);
  const expiresAt = getStudentInviteExpiry();

  const { error: revokeError } = await adminClient
    .from("student_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("profile_id", student.profile_id)
    .is("used_at", null)
    .is("revoked_at", null);

  if (revokeError) {
    return data(
      { success: false, error: "기존 초대 링크를 정리하지 못했습니다." },
      { status: 500 },
    );
  }

  const { error: inviteError } = await adminClient
    .from("student_invites")
    .insert({
      organization_id: organizationId,
      profile_id: student.profile_id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      created_by_profile_id: adminProfile.profile_id,
    });

  if (inviteError) {
    console.error("Student invite creation failed", inviteError);
    return data(
      { success: false, error: "초대 링크 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  const siteUrl = getSiteOrigin(request, process.env);

  return data({
    success: true,
    inviteUrl: `${siteUrl}/invite/${token}`,
    expiresAt: expiresAt.toISOString(),
  });
}
