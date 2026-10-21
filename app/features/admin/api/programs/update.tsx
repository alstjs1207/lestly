/**
 * Program Update API
 *
 * Updates an existing program.
 */
import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { updateProgram } from "~/features/programs/queries";

import { requireAdminRole } from "../../guards.server";
import {
  getCatalogFormError,
  parseCatalogId,
  parseProgramForm,
  validateCatalogImage,
} from "../../lib/catalog-form.server";

const BUCKET_NAME = "coverimages";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const programId = parseCatalogId(params.programId);
  if (programId === null) {
    return data(
      { error: "올바른 항목을 선택해 주세요." },
      { status: 400, headers },
    );
  }
  const formData = await request.formData();

  const parsed = parseProgramForm(formData);
  if (!parsed.success) {
    return data(
      { error: getCatalogFormError(parsed.error) },
      { status: 400, headers },
    );
  }
  const {
    title,
    status,
    subtitle,
    description,
    level,
    price,
    instructor_id: instructorId,
    slug,
    location_type: locationType,
    location_address: locationAddress,
    duration_minutes: durationMinutes,
    total_sessions: totalSessions,
    max_capacity: maxCapacity,
    is_public: isPublic,
    curriculum,
  } = parsed.data;
  const image = await validateCatalogImage(formData.get("cover_image"));
  if (!image.success) {
    return data({ error: image.error }, { status: 400, headers });
  }
  const coverImageFile = image.file;
  // Check the selected tenant before touching its public storage path.
  const { data: currentRecord, error: targetError } = await client
    .from("programs")
    .select("program_id")
    .eq("program_id", programId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (targetError || !currentRecord) {
    return data(
      { error: "수정할 항목을 찾을 수 없습니다." },
      { status: 404, headers },
    );
  }

  // 커버 이미지 처리
  let coverImageUrl: string | null = null;
  const existingCoverImageUrl = parsed.data.existing_cover_image_url;

  if (coverImageFile && coverImageFile.size > 0) {
    // 새 이미지 업로드
    const ext = image.extension;
    const path = `programs/${programId}/cover.${ext}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(path, coverImageFile, {
        upsert: true,
        contentType: coverImageFile.type,
      });

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

  try {
    await updateProgram(client, {
      programId,
      updates: {
        instructor_id: instructorId,
        title,
        status,
        subtitle: subtitle || null,
        description: description || null,
        level: level || null,
        price,
        slug: slug || null,
        cover_image_url: coverImageUrl,
        location_type: locationType || "offline",
        location_address: locationAddress || null,
        duration_minutes: durationMinutes ?? 120,
        total_sessions: totalSessions ?? 4,
        curriculum,
        max_capacity: maxCapacity || null,
        is_public: isPublic,
      },
    });
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError?.code === "23505") {
      return data(
        {
          error:
            "이미 사용 중인 URL 슬러그입니다. 다른 슬러그를 입력해 주세요.",
        },
        { status: 400, headers },
      );
    }
    console.error("Failed to update program", error);
    return data(
      {
        error: "클래스 정보를 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500, headers },
    );
  }

  return redirect(`/admin/programs/${programId}`, { headers });
}
