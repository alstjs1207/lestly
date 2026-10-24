import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { instructors } from "~/features/instructors/schema";
import { organizationMembers } from "~/features/organizations/schema";
import { profiles } from "~/features/users/schema";

// These tables are server-only. The SQL migration explicitly revokes browser
// grants as well as enabling RLS; do not add authenticated client policies.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    subscription_id: uuid().primaryKey().defaultRandom(),
    organization_id: uuid().notNull(),
    profile_id: uuid().notNull(),
    device_id: uuid().notNull().unique(),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    expires_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id, table.profile_id],
      foreignColumns: [
        organizationMembers.organization_id,
        organizationMembers.profile_id,
      ],
    }).onDelete("cascade"),
    index("push_subscriptions_recipient_idx").on(
      table.organization_id,
      table.profile_id,
    ),
  ],
).enableRLS();

export const pushEvents = pgTable(
  "push_events",
  {
    event_id: uuid().primaryKey().defaultRandom(),
    organization_id: uuid().notNull(),
    instructor_id: bigint({ mode: "number" }).notNull(),
    recipient_profile_id: uuid().notNull(),
    actor_profile_id: uuid()
      .notNull()
      .references(() => profiles.profile_id, { onDelete: "cascade" }),
    schedule_id: bigint({ mode: "number" }).notNull(),
    event_type: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.schedule_id, table.event_type),
    check(
      "push_events_event_type_check",
      sql`${table.event_type} IN ('BOOKED','CANCELLED')`,
    ),
    foreignKey({
      columns: [table.instructor_id, table.organization_id],
      foreignColumns: [instructors.instructor_id, instructors.organization_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organization_id, table.recipient_profile_id],
      foreignColumns: [
        organizationMembers.organization_id,
        organizationMembers.profile_id,
      ],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const pushDeliveries = pgTable(
  "push_deliveries",
  {
    delivery_id: uuid().primaryKey().defaultRandom(),
    event_id: uuid()
      .notNull()
      .references(() => pushEvents.event_id, { onDelete: "cascade" }),
    subscription_id: uuid()
      .notNull()
      .references(() => pushSubscriptions.subscription_id, {
        onDelete: "cascade",
      }),
    status: text().notNull().default("PENDING"),
    attempts: integer().notNull().default(0),
    next_attempt_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    locked_until: timestamp({ withTimezone: true }),
    claim_token: uuid(),
    last_error: text(),
    sent_at: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique().on(table.event_id, table.subscription_id),
    check(
      "push_deliveries_status_check",
      sql`${table.status} IN ('PENDING','SENDING','SENT','FAILED','SKIPPED')`,
    ),
    index("push_deliveries_pending_idx")
      .on(table.next_attempt_at)
      .where(sql`${table.status} IN ('PENDING','SENDING')`),
  ],
).enableRLS();
