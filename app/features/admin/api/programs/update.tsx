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

const BUCKET_NAME = "coverimages";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const programId = parseInt(params.programId);
  const formData = await request.formData();

  // 기본 필드
  const title = formData.get("title") as string;
  const status = formData.get("status") as "DRAFT" | "ACTIVE" | "ARCHIVED";
  const subtitle = formData.get("subtitle") as string | null;
  const description = formData.get("description") as string | null;
  const level = formData.get("level") as
    | "BEGINNER"
    | "INTERMEDIATE"
    | "ADVANCED"
    | null;
  const priceStr = formData.get("price") as string | null;
  const price = priceStr ? parseFloat(priceStr) : null;

  // 강사
  const instructorIdStr = formData.get("instructor_id") as string | null;
  const instructorId = instructorIdStr ? parseInt(instructorIdStr, 10) : null;

  // 공개 페이지 필드
  const slug = formData.get("slug") as string | null;
  const locationType = formData.get("location_type") as string | null;
  const locationAddress = formData.get("location_address") as string | null;
  const durationMinutesStr = formData.get("duration_minutes") as string | null;
  const durationMinutes = durationMinutesStr
    ? parseInt(durationMinutesStr, 10)
    : null;
  const totalSessionsStr = formData.get("total_sessions") as string | null;
  const totalSessions = totalSessionsStr
    ? parseInt(totalSessionsStr, 10)
    : null;
  const maxCapacityStr = formData.get("max_capacity") as string | null;
  const maxCapacity = maxCapacityStr ? parseInt(maxCapacityStr, 10) : null;
  const isPublic = formData.get("is_public") === "on";

  // JSONB 필드
  const curriculumStr = formData.get("curriculum") as string | null;
  const curriculum = curriculumStr ? JSON.parse(curriculumStr) : [];

  // 커버 이미지 처리
  let coverImageUrl: string | null = null;
  const coverImageFile = formData.get("cover_image") as File | null;
  const existingCoverImageUrl = formData.get("existing_cover_image_url") as string | null;

  if (coverImageFile && coverImageFile.size > 0) {
    // 새 이미지 업로드
    const ext = coverImageFile.name.split(".").pop() || "jpg";
    const path = `programs/${programId}/cover.${ext}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(path, coverImageFile, { upsert: true });

    if (!uploadError) {
      const { data: urlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);
      coverImageUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    }
  } else if (existingCoverImageUrl) {
    // 기존 이미지 유지
    coverImageUrl = existingCoverImageUrl;
  }

  await updateProgram(client, {
    programId,
    updates: {
      instructor_id: instructorId,
      title,
      status,
      subtitle: subtitle || null,
      description: description || null,
      level: level || null,
      price: price || null,
      slug: slug || null,
      cover_image_url: coverImageUrl,
      location_type: locationType || "offline",
      location_address: locationAddress || null,
      duration_minutes: durationMinutes || 120,
      total_sessions: totalSessions || 4,
      curriculum,
      max_capacity: maxCapacity || null,
      is_public: isPublic,
    },
  });

  return redirect(`/admin/programs/${programId}`);
}
