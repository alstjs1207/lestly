import { z } from "zod";

import {
  DEFAULT_STUDENT_TYPES,
  type StudentTypeOption,
  isSelectableStudentType,
} from "../../organizations/student-types.ts";

export function studentTypeField(
  types: StudentTypeOption[] = DEFAULT_STUDENT_TYPES,
  currentType?: string | null,
) {
  return z
    .string()
    .refine(
      (value) => isSelectableStudentType(value, types, currentType),
      "사용 가능한 수강생 유형을 선택해 주세요.",
    );
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export const studentFields = {
  name: z.string().trim().min(1, "이름을 입력해 주세요."),
  phone: z
    .string()
    .trim()
    .min(1, "전화번호를 입력해 주세요.")
    .refine(
      (value) => /^\d{9,11}$/.test(normalizePhone(value)),
      "전화번호 형식을 확인해 주세요.",
    ),
  type: studentTypeField(),
  region: z.preprocess(
    (value) =>
      typeof value === "string" ? value.trim() || null : (value ?? null),
    z.string().nullable(),
  ),
};
