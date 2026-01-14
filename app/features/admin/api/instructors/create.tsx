/**
 * Instructor Creation API
 */
import type { Route } from "./+types/create";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { createInstructor } from "~/features/instructors/queries";

import { requireAdminRole } from "../../guards.server";

const BUCKET_NAME = "instructors";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

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

  // 먼저 강사 생성 (ID 획득)
  const instructor = await createInstructor(client, {
    organization_id: organizationId,
    name,
    info: info || null,
    photo_url: null, // 파일 업로드 후 업데이트
    career,
    sns: Object.keys(sns).length > 0 ? sns : {},
  });

  // 프로필 사진 업로드
  const photoFile = formData.get("photo") as File | null;
  if (photoFile && photoFile.size > 0) {
    const ext = photoFile.name.split(".").pop() || "jpg";
    const path = `${instructor.instructor_id}/photo.${ext}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(path, photoFile, { upsert: true });

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

  return redirect("/admin/instructors");
}
