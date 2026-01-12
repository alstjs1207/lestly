/**
 * Admin Registration Screen - Step 3: Profile Setup
 *
 * This component handles the third step of admin registration:
 * - Name input
 * - Password creation
 * - Terms of service agreement
 * - Updates user auth data and profile table
 * - Redirects to organization setup after completion
 */
import type { Route } from "./+types/admin-signup-profile";

import { CalendarIcon, UserIcon, XCircleIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";

import FormButton from "~/core/components/form-button";
import FormErrors from "~/core/components/form-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Checkbox } from "~/core/components/ui/checkbox";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";

/**
 * Meta function for the profile setup page
 */
export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `프로필 설정 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

/**
 * Loader to check if user is authenticated
 */
export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  // User must be authenticated (from OTP verification)
  if (!user) {
    return redirect("/admin/signup");
  }

  // Check if user already has a password set (has completed profile setup)
  // and has an organization
  const { data: memberships } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("role", "ADMIN")
    .eq("state", "NORMAL")
    .limit(1);

  if (memberships && memberships.length > 0) {
    return redirect("/admin");
  }

  return { email: user.email };
}

/**
 * Form validation schema for profile setup
 */
const profileSchema = z
  .object({
    name: z.string().min(1, { message: "이름을 입력해주세요" }),
    password: z
      .string()
      .min(8, { message: "비밀번호는 8자 이상이어야 합니다" }),
    passwordConfirm: z.string(),
    terms: z.literal("on", { message: "이용약관에 동의해주세요" }),
    marketing: z.string().optional(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["passwordConfirm"],
  });

/**
 * Server action for profile setup
 */
export async function action({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return redirect("/admin/signup");
  }

  const formData = await request.formData();
  const {
    data: validData,
    success,
    error,
  } = profileSchema.safeParse(Object.fromEntries(formData));

  if (!success) {
    return data({ fieldErrors: error.flatten().fieldErrors }, { status: 400 });
  }

  // Update user password and metadata
  const { error: updateError } = await client.auth.updateUser({
    password: validData.password,
    data: {
      name: validData.name,
      display_name: validData.name,
      is_admin_signup: true,
    },
  });

  if (updateError) {
    return data({ error: updateError.message }, { status: 400 });
  }

  // Update profile table
  const { error: profileError } = await client
    .from("profiles")
    .update({
      name: validData.name,
      marketing_consent: validData.marketing === "on",
    })
    .eq("profile_id", user.id);

  if (profileError) {
    return data({ error: profileError.message }, { status: 400 });
  }

  // Redirect to organization setup
  return redirect("/admin/signup/organization", { headers });
}

/**
 * Admin Registration Component - Step 3: Profile Setup
 */
export default function AdminSignupProfile({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  return (
    <div className="flex min-h-screen">
      {/* 왼쪽 패널 - 서비스 소개 (데스크톱만 표시) */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary text-primary-foreground flex-col items-center justify-center p-12">
        <div className="max-w-md space-y-8 text-center">
          {/* 로고 */}
          <div className="flex items-center justify-center gap-3">
            <div className="bg-primary-foreground text-primary flex aspect-square size-12 items-center justify-center rounded-lg">
              <CalendarIcon className="size-6" />
            </div>
            <span className="text-4xl font-bold">Lestly</span>
          </div>

          {/* 안내 메시지 */}
          <div className="space-y-4">
            <UserIcon className="size-16 mx-auto text-primary-foreground/80" />
            <h1 className="text-3xl font-bold">프로필을 설정해주세요</h1>
            <p className="text-lg text-primary-foreground/80">
              관리자 계정의 기본 정보를 입력해주세요.
              <br />
              입력한 정보는 언제든 변경할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      {/* 오른쪽 패널 - 프로필 폼 */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          {/* 모바일용 로고 */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <div className="bg-primary text-primary-foreground flex aspect-square size-10 items-center justify-center rounded-lg">
              <CalendarIcon className="size-5" />
            </div>
            <span className="text-2xl font-bold">Lestly</span>
          </div>

          <Card>
            <CardHeader className="flex flex-col items-center">
              <CardTitle className="text-2xl font-semibold" role="heading">
                프로필 설정
              </CardTitle>
              <CardDescription className="text-base text-center">
                관리자 계정 정보를 입력해주세요
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Form className="flex w-full flex-col gap-4" method="post">
                <div className="flex flex-col items-start space-y-2">
                  <Label
                    htmlFor="name"
                    className="flex flex-col items-start gap-1"
                  >
                    이름
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    type="text"
                    placeholder="홍길동"
                    autoComplete="name"
                  />
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors?.name ? (
                    <FormErrors errors={actionData.fieldErrors.name} />
                  ) : null}
                </div>

                <div className="flex flex-col items-start space-y-2">
                  <Label
                    htmlFor="password"
                    className="flex flex-col items-start gap-1"
                  >
                    비밀번호
                    <small className="text-muted-foreground">8자 이상</small>
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    required
                    type="password"
                    placeholder="비밀번호를 입력하세요"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors?.password ? (
                    <FormErrors errors={actionData.fieldErrors.password} />
                  ) : null}
                </div>

                <div className="flex flex-col items-start space-y-2">
                  <Label
                    htmlFor="passwordConfirm"
                    className="flex flex-col items-start gap-1"
                  >
                    비밀번호 확인
                  </Label>
                  <Input
                    id="passwordConfirm"
                    name="passwordConfirm"
                    required
                    type="password"
                    placeholder="비밀번호를 다시 입력하세요"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                  {passwordConfirm && password !== passwordConfirm && (
                    <p className="text-sm text-red-500 flex items-center gap-2">
                      <XCircleIcon className="size-4" />
                      비밀번호가 일치하지 않습니다
                    </p>
                  )}
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors?.passwordConfirm ? (
                    <FormErrors
                      errors={actionData.fieldErrors.passwordConfirm}
                    />
                  ) : null}
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start space-x-2">
                    <Checkbox id="terms" name="terms" required defaultChecked />
                    <Label
                      htmlFor="terms"
                      className="text-sm leading-relaxed cursor-pointer"
                    >
                      <Link
                        to="/legal/terms"
                        target="_blank"
                        className="text-primary hover:underline font-semibold"
                      >
                        서비스 이용약관
                      </Link>
                      {" 및 "}
                      <Link
                        to="/legal/privacy"
                        target="_blank"
                        className="text-primary hover:underline font-semibold"
                      >
                        개인정보 처리방침
                      </Link>
                      에 동의합니다
                    </Label>
                  </div>
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors?.terms ? (
                    <FormErrors errors={actionData.fieldErrors.terms} />
                  ) : null}

                  <div className="flex items-start space-x-2">
                    <Checkbox id="marketing" name="marketing" />
                    <Label
                      htmlFor="marketing"
                      className="text-sm leading-relaxed cursor-pointer text-muted-foreground"
                    >
                      마케팅 정보 수신에 동의합니다 (선택)
                    </Label>
                  </div>
                </div>

                <FormButton label="다음" className="w-full mt-2" />

                {actionData && "error" in actionData && actionData.error ? (
                  <FormErrors errors={[actionData.error]} />
                ) : null}
              </Form>
            </CardContent>
          </Card>

          {/* 진행 상황 표시 */}
          <div className="flex justify-center items-center gap-2">
            <div className="size-2 rounded-full bg-primary" />
            <div className="size-2 rounded-full bg-primary" />
            <div className="size-2 rounded-full bg-primary" />
            <div className="size-2 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
