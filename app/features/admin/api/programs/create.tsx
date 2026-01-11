/**
 * Program Creation API
 *
 * Creates a new program for the organization.
 */
import type { Route } from "./+types/create";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { createProgram } from "~/features/programs/queries";

import { requireAdminRole } from "../../guards.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

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

  const program = await createProgram(client, {
    organization_id: organizationId,
    title,
    status,
    subtitle: subtitle || null,
    description: description || null,
    instructor_name: instructorName || null,
    instructor_info: instructorInfo || null,
    level: level || null,
    price: price || null,
  });

  return redirect(`/admin/programs/${program.program_id}`);
}
