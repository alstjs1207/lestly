/**
 * Set Password Screen Component
 *
 * This component handles password setup for invited users.
 * When users click on invite links sent by administrators, they are
 * redirected to this page to set their initial password.
 */
import type { Route } from "./+types/set-password";

import { CheckCircle2Icon } from "lucide-react";
import { useEffect, useRef } from "react";
import { redirect } from "react-router";
import { Form, data, useNavigate } from "react-router";
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

export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `비밀번호 설정 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

const setPasswordSchema = z
  .object({
    password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
    confirmPassword: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다.",
    path: ["confirmPassword"],
  });

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  // Redirect to login if user is not authenticated
  if (!user) {
    return redirect("/login");
  }

  return { email: user.email };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  // Redirect to login if user is not authenticated
  if (!user) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const {
    success,
    data: validData,
    error,
  } = setPasswordSchema.safeParse(Object.fromEntries(formData));

  if (!success) {
    return data({ fieldErrors: error.flatten().fieldErrors }, { status: 400 });
  }

  const { error: updateError } = await client.auth.updateUser({
    password: validData.password,
  });

  if (updateError) {
    return data({ error: updateError.message }, { status: 400 });
  }

  return { success: true };
}

export default function SetPassword({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (actionData && "success" in actionData && actionData.success) {
      formRef.current?.reset();
      formRef.current?.querySelectorAll("input")?.forEach((input) => {
        input.blur();
      });
      // Redirect to dashboard after successful password setup
      const timer = setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [actionData, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center">
          <CardTitle className="text-2xl font-semibold">
            비밀번호 설정
          </CardTitle>
          <CardDescription className="text-center text-base">
            {loaderData?.email}
            <br />
            로그인에 사용할 비밀번호를 설정해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Form
            className="flex w-full flex-col gap-4"
            method="post"
            ref={formRef}
          >
            <div className="flex flex-col items-start space-y-2">
              <Label htmlFor="password" className="flex flex-col items-start gap-1">
                비밀번호
              </Label>
              <Input
                id="password"
                name="password"
                required
                type="password"
                placeholder="8자 이상 입력하세요"
              />
              {actionData &&
              "fieldErrors" in actionData &&
              actionData.fieldErrors.password ? (
                <FormErrors errors={actionData.fieldErrors.password} />
              ) : null}
            </div>
            <div className="flex flex-col items-start space-y-2">
              <Label htmlFor="confirmPassword" className="flex flex-col items-start gap-1">
                비밀번호 확인
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                required
                type="password"
                placeholder="비밀번호를 다시 입력하세요"
              />
              {actionData &&
              "fieldErrors" in actionData &&
              actionData.fieldErrors.confirmPassword ? (
                <FormErrors errors={actionData.fieldErrors.confirmPassword} />
              ) : null}
            </div>
            <FormButton label="비밀번호 설정" />
            {actionData && "error" in actionData && actionData.error ? (
              <FormErrors errors={[actionData.error]} />
            ) : null}
            {actionData && "success" in actionData && actionData.success ? (
              <div className="flex flex-col items-center justify-center gap-2 text-sm text-green-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2Icon className="size-4" />
                  <p>비밀번호가 설정되었습니다.</p>
                </div>
                <p className="text-muted-foreground">잠시 후 메인 페이지로 이동합니다...</p>
              </div>
            ) : null}
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
