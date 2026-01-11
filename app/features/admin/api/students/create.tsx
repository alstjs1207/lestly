/**
 * Student Creation API
 *
 * Creates a new student with:
 * 1. Supabase auth user
 * 2. Profile record
 * 3. Organization membership with STUDENT role
 */
import type { Route } from "./+types/create";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();

  const email = formData.get("email") as string;
  const name = formData.get("name") as string;
  const studentType = formData.get("type") as "EXAMINEE" | "DROPPER" | "ADULT";

  // 임시 비밀번호 생성 (사용자는 비밀번호 재설정으로 변경해야 함)
  const tempPassword = crypto.randomUUID();

  // 1. auth.users에 사용자 생성
  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name,
      },
      app_metadata: {
        provider: "email",
        admin_created: true, // 트리거에서 admin 생성을 구분하기 위해
      },
    });

  if (authError) {
    console.error("Auth Error Details:", JSON.stringify(authError, null, 2));
    throw new Error(
      `${authError.message} - ${authError.status} - ${authError.code}`,
    );
  }

  // 2. profiles에 학생 정보 직접 INSERT (adminClient는 RLS 우회)
  const studentData = {
    profile_id: authData.user.id,
    name,
    region: formData.get("region") as string,
    birth_date: formData.get("birth_date") as string,
    phone: formData.get("phone") as string,
    class_start_date: formData.get("class_start_date") as string,
    class_end_date: formData.get("class_end_date") as string,
    parent_name: (formData.get("parent_name") as string) || null,
    parent_phone: (formData.get("parent_phone") as string) || null,
    description: (formData.get("description") as string) || null,
    color: (formData.get("color") as string) || "#3B82F6",
    marketing_consent: false,
  };

  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert(studentData, { onConflict: "profile_id" });

  if (profileError) {
    // 프로필 생성 실패 시 생성된 사용자 삭제
    await adminClient.auth.admin.deleteUser(authData.user.id);
    throw new Error(profileError.message);
  }

  // 3. organization_members에 학생 멤버십 생성
  const { error: memberError } = await adminClient
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      profile_id: authData.user.id,
      role: "STUDENT",
      state: "NORMAL",
      type: studentType,
    });

  if (memberError) {
    // 멤버십 생성 실패 시 프로필과 사용자 삭제
    await adminClient.from("profiles").delete().eq("profile_id", authData.user.id);
    await adminClient.auth.admin.deleteUser(authData.user.id);
    throw new Error(memberError.message);
  }

  return redirect(`/admin/students/${authData.user.id}`);
}
