import type { Route } from "./+types/delete";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const { studentId } = params;

  // Update state in organization_members (N:N relationship)
  const { error } = await client
    .from("organization_members")
    .update({ state: "DELETED" })
    .eq("organization_id", organizationId)
    .eq("profile_id", studentId)
    .eq("role", "STUDENT");

  if (error) {
    throw new Error(error.message);
  }

  return redirect("/admin/students");
}
