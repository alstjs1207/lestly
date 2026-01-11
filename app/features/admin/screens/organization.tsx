import type { Route } from "./+types/organization";

import { useFetcher } from "react-router";

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
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { getOrganization } from "~/features/organizations/queries";

import { requireAdminRole } from "../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const organization = await getOrganization(client, { organizationId });

  return {
    organization,
  };
}

export default function OrganizationScreen({ loaderData }: Route.ComponentProps) {
  const { organization } = loaderData;
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  if (!organization) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">조직 정보</h1>
          <p className="text-muted-foreground">조직 정보를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">조직 정보</h1>
        <p className="text-muted-foreground">
          조직의 기본 정보를 관리합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>
            조직의 이름과 설명을 수정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" action="/api/admin/organization" className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">조직 이름</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  defaultValue={organization.name}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">조직 설명</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={organization.description ?? ""}
                  placeholder="조직에 대한 간단한 설명을 입력하세요"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "저장 중..." : "저장"}
              </Button>
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  );
}
