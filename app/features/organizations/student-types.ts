/** Display metadata, independent of account roles and booking eligibility. */
export const DEFAULT_STUDENT_TYPE = "STUDENT";
export const LEGACY_DROPPER_NOTE = "[이전 유형: 재수생]";
export const studentTypeLabels: Record<string, string> = {
  STUDENT: "학생",
  ADULT: "성인",
};

export interface StudentTypeOption {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
}

export const DEFAULT_STUDENT_TYPES: StudentTypeOption[] = Object.entries(
  studentTypeLabels,
).map(([code, label], sort_order) => ({
  code,
  label,
  sort_order,
  is_active: true,
  is_default: code === DEFAULT_STUDENT_TYPE,
}));

export function isSelectableStudentType(
  value: string,
  types: StudentTypeOption[],
  currentType?: string | null,
) {
  return types.some(
    (type) =>
      type.code === value && (type.is_active || type.code === currentType),
  );
}

export function getDefaultStudentType(types: StudentTypeOption[]) {
  const selected = types.find((type) => type.is_default && type.is_active);
  if (!selected) throw new Error("사용 가능한 기본 수강생 유형이 없습니다.");
  return selected.code;
}

export function studentTypeLabelMap(
  types: StudentTypeOption[],
): Record<string, string> {
  return Object.assign(
    Object.create(null),
    Object.fromEntries(types.map((type) => [type.code, type.label])),
  );
}

// Keep unsaved clipboard/session drafts usable after the classification change.
export function normalizeLegacyStudentType(value: string): string {
  return ["EXAMINEE", "DROPPER", "입시생", "재수생"].includes(value)
    ? DEFAULT_STUDENT_TYPE
    : value;
}

export function normalizeLegacyStudent<
  T extends { type: string; description?: string },
>(student: T) {
  const wasDropper = ["DROPPER", "재수생"].includes(student.type);
  const description = student.description;
  return {
    ...student,
    type: normalizeLegacyStudentType(student.type),
    ...(wasDropper && !description?.includes(LEGACY_DROPPER_NOTE)
      ? {
          description: description
            ? `${description}\n${LEGACY_DROPPER_NOTE}`
            : LEGACY_DROPPER_NOTE,
        }
      : {}),
  };
}
