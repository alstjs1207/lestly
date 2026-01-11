import type { Route } from "./+types/update";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();
  const { studentId } = params;

  // Profile updates (personal info)
  const profileUpdates = {
    name: formData.get("name") as string,
    region: formData.get("region") as string,
    birth_date: formData.get("birth_date") as string,
    phone: formData.get("phone") as string,
    class_start_date: formData.get("class_start_date") as string,
    class_end_date: formData.get("class_end_date") as string,
    parent_name: (formData.get("parent_name") as string) || null,
    parent_phone: (formData.get("parent_phone") as string) || null,
    description: (formData.get("description") as string) || null,
    color: (formData.get("color") as string) || "#3B82F6",
  };

  // Membership updates (state and type are on organization_members table)
  const membershipUpdates = {
    state: formData.get("state") as "NORMAL" | "GRADUATE" | "DELETED",
    type: formData.get("type") as "EXAMINEE" | "DROPPER" | "ADULT",
  };

  // Update profile
  const { error: profileError } = await client
    .from("profiles")
    .update(profileUpdates)
    .eq("profile_id", studentId);

  if (profileError) {
    throw new Error(profileError.message);
  }

  // Update membership (state and type)
  const { error: membershipError } = await client
    .from("organization_members")
    .update(membershipUpdates)
    .eq("organization_id", organizationId)
    .eq("profile_id", studentId);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  return redirect(`/admin/students/${studentId}`);
}
