/**
 * Instructor Delete API
 */
import type { Route } from "./+types/delete";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { deleteInstructor } from "~/features/instructors/queries";

import { requireAdminRole } from "../../guards.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const instructorId = parseInt(params.instructorId);

  await deleteInstructor(client, { instructorId });

  return redirect("/admin/instructors");
}
