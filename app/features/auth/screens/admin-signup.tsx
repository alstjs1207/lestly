/**
 * Admin Registration Screen - Step 1: Email Input
 *
 * This component handles the first step of admin registration:
 * - Email input
 * - OTP code sending via Supabase signInWithOtp
 * - Redirects to verification page after OTP is sent
 */
import type { Route } from "./+types/admin-signup";

import { CalendarIcon, CheckCircle2Icon } from "lucide-react";
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
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";

/**
 * Meta function for the admin registration page
 */
export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `관리자 회원가입 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

/**
 * Form validation schema for email input
 */
const emailSchema = z.object({
  email: z.string().email({ message: "올바른 이메일 주소를 입력해주세요" }),
});

/**
 * Server action for sending OTP code
 */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const {
    data: validData,
    success,
    error,
  } = emailSchema.safeParse(Object.fromEntries(formData));

  if (!success) {
    return data({ fieldErrors: error.flatten().fieldErrors }, { status: 400 });
  }

  const [client, headers] = makeServerClient(request);

  // Send OTP code via email
  const { error: otpError } = await client.auth.signInWithOtp({
    email: validData.email,
    options: {
      shouldCreateUser: true,
      data: {
        is_admin_signup: true,
      },
    },
  });

  if (otpError) {
    return data({ error: otpError.message }, { status: 400 });
  }

  // Redirect to verification page with email in query param
  return redirect(
    `/admin/signup/verify?email=${encodeURIComponent(validData.email)}`,
    {
      headers,
    },
  );
}

/**
 * Admin Registration Component - Step 1
 */
export default function AdminSignup({ actionData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen">
      {/* 왼쪽 패널 - 서비스 소개 (데스크톱만 표시) */}
      <div className="bg-primary text-primary-foreground hidden flex-col items-center justify-center p-12 lg:flex lg:w-1/2">
        <div className="max-w-md space-y-8 text-center">
          {/* 로고 */}
          <div className="flex items-center justify-center">
            <img
              src="/logo/08_primary_transparent.png"
              alt="Lestly"
              className="h-28 object-contain"
            />
          </div>

          {/* 서비스 소개 */}
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">스케줄 관리의 새로운 방법</h1>
            <p className="text-primary-foreground/80 text-lg">
              수강생 관리부터 일정까지 한 곳에서.
              <br />더 쉽고 효율적인 일정 관리를 경험하세요.
            </p>
          </div>

          {/* 기능 소개 */}
          <div className="space-y-3 pt-4 text-left">
            <div className="flex items-center gap-3">
              <CheckCircle2Icon className="text-primary-foreground/80 size-5" />
              <span>수강생 일정 관리</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2Icon className="text-primary-foreground/80 size-5" />
              <span>캘린더 기반 스케줄링</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2Icon className="text-primary-foreground/80 size-5" />
              <span>수강생 정보 통합 관리</span>
            </div>
          </div>
        </div>
      </div>

      {/* 오른쪽 패널 - 회원가입 폼 */}
      <div className="flex w-full flex-col items-center justify-center overflow-y-auto p-6 lg:w-1/2">
        <div className="w-full max-w-md space-y-6">
          {/* 모바일용 로고 */}
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <img
              src="/logo/09_dark_transparent.png"
              alt="Lestly"
              className="h-28 object-contain"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-col items-center">
              <CardTitle className="text-2xl font-semibold" role="heading">
                관리자 회원가입
              </CardTitle>
              <CardDescription className="text-center text-base">
                레슨을 운영할 관리자 계정을 만들어보세요
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Form className="flex w-full flex-col gap-4" method="post">
                <div className="flex flex-col items-start space-y-2">
                  <Label
                    htmlFor="email"
                    className="flex flex-col items-start gap-1"
                  >
                    이메일
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    required
                    type="email"
                    placeholder="admin@company.com"
                    autoComplete="email"
                  />
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors?.email ? (
                    <FormErrors errors={actionData.fieldErrors.email} />
                  ) : null}
                </div>
                <FormButton label="인증 코드 받기" className="w-full" />
                {actionData && "error" in actionData && actionData.error ? (
                  <FormErrors errors={[actionData.error]} />
                ) : null}
              </Form>
            </CardContent>
          </Card>

          <div className="flex flex-col items-center justify-center text-sm">
            <p className="text-muted-foreground">
              이미 계정이 있으신가요?{" "}
              <Link
                to="/login"
                viewTransition
                className="text-primary hover:text-primary/80 font-medium underline transition-colors"
              >
                로그인
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
