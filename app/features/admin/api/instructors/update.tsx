/**
 * Instructor Update API
 */
import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { updateInstructor } from "~/features/instructors/queries";
import { isInstructorPushAccount } from "~/features/notifications/push/store.server";

import { requireAdminRole } from "../../guards.server";
import {
  getCatalogFormError,
  parseCatalogId,
  parseInstructorForm,
  validateCatalogImage,
} from "../../lib/catalog-form.server";

const BUCKET_NAME = "instructors";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const instructorId = parseCatalogId(params.instructorId);
  if (instructorId === null) {
    return data(
      { error: "올바른 항목을 선택해 주세요." },
      { status: 400, headers },
    );
  }
  const formData = await request.formData();

  const parsed = parseInstructorForm(formData);
  if (!parsed.success) {
    return data(
      { error: getCatalogFormError(parsed.error) },
      { status: 400, headers },
    );
  }
  const {
    name,
    push_profile_id: pushProfileId,
    info,
    career,
    sns_instagram: snsInstagram,
    sns_youtube: snsYoutube,
  } = parsed.data;
  if (!(await isInstructorPushAccount(organizationId, pushProfileId))) {
    return data(
      { error: "같은 조직의 활성 관리자 계정을 선택해 주세요." },
      { status: 400, headers },
    );
  }
  const image = await validateCatalogImage(formData.get("photo"));
  if (!image.success) {
    return data({ error: image.error }, { status: 400, headers });
  }
  const photoFile = image.file;
  const sns: Record<string, string> = {};
  if (snsInstagram) sns.instagram = snsInstagram;
  if (snsYoutube) sns.youtube = snsYoutube;
  // Check the selected tenant before touching its public storage path.
  const { data: currentRecord, error: targetError } = await client
    .from("instructors")
    .select("instructor_id")
    .eq("instructor_id", instructorId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (targetError || !currentRecord) {
    return data(
      { error: "수정할 항목을 찾을 수 없습니다." },
      { status: 404, headers },
    );
  }

  // 프로필 사진 처리
  let photoUrl: string | null = null;
  const existingPhotoUrl = parsed.data.existing_photo_url;

  if (photoFile && photoFile.size > 0) {
    // 새 이미지 업로드
    const ext = image.extension;
    const path = `${organizationId}/${instructorId}/photo.${ext}`;

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(path, photoFile, { upsert: true, contentType: photoFile.type });

    if (!uploadError) {
      const { data: urlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);
      photoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    }
  } else if (existingPhotoUrl) {
    // 기존 이미지 유지
    photoUrl = existingPhotoUrl;
  }

  try {
    await updateInstructor(client, {
      instructorId,
      updates: {
        name,
        push_profile_id: pushProfileId,
        info: info || null,
        photo_url: photoUrl,
        career,
        sns: Object.keys(sns).length > 0 ? sns : {},
      },
    });
  } catch (error) {
    console.error("Failed to update instructor", error);
    return data(
      {
        error: "강사 정보를 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500, headers },
    );
  }

  return redirect("/admin/instructors", { headers });
}
