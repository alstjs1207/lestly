import { z } from "zod";

import { normalizePhone, requiredStudentFields } from "./student-fields.ts";

export const MAX_BULK_STUDENTS = 50;
export const studentTypeLabels = {
  EXAMINEE: "입시생",
  DROPPER: "재수생",
  ADULT: "성인",
} as const;

const rowSchema = z.object({
  id: z.string().min(1).max(100),
  ...requiredStudentFields,
});
export type BulkStudentRow = z.infer<typeof rowSchema>;
export type BulkStudentResult = {
  id: string;
  success: boolean;
  profileId?: string;
  error?: string;
};
export type BulkStudentActionData = {
  error?: string;
  results?: BulkStudentResult[];
};

export function parseBulkStudents(value: unknown) {
  return z
    .array(rowSchema)
    .min(1, "등록할 수강생을 입력해 주세요.")
    .max(
      MAX_BULK_STUDENTS,
      `한 번에 ${MAX_BULK_STUDENTS}명까지 등록할 수 있습니다.`,
    )
    .superRefine((rows, context) => {
      const phones = new Map<string, number>();
      const ids = new Set<string>();
      for (const [index, row] of rows.entries()) {
        if (ids.has(row.id)) {
          context.addIssue({
            code: "custom",
            path: [index, "id"],
            message: "중복된 행입니다.",
          });
        }
        ids.add(row.id);
        const phone = normalizePhone(row.phone);
        const previous = phones.get(phone);
        if (previous !== undefined) {
          for (const duplicateIndex of [previous, index]) {
            context.addIssue({
              code: "custom",
              path: [duplicateIndex, "phone"],
              message: "입력한 명단에 같은 전화번호가 있습니다.",
            });
          }
        }
        phones.set(phone, index);
      }
    })
    .safeParse(value);
}

// Excel / Google Sheets clipboard data uses tabs between cells.
export function parseStudentClipboard(
  text: string,
): Omit<BulkStudentRow, "id">[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (
    /^(이름|name)\t(전화번호|phone)\t(지역|region)(\t|$)/i.test(lines[0] ?? "")
  )
    lines.shift();
  return lines.map((line) => {
    if (line.split("\t").length > 4)
      throw new Error(
        "명단은 이름 · 전화번호 · 지역 · 유형, 최대 4개 열로 붙여넣어 주세요.",
      );
    const [name = "", phone = "", region = "", label = ""] = line
      .split("\t")
      .map((cell) => cell.trim());
    const type =
      Object.entries(studentTypeLabels).find(
        ([key, value]) => key === label || value === label,
      )?.[0] ??
      (label || "EXAMINEE");
    return { name, phone, region, type: type as BulkStudentRow["type"] };
  });
}
