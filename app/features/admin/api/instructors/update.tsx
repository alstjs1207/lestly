/**
 * Instructor Update API
 */
import type { Route } from "./+types/update";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { updateInstructor } from "~/features/instructors/queries";

import { requireAdminRole } from "../../guards.server";

const BUCKET_NAME = "instructors";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const instructorId = parseInt(params.instructorId);
  const formData = await request.formData();

  const name = formData.get("name") as string;
  const info = formData.get("info") as string | null;

  // JSONB 필드
  const careerStr = formData.get("career") as string | null;
  const career = careerStr ? JSON.parse(careerStr) : [];

  // SNS
  const snsInstagram = formData.get("sns_instagram") as string | null;
  const snsYoutube = formData.get("sns_youtube") as string | null;
  const sns: Record<string, string> = {};
  if (snsInstagram) sns.instagram = snsInstagram;
  if (snsYoutube) sns.youtube = snsYoutube;

  // 프로필 사진 처리
  let photoUrl: string | null = null;
  const photoFile = formData.get("photo") as File | null;
  const existingPhotoUrl = formData.get("existing_photo_url") as string | null;

  if (photoFile && photoFile.size > 0) {
    // 새 이미지 업로드
    const ext = photoFile.name.split(".").pop() || "jpg";
    const path = `${instructorId}/photo.${ext}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(path, photoFile, { upsert: true });

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

  await updateInstructor(client, {
    instructorId,
    updates: {
      name,
      info: info || null,
      photo_url: photoUrl,
      career,
      sns: Object.keys(sns).length > 0 ? sns : {},
    },
  });

  return redirect("/admin/instructors");
}
