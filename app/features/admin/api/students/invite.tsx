/**
 * Student Invite API
 *
 * Generates a password setup link and sends invitation email to the student.
 * Uses Supabase's "recovery" type since the user already exists in auth.users.
 * The student can click the link to set their password and log in.
 */
import type { Route } from "./+types/invite";

import { data } from "react-router";
import InviteStudentEmail from "transactional-emails/emails/invite-student";

import { requireMethod } from "~/core/lib/guards.server";
import resendClient from "~/core/lib/resend-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getOrganization } from "~/features/organizations/queries";

import { requireAdminRole } from "../../guards.server";
import { getStudentById } from "../../queries";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const { studentId } = params;

  // 1. Get student info
  const student = await getStudentById(client, { organizationId, studentId });

  // 2. Get student's email from auth.users
  const { data: authUser, error: authError } =
    await adminClient.auth.admin.getUserById(studentId);

  if (authError || !authUser?.user?.email) {
    return data(
      { success: false, error: "학생 이메일을 찾을 수 없습니다." },
      { status: 400 },
    );
  }

  const email = authUser.user.email;

  // 3. Get organization name
  const organization = await getOrganization(client, { organizationId });
  const organizationName = organization?.name || "Lestly";

  // 4. Generate password reset link using Supabase (recovery type for existing users)
  const siteUrl = process.env.SITE_URL || "http://localhost:5173";
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${siteUrl}/auth/set-password`,
      },
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("Generate Link Error:", linkError);
    return data(
      { success: false, error: "초대 링크 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  // Construct link through our /auth/confirm endpoint for proper SSR cookie handling
  const inviteLink = `${siteUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/auth/set-password`;

  // 5. Send invite email via Resend
  const { error: emailError } = await resendClient.emails.send({
    from: "Lestly <hello@mail.lestly.io>",
    to: [email],
    subject: `${organizationName}에서 초대되었습니다`,
    react: InviteStudentEmail({
      organizationName,
      studentName: student.name,
      inviteLink,
    }),
  });

  if (emailError) {
    console.error("Email Send Error:", emailError);
    return data(
      { success: false, error: "이메일 발송에 실패했습니다." },
      { status: 500 },
    );
  }

  return data({ success: true });
}
