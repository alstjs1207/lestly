import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { organizations } from "~/features/organizations/schema";

// Immutable snapshots intentionally have no schedule/profile/program FK: changing
// or removing a catalog entry must not rewrite the historical attendance evidence.
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    event_id: bigint("event_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    schedule_id: bigint("schedule_id", { mode: "number" }).notNull(),
    version: integer("version").notNull(),
    previous_status: text("previous_status").notNull(),
    status: text("status").notNull(),
    actor_profile_id: uuid("actor_profile_id").notNull(),
    actor_name: text("actor_name").notNull(),
    recorded_at: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    snapshot: jsonb("snapshot").notNull(),
  },
  (table) => [
    unique().on(table.schedule_id, table.version),
    index("attendance_events_schedule_idx").on(
      table.organization_id,
      table.schedule_id,
      table.version,
    ),
    pgPolicy("attendance-events-admin-read", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.is_org_admin(${table.organization_id})`,
    }),
    pgPolicy("account_access_guard", {
      as: "restrictive",
      for: "all",
      to: authenticatedRole,
      using: sql`(SELECT public.is_account_access_allowed())`,
      withCheck: sql`(SELECT public.is_account_access_allowed())`,
    }),
  ],
).enableRLS();
