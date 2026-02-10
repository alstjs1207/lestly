/**
 * Password Reset Request Screen Component
 *
 * This component handles the first step of the password reset flow:
 * allowing users to request a password reset link via email.
 *
 * The component includes:
 * - Email input field with validation
 * - Form submission handling
 * - Success confirmation after sending reset link
 * - Error handling for invalid emails or server issues
 */
import type { Route } from "./+types/forgot-password";

import { CalendarIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Form, Link, data } from "react-router";
import { z } from "zod";

import FormButton from "~/core/components/form-button";
import FormErrors from "~/core/components/form-error";
import FormSuccess from "~/core/components/form-success";
import { Button } from "~/core/components/ui/button";
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
 * Meta function for the forgot password page
 *
 * Sets the page title using the application name from environment variables
 */
export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `비밀번호 찾기 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

/**
 * Form validation schema for password reset request
 *
 * Uses Zod to validate the email field to ensure it's a valid email format
 * before attempting to send a reset link
 */
const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "올바른 이메일 주소를 입력해주세요" }),
});

/**
 * Server action for handling password reset request form submission
 *
 * This function processes the form data and attempts to send a password reset email.
 * The flow is:
 * 1. Parse and validate the email using the schema
 * 2. Return validation errors if the email is invalid
 * 3. Request a password reset email from Supabase auth
 * 4. Return success or error response
 *
 * Note: For security reasons, this endpoint returns success even if the email
 * doesn't exist in the system, to prevent email enumeration attacks.
 *
 * @param request - The form submission request
 * @returns Validation errors, auth errors, or success confirmation
 */
export async function action({ request }: Route.ActionArgs) {
  // Parse and validate form data
  const formData = await request.formData();
  const result = forgotPasswordSchema.safeParse(Object.fromEntries(formData));

  // Return validation errors if email is invalid
  if (!result.success) {
    return data(
      { fieldErrors: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  // Create Supabase client
  const [client] = makeServerClient(request);

  // Request password reset email from Supabase
  const { error } = await client.auth.resetPasswordForEmail(result.data.email);

  // Return error if request fails
  if (error) {
    return data({ error: error.message }, { status: 400 });
  }

  // Return success response
  return { success: true };
}

/**
 * Password Reset Request Component
 *
 * This component renders the form for requesting a password reset link.
 * It includes:
 * - Email input field with validation
 * - Submit button for requesting the reset link
 * - Error display for validation and server errors
 * - Success confirmation message after sending the reset link
 *
 * @param actionData - Data returned from the form action, including errors or success status
 */
export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  // Reference to the form element for resetting after successful submission
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the form when the reset link is successfully sent
  useEffect(() => {
    if (actionData && "success" in actionData && actionData.success) {
      formRef.current?.reset();
      formRef.current?.blur();
    }
  }, [actionData]);
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

          {/* CTA */}
          <div className="space-y-4 pt-8">
            <p className="text-xl font-semibold">지금 바로 Lestly 사용해보기</p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="w-full max-w-xs"
            >
              <Link to="/admin/signup">관리자 회원가입하기</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* 오른쪽 패널 - 비밀번호 찾기 폼 */}
      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2">
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
              <CardTitle className="text-2xl font-semibold">
                비밀번호 찾기
              </CardTitle>
              <CardDescription className="text-center text-base">
                이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Form
                className="flex w-full flex-col gap-5"
                method="post"
                ref={formRef}
              >
                <div className="flex flex-col items-start space-y-2">
                  <Label htmlFor="email" className="flex flex-col items-start gap-1">
                    이메일
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    required
                    type="email"
                    placeholder="example@lestly.io"
                  />
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors.email ? (
                    <FormErrors errors={actionData.fieldErrors.email} />
                  ) : null}
                </div>
                <FormButton label="재설정 링크 보내기" className="w-full" />
                {actionData && "error" in actionData && actionData.error ? (
                  <FormErrors errors={[actionData.error]} />
                ) : null}
                {actionData && "success" in actionData && actionData.success ? (
                  <FormSuccess message="비밀번호 재설정 링크가 이메일로 전송되었습니다. 이 탭을 닫으셔도 됩니다." />
                ) : null}
              </Form>
            </CardContent>
          </Card>

          <div className="flex flex-col items-center justify-center text-sm">
            <p className="text-muted-foreground">
              비밀번호가 기억나셨나요?{" "}
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
