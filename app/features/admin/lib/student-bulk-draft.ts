import type { BulkStudentRow } from "./student-bulk.ts";

import { z } from "zod";

import { MAX_BULK_STUDENTS } from "./student-bulk.ts";

export type EditableStudentRow = BulkStudentRow & {
  saved?: boolean;
  profileId?: string;
  error?: string;
};
const draftSchema = z.object({
  updatedAt: z.number(),
  clipboard: z.string().max(100_000),
  rows: z
    .array(
      z
        .object({
          id: z.string().min(1).max(100),
          name: z.string(),
          phone: z.string(),
          region: z.string(),
          type: z.string(),
          saved: z.boolean().optional(),
          profileId: z.string().uuid().optional(),
        })
        .refine((row) => !row.saved || Boolean(row.profileId)),
    )
    .max(MAX_BULK_STUDENTS)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
});

export function readStudentBulkDraft(value: string | null, now = Date.now()) {
  if (!value) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(value));
    if (
      !parsed.success ||
      now - parsed.data.updatedAt > 24 * 60 * 60 * 1000 ||
      parsed.data.updatedAt > now
    )
      return null;
    return {
      rows: parsed.data.rows as EditableStudentRow[],
      clipboard: parsed.data.clipboard,
    };
  } catch {
    return null;
  }
}

export function hasStudentInput(row: BulkStudentRow) {
  return Boolean(row.name.trim() || row.phone.trim() || row.region.trim());
}
