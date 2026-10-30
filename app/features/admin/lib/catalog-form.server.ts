import { z } from "zod";

import { getAvatarValidationError } from "../../../core/lib/avatar-validation.ts";
import { getSafeHttpUrl } from "../../../core/lib/web-url.ts";

export const MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;

const optionalText = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim() || null : (value ?? null),
  z.string().nullable(),
);
const optionalWebUrl = optionalText.refine((value) => {
  if (value === null) return true;
  return getSafeHttpUrl(value) !== null;
}, "링크는 http 또는 https URL을 입력해 주세요.");

function jsonInput(value: unknown) {
  if (value == null || value === "") return [];
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

const instructorSchema = z.object({
  name: z.string().trim().min(1, "강사명을 입력해 주세요."),
  push_profile_id: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.string().uuid().nullable(),
  ),
  info: optionalText,
  career: z.preprocess(
    jsonInput,
    z.array(z.string(), {
      invalid_type_error: "경력은 문자열 배열로 입력해 주세요.",
    }),
  ),
  sns_instagram: optionalWebUrl,
  sns_youtube: optionalWebUrl,
  existing_photo_url: optionalWebUrl,
});

function optionalNumber(minimum: number, integer: boolean, label: string) {
  return z.preprocess(
    (value) => {
      if (value == null || value === "") return null;
      return typeof value === "string" ? Number(value) : Number.NaN;
    },
    (integer ? z.number().int() : z.number())
      .finite()
      .min(minimum, `${label} 값을 확인해 주세요.`)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
  );
}

const programSchema = z.object({
  title: z.string().trim().min(1, "클래스명을 입력해 주세요."),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"], {
    errorMap: () => ({ message: "클래스 상태를 확인해 주세요." }),
  }),
  subtitle: optionalText,
  description: optionalText,
  level: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable(),
  ),
  price: optionalNumber(0, false, "가격"),
  instructor_id: optionalNumber(1, true, "강사"),
  slug: optionalText,
  location_type: z.preprocess(
    (value) => (value === "" || value == null ? "offline" : value),
    z.enum(["offline", "online"], {
      errorMap: () => ({ message: "수업 형태를 확인해 주세요." }),
    }),
  ),
  location_address: optionalText,
  duration_minutes: optionalNumber(1, true, "수업 시간"),
  booking_duration_minutes: z.preprocess(
    (value) => (value == null || value === "" ? null : jsonInput(value)),
    z.array(z.number().int().min(1).max(1440)).min(1).max(48).nullable(),
  ),
  total_sessions: optionalNumber(1, true, "총 회차"),
  max_capacity: optionalNumber(1, true, "모집 정원"),
  is_public: z.preprocess((value) => value === "on", z.boolean()),
  curriculum: z.preprocess(
    jsonInput,
    z.array(
      z.object({
        session: z.number().int().positive(),
        title: z.string(),
        description: z.string().optional(),
      }),
      { invalid_type_error: "커리큘럼은 회차별 배열로 입력해 주세요." },
    ),
  ),
  existing_cover_image_url: optionalWebUrl,
});

export function parseInstructorForm(formData: FormData) {
  return instructorSchema.safeParse(Object.fromEntries(formData));
}

export function parseProgramForm(formData: FormData) {
  return programSchema.safeParse(Object.fromEntries(formData));
}

export function getCatalogFormError(error: z.ZodError) {
  const field = error.issues[0]?.path[0];
  const messages: Record<string, string> = {
    name: "강사명을 입력해 주세요.",
    push_profile_id: "알림을 받을 강사 계정을 선택해 주세요.",
    title: "클래스명을 입력해 주세요.",
    career: "경력은 문자열 배열로 입력해 주세요.",
    curriculum: "커리큘럼은 회차, 제목, 설명이 포함된 배열로 입력해 주세요.",
    status: "클래스 상태를 확인해 주세요.",
    level: "클래스 수준을 확인해 주세요.",
    location_type: "수업 형태를 확인해 주세요.",
    price: "가격은 0 이상의 숫자로 입력해 주세요.",
    instructor_id: "올바른 강사를 선택해 주세요.",
    duration_minutes: "수업 시간은 1~1440분의 정수로 입력해 주세요.",
    booking_duration_minutes: "허용할 수업 길이를 확인해 주세요.",
    total_sessions: "총 회차는 양의 정수로 입력해 주세요.",
    max_capacity: "모집 정원은 양의 정수로 입력해 주세요.",
    sns_instagram: "Instagram 링크는 http 또는 https URL을 입력해 주세요.",
    sns_youtube: "YouTube 링크는 http 또는 https URL을 입력해 주세요.",
    existing_photo_url: "기존 사진 URL을 확인해 주세요.",
    existing_cover_image_url: "기존 커버 이미지 URL을 확인해 주세요.",
  };
  return typeof field === "string" && Object.hasOwn(messages, field)
    ? messages[field]
    : "입력한 정보를 확인해 주세요.";
}

export function parseCatalogId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Validate MIME, signature and size before callers perform any mutation. */
export async function validateCatalogImage(value: FormDataEntryValue | null) {
  if (value === null || (value instanceof File && value.size === 0)) {
    return { success: true, file: null, extension: null } as const;
  }
  if (!(value instanceof File)) {
    return { success: false, error: "이미지 파일을 선택해 주세요." } as const;
  }
  const error = await getAvatarValidationError(value, MAX_CATALOG_IMAGE_BYTES);
  if (error) {
    return {
      success: false,
      error:
        value.size > MAX_CATALOG_IMAGE_BYTES
          ? "이미지는 5MB 이하로 업로드해 주세요."
          : "PNG, JPEG, GIF, WebP 형식의 정상 이미지 파일을 업로드해 주세요.",
    } as const;
  }
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return {
    success: true,
    file: value,
    extension: extensions[value.type],
  } as const;
}
