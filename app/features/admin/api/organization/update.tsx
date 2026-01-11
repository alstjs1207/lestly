import type { Route } from "./+types/update";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { updateOrganization } from "~/features/organizations/queries";

import { requireAdminRole } from "../../guards.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;

  await updateOrganization(client, {
    organizationId,
    updates: {
      name,
      description: description || null,
    },
  });

  return redirect("/admin/organization");
}
