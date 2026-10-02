import { z } from "zod";

export const consultRequestSchema = z.object({
  programId: z.number().int().positive().safe(),
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .max(30)
    .transform((phone) => phone.replace(/[^0-9]/g, ""))
    .pipe(z.string().regex(/^0\d{9,10}$/)),
  message: z.string().trim().max(2000).optional(),
});
