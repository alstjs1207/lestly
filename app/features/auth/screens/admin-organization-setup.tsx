/**
 * Admin Registration Screen - Step 4: Organization Setup
 *
 * This component handles the final step of admin registration:
 * - Organization name and description input
 * - Creates organization in database
 * - Creates organization_members entry with ADMIN role
 * - Redirects to admin dashboard upon completion
 */
import type { Route } from "./+types/admin-organization-setup";

import { BuildingIcon, CalendarIcon } from "lucide-react";
import { Form, data, redirect } from "react-router";
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
import { Textarea } from "~/core/components/ui/textarea";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

/**
 * Meta function for the organization setup page
 */
export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `조직 설정 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

/**
 * Loader to check if user is authenticated and needs organization setup
 */
export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return redirect("/admin/signup");
  }

  // Check if user already has admin membership in any organization
  const { data: memberships } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("role", "ADMIN")
    .eq("state", "NORMAL")
    .limit(1);

  // If already has admin organization, redirect to admin dashboard
  if (memberships && memberships.length > 0) {
    return redirect("/admin");
  }

  return { user };
}

/**
 * Form validation schema for organization setup
 */
const organizationSchema = z.object({
  name: z.string().min(1, { message: "조직명을 입력해주세요" }),
  description: z.string().optional(),
});

/**
 * Server action for handling organization creation
 */
export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return redirect("/admin/signup");
  }

  // Check if user already has admin membership
  const { data: existingMemberships } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("role", "ADMIN")
    .eq("state", "NORMAL")
    .limit(1);

  if (existingMemberships && existingMemberships.length > 0) {
    return redirect("/admin");
  }

  // Parse form data
  const formData = await request.formData();
  const {
    data: validData,
    success,
    error,
  } = organizationSchema.safeParse(Object.fromEntries(formData));

  if (!success) {
    return data({ fieldErrors: error.flatten().fieldErrors }, { status: 400 });
  }

  // Create organization using admin client (bypasses RLS)
  const { data: organization, error: orgError } = await adminClient
    .from("organizations")
    .insert({
      name: validData.name,
      description: validData.description || null,
    })
    .select()
    .single();

  if (orgError) {
    return data({ error: orgError.message }, { status: 400 });
  }

  // Create organization_members entry with ADMIN role
  const { error: memberError } = await adminClient
    .from("organization_members")
    .insert({
      organization_id: organization.organization_id,
      profile_id: user.id,
      role: "ADMIN",
      state: "NORMAL",
    });

  if (memberError) {
    // Rollback: delete the created organization
    await adminClient
      .from("organizations")
      .delete()
      .eq("organization_id", organization.organization_id);
    return data({ error: memberError.message }, { status: 400 });
  }

  // Redirect to admin dashboard
  return redirect("/admin");
}

/**
 * Admin Registration Component - Step 4: Organization Setup
 */
export default function AdminOrganizationSetup({
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen">
      {/* 왼쪽 패널 - 서비스 소개 (데스크톱만 표시) */}
      <div className="bg-primary text-primary-foreground hidden flex-col items-center justify-center p-12 lg:flex lg:w-1/2">
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
            <BuildingIcon className="text-primary-foreground/80 mx-auto size-16" />
            <h1 className="text-3xl font-bold">마지막 단계입니다!</h1>
            <p className="text-primary-foreground/80 text-lg">
              운영하시는 개인 레슨 정보를 입력하시면
              <br />
              모든 준비가 완료됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 오른쪽 패널 - 조직 설정 폼 */}
      <div className="flex w-full flex-col items-center justify-center overflow-y-auto p-6 lg:w-1/2">
        <div className="w-full max-w-md space-y-6">
          {/* 모바일용 로고 */}
          <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div className="bg-primary text-primary-foreground flex aspect-square size-10 items-center justify-center rounded-lg">
              <CalendarIcon className="size-5" />
            </div>
            <span className="text-2xl font-bold">Lestly</span>
          </div>

          <Card>
            <CardHeader className="flex flex-col items-center">
              <CardTitle className="text-2xl font-semibold" role="heading">
                레슨 설정
              </CardTitle>
              <CardDescription className="text-center text-base">
                관리하실 레슨 정보를 입력해주세요
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Form className="flex w-full flex-col gap-5" method="post">
                <div className="flex flex-col items-start space-y-2">
                  <Label
                    htmlFor="name"
                    className="flex flex-col items-start gap-1"
                  >
                    레슨명
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    type="text"
                    placeholder="예: OO 개인 레슨"
                  />
                  {actionData &&
                  "fieldErrors" in actionData &&
                  actionData.fieldErrors?.name ? (
                    <FormErrors errors={actionData.fieldErrors.name} />
                  ) : null}
                </div>
                <div className="flex flex-col items-start space-y-2">
                  <Label
                    htmlFor="description"
                    className="flex flex-col items-start gap-1"
                  >
                    소개
                    <small className="text-muted-foreground">선택사항</small>
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="레슨에 대한 간단한 소개를 입력해주세요"
                    rows={3}
                  />
                </div>
                <FormButton label="시작하기" className="w-full" />
                {actionData && "error" in actionData && actionData.error ? (
                  <FormErrors errors={[actionData.error]} />
                ) : null}
              </Form>
            </CardContent>
          </Card>

          {/* 진행 상황 표시 */}
          <div className="flex items-center justify-center gap-2">
            <div className="bg-primary size-2 rounded-full" />
            <div className="bg-primary size-2 rounded-full" />
            <div className="bg-primary size-2 rounded-full" />
            <div className="bg-primary size-2 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
