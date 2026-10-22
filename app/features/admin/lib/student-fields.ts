import { z } from "zod";

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export const requiredStudentFields = {
  name: z.string().trim().min(1, "이름을 입력해 주세요."),
  phone: z
    .string()
    .trim()
    .min(1, "전화번호를 입력해 주세요.")
    .refine(
      (value) => /^\d{9,11}$/.test(normalizePhone(value)),
      "전화번호 형식을 확인해 주세요.",
    ),
  type: z.enum(["EXAMINEE", "DROPPER", "ADULT"]),
  region: z.string().trim().min(1, "지역을 입력해 주세요."),
};
