import { sql } from "drizzle-orm";

import db from "~/core/db/drizzle-client.server";

export async function consumeConsultIpBudget(ipHash: string) {
  const rows = await db.execute<{ allowed: boolean }>(
    sql`SELECT public.consume_consult_limit(${"ip:" + ipHash},10,600) AS allowed`,
  );
  return rows[0]?.allowed === true;
}

export async function findAcceptedConsultation(
  requestId: string,
  payloadHash: string,
) {
  const rows = await db.execute<{ accepted: number }>(sql`
    SELECT 1 AS accepted FROM public.consult_submission_keys
    WHERE request_id=${requestId}::uuid AND payload_hash=${payloadHash} AND expires_at>now()`);
  return rows.length > 0;
}

export async function submitConsultation(input: {
  programId: number;
  name: string;
  phone: string;
  message?: string;
  requestId: string;
  payloadHash: string;
  phoneHash: string;
}) {
  const rows = await db.execute<{ notification_id: number | null }>(sql`
    SELECT public.submit_public_consultation(${input.programId},${input.name},${input.phone},${input.message ?? ""},
      ${input.requestId}::uuid,${input.payloadHash},${input.phoneHash}) AS notification_id`);
  const value = rows[0]?.notification_id;
  return value == null ? null : Number(value);
}
