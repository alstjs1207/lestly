/**
 * Program Creation API
 *
 * Creates a new program for the organization.
 */
import type { Route } from "./+types/create";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getBookingPolicy } from "~/features/app-settings/booking-policy.server";
import { getMaxConcurrentStudents } from "~/features/app-settings/queries";
import {
  programBookingDefaults,
  programBookingSchema,
} from "~/features/programs/booking-policy";
import { createProgram } from "~/features/programs/queries";

import { requireAdminRole } from "../../guards.server";
import {
  getCatalogFormError,
  parseProgramForm,
  validateCatalogImage,
} from "../../lib/catalog-form.server";

const BUCKET_NAME = "coverimages";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

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
    booking_duration_minutes: bookingDurations,
    total_sessions: totalSessions,
    max_capacity: maxCapacity,
    is_public: isPublic,
    curriculum,
  } = parsed.data;
  const [policy, capacity] = await Promise.all([
    getBookingPolicy(client, { organizationId }),
    getMaxConcurrentStudents(client, { organizationId }),
  ]);
  const defaults = programBookingDefaults(policy, capacity);
  const booking = programBookingSchema.safeParse({
    duration_minutes: durationMinutes ?? defaults.duration_minutes,
    booking_duration_minutes: bookingDurations ?? [
      ...new Set([
        ...defaults.booking_duration_minutes,
        durationMinutes ?? defaults.duration_minutes,
      ]),
    ],
    max_capacity: maxCapacity ?? defaults.max_capacity,
  });
  if (!booking.success)
    return data(
      {
        error:
          "수업 시간과 정원을 확인해 주세요. 기본 수업 시간은 허용 목록에 포함해야 합니다.",
      },
      { status: 400, headers },
    );
  const image = await validateCatalogImage(formData.get("cover_image"));
  if (!image.success) {
    return data({ error: image.error }, { status: 400, headers });
  }
  const coverImageFile = image.file;

  // 먼저 프로그램 생성 (ID 획득)
  let program;
  try {
    program = await createProgram(client, {
      organization_id: organizationId,
      instructor_id: instructorId,
      title,
      status,
      subtitle: subtitle || null,
      description: description || null,
      level: level || null,
      price,
      slug: slug || null,
      cover_image_url: null, // 파일 업로드 후 업데이트
      location_type: locationType || "offline",
      location_address: locationAddress || null,
      ...booking.data,
      total_sessions: totalSessions ?? 4,
      curriculum,

      is_public: isPublic,
    });
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError?.code === "23505") {
      return data(
        {
          error: "이미 사용 중인 URL 슬러그입니다. 다른 슬러그를 입력해주세요.",
        },
        { status: 400, headers },
      );
    }
    console.error("Failed to create program", err);
    return data(
      {
        error: "클래스 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500, headers },
    );
  }

  // 커버 이미지 업로드
  if (coverImageFile && coverImageFile.size > 0) {
    const ext = image.extension;
    const path = `${organizationId}/programs/${program.program_id}/cover.${ext}`;

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(path, coverImageFile, {
        upsert: true,
        contentType: coverImageFile.type,
      });

    if (!uploadError) {
      const { data: urlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      // 커버 이미지 URL 업데이트
      await client
        .from("programs")
        .update({ cover_image_url: `${urlData.publicUrl}?t=${Date.now()}` })
        .eq("program_id", program.program_id);
    }
  }

  return redirect(`/admin/programs/${program.program_id}`, { headers });
}
