import { z } from "zod";

export const MAX_STUDENT_TYPES = 50;
const option = z
  .object({
    code: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,80}$/)
      .refine(
        (code) => !["EXAMINEE", "DROPPER"].includes(code),
        "사용할 수 없는 유형 코드입니다.",
      ),
    label: z
      .string()
      .trim()
      .min(1, "유형 이름을 입력해 주세요.")
      .max(80, "유형 이름은 80자 이내로 입력해 주세요."),
    sort_order: z
      .number()
      .int()
      .min(0)
      .max(MAX_STUDENT_TYPES - 1),
    is_active: z.boolean(),
    is_default: z.boolean(),
  })
  .strict();
const policy = z
  .array(option)
  .min(1, "유형을 1개 이상 유지해 주세요.")
  .max(MAX_STUDENT_TYPES)
  .superRefine((types, context) => {
    const problem = (message: string) =>
      context.addIssue({ code: "custom", message });
    if (!types.some((type) => type.is_active))
      problem("사용 중인 유형을 1개 이상 유지해 주세요.");
    const defaults = types.filter((type) => type.is_default);
    if (defaults.length !== 1 || !defaults[0].is_active)
      problem("사용 중인 유형 중 기본 유형을 1개 선택해 주세요.");
    if (new Set(types.map((type) => type.code)).size !== types.length)
      problem("유형 코드가 중복되었습니다.");
    if (
      new Set(types.map((type) => type.label.toLowerCase())).size !==
      types.length
    )
      problem("유형 이름은 중복할 수 없습니다.");
    if (
      new Set(types.map((type) => type.sort_order)).size !== types.length ||
      types.some((type) => type.sort_order >= types.length)
    )
      problem("유형 순서를 확인해 주세요.");
  });

export function parseStudentTypePolicy(value: unknown) {
  return z
    .object({ types: policy, expected: policy })
    .strict()
    .safeParse(value);
}

export function studentTypePolicyFailure(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("student_types_conflict"))
    return {
      status: 409,
      error:
        "다른 관리자가 유형을 변경했습니다. 최신 목록을 불러온 뒤 다시 수정해 주세요.",
    };
  if (message.includes("student_types_access_denied"))
    return { status: 403, error: "유형을 변경할 권한이 없습니다." };
  if (/invalid_student_types|student_types_cannot_remove/.test(message))
    return {
      status: 400,
      error:
        "유형 이름·사용 여부·기본값을 확인해 주세요. 기존 유형은 삭제할 수 없습니다.",
    };
  return {
    status: 500,
    error: "유형을 저장하지 못했습니다. 입력 내용은 유지됩니다.",
  };
}
