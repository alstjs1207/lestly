import { z } from "zod";

export const consultUpdateSchema = z.object({
  status: z.enum(["WAITING", "COMPLETED"]),
  result: z.enum(["", "SUCCESS", "FAILED"]),
  notes: z.string().trim().max(5000),
});

export function consultationId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function consultationPhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return /^0\d{8,10}$/.test(digits) ? `tel:${digits}` : undefined;
}
