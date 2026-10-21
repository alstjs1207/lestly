/**
 * Admin Registration Screen - Step 2: OTP Verification
 *
 * This component handles the second step of admin registration:
 * - OTP code input (6 digits)
 * - Verification via Supabase verifyOtp
 * - Session is automatically created upon successful verification
 * - Redirects to profile setup page after verification
 */
import type { Route } from "./+types/admin-signup-verify";

import { AlertCircleIcon, CalendarIcon, MailIcon } from "lucide-react";
import { useState } from "react";
import { Form, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import FormButton from "~/core/components/form-button";
import FormErrors from "~/core/components/form-error";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "~/core/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "~/core/components/ui/input-otp";
import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

/**
 * Meta function for the OTP verification page
 */
export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `이메일 인증 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

/**
 * Loader to get email and incomplete flag from query params
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const incomplete = url.searchParams.get("incomplete") === "true";

  if (!email) {
    return redirect("/admin/signup");
  }

  return { email, incomplete };
}

/**
 * Form validation schema for OTP verification
 */
const verifySchema = z.object({
  email: z.string().email(),
  token: z.string().length(8, { message: "8자리 인증 코드를 입력해주세요" }),
  intent: z.enum(["verify", "resend"]),
});

/**
 * Server action for OTP verification and resend
 */
export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const formData = await request.formData();
  const {
    data: validData,
    success,
    error,
  } = verifySchema.safeParse(Object.fromEntries(formData));

  if (!success) {
    return data({ fieldErrors: error.flatten().fieldErrors }, { status: 400 });
  }

  const [client, headers] = makeServerClient(request);

  // Handle resend OTP using resend API (uses Confirm signup template)
  if (validData.intent === "resend") {
    const { error: resendError } = await client.auth.resend({
      type: "signup",
      email: validData.email,
    });

    if (resendError) {
      return data({ error: resendError.message }, { status: 400 });
    }

    return data({ success: true, message: "인증 코드가 재발송되었습니다" });
  }

  // Verify OTP code
  const { error: verifyError } = await client.auth.verifyOtp({
    email: validData.email,
    token: validData.token,
    type: "email",
  });

  if (verifyError) {
    return data({ error: verifyError.message }, { status: 400 });
  }

  // Verification successful - session is now active
  // Redirect to profile setup
  return redirect("/admin/signup/profile", { headers });
}

/**
 * Admin Registration Component - Step 2: OTP Verification
 */
export default function AdminSignupVerify({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { email, incomplete } = loaderData;
  const [otpValue, setOtpValue] = useState("");
  const resendFetcher = useFetcher();

  const isResending = resendFetcher.state !== "idle";
  const resendSuccess = resendFetcher.data?.success;

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

          {/* 안내 메시지 */}
          <div className="space-y-4">
            <MailIcon className="text-primary-foreground/80 mx-auto size-16" />
            <h1 className="text-3xl font-bold">이메일을 확인해주세요</h1>
            <p className="text-primary-foreground/80 text-lg">
              입력하신 이메일로 인증 코드를 발송했습니다.
              <br />
              이메일을 확인하고 8자리 코드를 입력해주세요.
            </p>
          </div>
        </div>
      </div>

      {/* 오른쪽 패널 - 인증 폼 */}
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

          {/* 미완성 회원가입 안내 */}
          {incomplete && (
            <Alert>
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>회원가입을 완료해주세요</AlertTitle>
              <AlertDescription>
                이전에 회원가입을 완료하지 않으셨습니다. 인증 코드를 입력하여
                회원가입을 계속 진행해주세요.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-col items-center">
              <CardTitle className="text-2xl font-semibold" role="heading">
                이메일 인증
              </CardTitle>
              <CardDescription className="text-center text-base">
                <span className="text-foreground font-medium">{email}</span>
                <br />
                으로 발송된 인증 코드를 입력해주세요
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Form className="flex w-full flex-col gap-6" method="post">
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="intent" value="verify" />

                <div className="flex flex-col items-center space-y-4">
                  <InputOTP
                    maxLength={8}
                    value={otpValue}
                    onChange={setOtpValue}
                    name="token"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot
                        index={0}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                      <InputOTPSlot
                        index={1}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                      <InputOTPSlot
                        index={2}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                      <InputOTPSlot
                        index={3}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot
                        index={4}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                      <InputOTPSlot
                        index={5}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                      <InputOTPSlot
                        index={6}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                      <InputOTPSlot
                        index={7}
                        className="size-9 text-base sm:size-11 sm:text-lg"
                      />
                    </InputOTPGroup>
                  </InputOTP>

                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors?.token ? (
                    <FormErrors errors={actionData.fieldErrors.token} />
                  ) : null}
                </div>

                <FormButton label="확인" className="w-full" />

                {actionData && "error" in actionData && actionData.error ? (
                  <FormErrors errors={[actionData.error]} />
                ) : null}
              </Form>

              {/* 재발송 영역 */}
              <div className="flex flex-col items-center gap-2 border-t pt-2">
                <p className="text-muted-foreground text-sm">
                  코드를 받지 못하셨나요?
                </p>
                <resendFetcher.Form method="post">
                  <input type="hidden" name="email" value={email} />
                  <input type="hidden" name="intent" value="resend" />
                  <input type="hidden" name="token" value="00000000" />
                  <button
                    type="submit"
                    disabled={isResending}
                    className="text-primary hover:text-primary/80 text-sm font-medium underline transition-colors disabled:opacity-50"
                  >
                    {isResending ? "발송 중..." : "인증 코드 재발송"}
                  </button>
                </resendFetcher.Form>
                {resendSuccess && (
                  <p className="text-sm text-green-600">
                    인증 코드가 재발송되었습니다
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
