import type { Route } from "./+types/student-invite";

import { CheckCircle2Icon, Clock3Icon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import adminClient from "~/core/lib/supa-admin-client.server";
import { hashStudentInviteToken } from "~/features/admin/lib/student-invite.server";

export async function loader({ params }: Route.LoaderArgs) {
  const tokenHash = hashStudentInviteToken(params.token);
  const now = new Date().toISOString();

  const { data: invite } = await adminClient
    .from("student_invites")
    .select("profile_id, organization_id, expires_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (!invite) {
    return { valid: false as const };
  }

  const [{ data: student }, { data: organization }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("name, auth_user_id")
      .eq("profile_id", invite.profile_id)
      .single(),
    adminClient
      .from("organizations")
      .select("name")
      .eq("organization_id", invite.organization_id)
      .single(),
  ]);

  if (!student || student.auth_user_id) {
    return { valid: false as const };
  }

  return {
    valid: true as const,
    studentName: student.name,
    organizationName: organization?.name || "Lestly",
    expiresAt: invite.expires_at,
    token: params.token,
  };
}

export default function StudentInviteScreen({
  loaderData,
}: Route.ComponentProps) {
  if (!loaderData.valid) {
    return (
      <main className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>사용할 수 없는 초대 링크입니다</CardTitle>
            <CardDescription>
              이미 사용했거나 만료된 링크입니다. 관리자에게 새 링크를 요청해
              주세요.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-full">
            <CheckCircle2Icon className="size-6" />
          </div>
          <CardTitle>{loaderData.organizationName} 초대</CardTitle>
          <CardDescription className="text-base">
            <strong className="text-foreground">
              {loaderData.studentName}
            </strong>
            님으로 등록된 일정과 수강 정보를 연결합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
            <Clock3Icon className="mt-0.5 size-4 shrink-0" />
            <p>
              본인에게 전달된 링크인지 확인해 주세요. 이메일 입력이나 추가
              전화번호 인증 없이 카카오 로그인으로 연결됩니다.
            </p>
          </div>
          <Button
            className="min-h-12 w-full bg-[#FEE500] text-[#191919] hover:bg-[#F5DC00]"
            asChild
          >
            <Link
              to={`/auth/social/start/kakao?invite=${encodeURIComponent(loaderData.token)}`}
              reloadDocument
            >
              카카오로 시작하기
            </Link>
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            카카오에서 인증된 이메일을 제공하면 비어 있는 연락 이메일에
            저장합니다. 기존에 등록된 이메일은 유지됩니다.
          </p>
          <p className="text-muted-foreground text-center text-xs">
            이 링크는 1회만 사용할 수 있으며 연결 후 다시 사용할 수 없습니다.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
