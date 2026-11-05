import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { notifications } from "~/features/notifications/schema";

// Only privileged server code has table grants; there are no browser policies.
export const consultRateLimits = pgTable(
  "consult_rate_limits",
  {
    bucket_key: text().primaryKey(),
    attempts: integer().notNull(),
    expires_at: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index("consult_rate_limits_expiry").on(table.expires_at)],
).enableRLS();

export const consultSubmissionKeys = pgTable("consult_submission_keys", {
  request_id: uuid().primaryKey(),
  payload_hash: text().notNull(),
  notification_id: bigint({ mode: "number" }).references(
    () => notifications.notification_id,
    { onDelete: "set null" },
  ),
  expires_at: timestamp({ withTimezone: true })
    .notNull()
    .default(sql`now() + interval '24 hours'`),
}).enableRLS();
