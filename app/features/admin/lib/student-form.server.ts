import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { z } from "zod";

import {
  DEFAULT_STUDENT_TYPES,
  type StudentTypeOption,
} from "../../organizations/student-types.ts";
import {
  normalizePhone,
  studentFields,
  studentTypeField,
} from "./student-fields.ts";

export { normalizePhone } from "./student-fields.ts";

const optionalDate = z.preprocess(
  (value) => (String(value || "").trim() ? value : null),
  z.string().date().nullable(),
);

const studentFormObject = z.object({
  ...studentFields,
  email: z.preprocess(
    (value) => (String(value || "").trim() ? value : null),
    z.string().trim().email("이메일 형식을 확인해 주세요.").nullable(),
  ),
  birth_date: optionalDate,
  class_start_date: optionalDate,
  class_end_date: optionalDate,
  parent_name: z.preprocess(
    (value) => String(value || "").trim() || null,
    z.string().nullable(),
  ),
  parent_phone: z.preprocess(
    (value) => String(value || "").trim() || null,
    z.string().nullable(),
  ),
  description: z.preprocess(
    (value) => String(value || "").trim() || null,
    z.string().nullable(),
  ),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#3B82F6"),
});

function studentFormSchema(
  types: StudentTypeOption[],
  currentType?: string | null,
) {
  return studentFormObject
    .extend({ type: studentTypeField(types, currentType) })
    .refine(
      (values) =>
        !values.class_start_date ||
        !values.class_end_date ||
        values.class_end_date >= values.class_start_date,
      {
        path: ["class_end_date"],
        message: "수업 종료일은 시작일 이후여야 합니다.",
      },
    );
}

export type StudentFormValues = z.infer<ReturnType<typeof studentFormSchema>>;

export function parseStudentForm(
  formData: FormData,
  types = DEFAULT_STUDENT_TYPES,
  currentType?: string | null,
) {
  return studentFormSchema(types, currentType).safeParse(
    Object.fromEntries(formData),
  );
}

export async function findDuplicateStudentPhone(
  client: SupabaseClient<Database>,
  {
    organizationId,
    phone,
    excludeProfileId,
  }: {
    organizationId: string;
    phone: string;
    excludeProfileId?: string;
  },
) {
  let query = client
    .from("organization_members")
    .select("state, profiles!inner(profile_id, name, phone)")
    .eq("organization_id", organizationId)
    .eq("role", "STUDENT")
    .eq("profiles.phone_normalized", normalizePhone(phone));
  if (excludeProfileId) query = query.neq("profile_id", excludeProfileId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? { ...data.profiles, state: data.state } : null;
}
