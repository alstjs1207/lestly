/**
 * Login Screen Component
 *
 * This component handles user authentication via email/password login,
 * social authentication providers, and provides options for password reset
 * and email verification. It demonstrates form validation, error handling,
 * and Supabase authentication integration.
 */
import type { Route } from "./+types/login";

import { AlertCircle, CalendarIcon, Loader2Icon } from "lucide-react";
import { useRef } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useFetcher,
  useRouteLoaderData,
} from "react-router";
import { z } from "zod";

import FormButton from "~/core/components/form-button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "~/core/components/ui/alert";
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
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import FormErrors from "../../../core/components/form-error";
import { isAdmin } from "../../admin/guards.server";
import { SignInButtons } from "../components/auth-login-buttons";

/**
 * Meta function for the login page
 *
 * Sets the page title using the application name from environment variables
 */
export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `로그인 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

/**
 * Form validation schema for login
 *
 * Uses Zod to validate:
 * - Email: Must be a valid email format
 * - Password: Must be at least 8 characters long
 *
 * Error messages are provided for user feedback
 */
const loginSchema = z.object({
  email: z.string().email({ message: "올바른 이메일 주소를 입력해주세요" }),
  password: z
    .string()
    .min(8, { message: "비밀번호는 최소 8자 이상이어야 합니다" }),
});

/**
 * Server action for handling login form submission
 *
 * This function processes the login form data and attempts to authenticate the user.
 * The flow is:
 * 1. Parse and validate form data using the login schema
 * 2. Return validation errors if the data is invalid
 * 3. Attempt to sign in with Supabase using email/password
 * 4. Return authentication errors if sign-in fails
 * 5. Redirect to home page with auth cookies if successful
 *
 * @param request - The form submission request
 * @returns Validation errors, auth errors, or redirect on success
 */
export async function action({ request }: Route.ActionArgs) {
  // Parse form data from the request
  const formData = await request.formData();
  const {
    data: validData,
    success,
    error,
  } = loginSchema.safeParse(Object.fromEntries(formData));

  // Return validation errors if form data is invalid
  if (!success) {
    return data({ fieldErrors: error.flatten().fieldErrors }, { status: 400 });
  }

  // Create Supabase client with request cookies for authentication
  const [client, headers] = makeServerClient(request);

  // Attempt to sign in with email and password
  const { error: signInError } = await client.auth.signInWithPassword({
    ...validData,
  });

  // Return error if authentication fails
  if (signInError) {
    // Check if this might be an incomplete admin signup user
    if (signInError.message === "Invalid login credentials") {
      // Get user by email using admin client
      const { data: usersData } = await adminClient.auth.admin.listUsers();
      const existingUser = usersData?.users.find(
        (u) => u.email === validData.email,
      );

      if (existingUser) {
        // Check if user has incomplete profile (no name)
        const { data: profile } = await adminClient
          .from("profiles")
          .select("profile_id, name")
          .eq("profile_id", existingUser.id)
          .single();

        // If user exists but has no name (incomplete profile)
        if (profile && (!profile.name || profile.name === "")) {
          // Check if user has no organization (incomplete signup)
          const { data: memberships } = await adminClient
            .from("organization_members")
            .select("organization_id")
            .eq("profile_id", profile.profile_id)
            .eq("role", "ADMIN")
            .limit(1);

          if (!memberships || memberships.length === 0) {
            // Send OTP via signInWithOtp for the user to receive
            await client.auth.signInWithOtp({
              email: validData.email,
              options: { shouldCreateUser: false },
            });

            // Redirect to verify page with incomplete flag
            return redirect(
              `/admin/signup/verify?email=${encodeURIComponent(validData.email)}&incomplete=true`,
            );
          }
        }
      }
    }
    return data({ error: signInError.message }, { status: 400 });
  }

  // Check if user is admin and redirect accordingly
  const adminUser = await isAdmin(client);

  // redirect 파라미터 확인
  const url = new URL(request.url);
  const redirectParam = url.searchParams.get("redirect");

  // 관리자이고 redirect 파라미터가 /admin 또는 /super-admin으로 시작하면 해당 경로로
  if (
    redirectParam &&
    adminUser &&
    (redirectParam.startsWith("/admin") ||
      redirectParam.startsWith("/super-admin"))
  ) {
    return redirect(redirectParam, { headers });
  }

  // 기존 로직
  const redirectTo = adminUser ? "/admin" : "/dashboard";
  return redirect(redirectTo, { headers });
}

/**
 * Login Component
 *
 * This component renders the login form and handles user interactions.
 * It includes:
 * - Email and password input fields with validation
 * - Error display for form validation and authentication errors
 * - Password reset link
 * - Email verification resend functionality
 * - Social login options
 * - Sign up link for new users
 *
 * @param actionData - Data returned from the form action, including any errors
 */
export default function Login({ actionData }: Route.ComponentProps) {
  // Reference to the form element for accessing form data
  const formRef = useRef<HTMLFormElement>(null);
  const rootData = useRouteLoaderData<{ env: { SHOW_ADMIN_SIGNUP: boolean } }>(
    "root",
  );
  const showAdminSignup = rootData?.env?.SHOW_ADMIN_SIGNUP ?? true;

  // Fetcher for submitting the email verification resend request
  const fetcher = useFetcher();

  /**
   * Handler for resending email verification
   *
   * When a user tries to log in with an unverified email, they can click
   * to resend the verification email. This function:
   * 1. Prevents the default button behavior
   * 2. Gets the current form data (email only)
   * 3. Submits it to the resend endpoint
   */
  const onResendClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.delete("password"); // Only need the email for resending verification
    fetcher.submit(formData, {
      method: "post",
      action: "/auth/api/resend",
    });
  };

  return (
    <div className="flex min-h-screen">
      {/* 왼쪽 패널 - 서비스 소개 (데스크톱만 표시) */}
      <div className="bg-primary text-primary-foreground hidden flex-col items-center justify-center p-12 lg:flex lg:w-1/2">
        <div className="max-w-md space-y-8 pb-18 text-center">
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
          {showAdminSignup && (
            <div className="space-y-4 pt-8">
              <p className="text-xl font-semibold">
                지금 바로 Lestly 사용해보기
              </p>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="w-full max-w-xs"
              >
                <Link to="/admin/signup">관리자 회원가입하기</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽 패널 - 로그인 폼 */}
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
              <CardTitle className="text-2xl font-semibold">로그인</CardTitle>
              <CardDescription className="text-base">
                계정 정보를 입력해주세요
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Form
                className="flex w-full flex-col gap-5"
                method="post"
                ref={formRef}
              >
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
                    placeholder="example@lestly.io"
                  />
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors.email ? (
                    <FormErrors errors={actionData.fieldErrors.email} />
                  ) : null}
                </div>
                <div className="flex flex-col items-start space-y-2">
                  <div className="flex w-full items-center justify-between">
                    <Label
                      htmlFor="password"
                      className="flex flex-col items-start gap-1"
                    >
                      비밀번호
                    </Label>
                    <Link
                      to="/auth/forgot-password/reset"
                      className="text-muted-foreground text-underline hover:text-foreground self-end text-sm underline transition-colors"
                      tabIndex={-1}
                      viewTransition
                    >
                      비밀번호 찾기
                    </Link>
                  </div>
                  <Input
                    id="password"
                    name="password"
                    required
                    type="password"
                    placeholder="비밀번호를 입력하세요"
                  />

                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors.password ? (
                    <FormErrors errors={actionData.fieldErrors.password} />
                  ) : null}
                </div>
                <FormButton label="로그인" className="w-full" />
                {actionData && "error" in actionData ? (
                  actionData.error === "Email not confirmed" ? (
                    <Alert variant="destructive" className="bg-destructive/10">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>이메일 인증 필요</AlertTitle>
                      <AlertDescription className="flex flex-col items-start gap-2">
                        로그인하기 전에 이메일을 인증해주세요.
                        <Button
                          variant="outline"
                          className="text-foreground flex items-center justify-between gap-2"
                          onClick={onResendClick}
                        >
                          인증 이메일 재발송
                          {fetcher.state === "submitting" ? (
                            <Loader2Icon
                              data-testid="resend-confirmation-email-spinner"
                              className="size-4 animate-spin"
                            />
                          ) : null}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <FormErrors errors={[actionData.error]} />
                  )
                ) : null}
              </Form>
              <SignInButtons />
            </CardContent>
          </Card>

          {/* 모바일용 관리자 회원가입 링크 */}
          {showAdminSignup && (
            <div className="flex flex-col items-center justify-center gap-4 text-sm lg:hidden">
              <p className="text-muted-foreground">
                소규모 클래스 또는 개인 레슨, 프라이빗 레슨을 운영하시나요?{" "}
                <Link
                  to="/admin/signup"
                  viewTransition
                  className="text-primary hover:text-primary/80 font-medium underline transition-colors"
                >
                  관리자 회원가입
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
