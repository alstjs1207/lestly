/**
 * Instructor Creation API
 */
import type { Route } from "./+types/create";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { createInstructor } from "~/features/instructors/queries";
import { isInstructorPushAccount } from "~/features/notifications/push/store.server";

import { requireAdminRole } from "../../guards.server";
import {
  getCatalogFormError,
  parseInstructorForm,
  validateCatalogImage,
} from "../../lib/catalog-form.server";

const BUCKET_NAME = "instructors";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

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

  // 먼저 강사 생성 (ID 획득)
  let instructor;
  try {
    instructor = await createInstructor(client, {
      organization_id: organizationId,
      name,
      push_profile_id: pushProfileId,
      info: info || null,
      photo_url: null, // 파일 업로드 후 업데이트
      career,
      sns: Object.keys(sns).length > 0 ? sns : {},
    });
  } catch (error) {
    console.error("Failed to create instructor", error);
    return data(
      {
        error: "강사 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500, headers },
    );
  }

  // 프로필 사진 업로드
  if (photoFile && photoFile.size > 0) {
    const ext = image.extension;
    const path = `${organizationId}/${instructor.instructor_id}/photo.${ext}`;

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(path, photoFile, { upsert: true, contentType: photoFile.type });

    if (!uploadError) {
      const { data: urlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      // 프로필 사진 URL 업데이트
      await client
        .from("instructors")
        .update({ photo_url: `${urlData.publicUrl}?t=${Date.now()}` })
        .eq("instructor_id", instructor.instructor_id);
    }
  }

  return redirect("/admin/instructors", { headers });
}
