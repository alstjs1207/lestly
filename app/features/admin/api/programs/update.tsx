/**
 * Program Update API
 *
 * Updates an existing program.
 */
import type { Route } from "./+types/update";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { updateProgram } from "~/features/programs/queries";

import { requireAdminRole } from "../../guards.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const programId = parseInt(params.programId);
  const formData = await request.formData();

  const title = formData.get("title") as string;
  const status = formData.get("status") as "DRAFT" | "ACTIVE" | "ARCHIVED";
  const subtitle = formData.get("subtitle") as string | null;
  const description = formData.get("description") as string | null;
  const instructorName = formData.get("instructor_name") as string | null;
  const instructorInfo = formData.get("instructor_info") as string | null;
  const level = formData.get("level") as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  const priceStr = formData.get("price") as string | null;
  const price = priceStr ? parseFloat(priceStr) : null;

  await updateProgram(client, {
    programId,
    updates: {
      title,
      status,
      subtitle: subtitle || null,
      description: description || null,
      instructor_name: instructorName || null,
      instructor_info: instructorInfo || null,
      level: level || null,
      price: price || null,
    },
  });

  return redirect(`/admin/programs/${programId}`);
}
