# Database validation

Run `npm run test:db` to replay the complete migration journal in an isolated,
in-memory PostgreSQL instance and verify tenant isolation, RLS, invite claims,
public class reads, signup metadata, welcome-email payloads and schedule totals.
Migration 0017 adds atomic invite email enrichment checks against trusted Kakao
identity data, including preservation, missing/unverified email, provider/user
isolation, editable metadata, rollback, and compatibility with the 0015 claim RPC.
The suite uses PGlite and needs no database credentials or network connection.

The fixture stubs `auth.uid()`, `auth.jwt()`, pgmq and cron APIs. It skips only
the `pg_cron` and `pg_net` extension installation statements. Actual delivery,
extension configuration, Realtime and simultaneous transactions need separate
Supabase staging checks. Sequential invite claims are verified; simultaneous
claims are protected by a profile row lock but are not simulated by this suite.

Migration 0016 leaves existing tenant data untouched. Its `NOT VALID` foreign
keys and time-range check enforce new writes. Run the read-only
`tenant_integrity.sql` with a trusted database role, review any returned rows,
and resolve invalid historical records before validating those constraints.
The test command does not apply migrations or modify a deployed database.

0017 is additive and supports both the 0015 and 0016 claim definitions. When
deploying it to a database whose ledger still ends at 0015, apply only its
idempotent SQL without advancing the ledger past the pending 0016 migration.
A later regular migration run must still apply 0016 followed by 0017. The new
preview caller uses `claim_student_invite_with_contact_email`; older callers
continue to use `claim_student_invite` unchanged.

The composite tenant foreign keys coexist with the original single-column
foreign keys so deletion keeps the existing `SET NULL`/`CASCADE` behavior.
PostgREST embedding must select the intended relationship explicitly:

| Source → target                      | Original relationship hint                            |
| ------------------------------------ | ----------------------------------------------------- |
| programs → instructors               | `programs_instructor_id_instructors_instructor_id_fk` |
| schedules → programs                 | `schedules_program_id_programs_program_id_fk`         |
| notifications → programs             | `notifications_program_id_fkey`                       |
| notifications → schedules            | `notifications_schedule_id_fkey`                      |
| notifications → notifications        | `notifications_parent_notification_id_fkey`           |
| in_app_notifications → notifications | `in_app_notifications_notification_id_fkey`           |

For example, use `program:programs!schedules_program_id_programs_program_id_fk(...)`.
PGlite does not implement PostgREST, so the suite cannot verify HTTP relationship
discovery or schema cache refreshes.

Drizzle schemas declare the matching RLS policies, indexes, unique keys and
invite table. Drizzle 0.40 does not represent deferred foreign keys, functions,
or triggers; those remain explicitly managed in SQL. Review generated
migrations before applying them, especially because the repository's existing
Drizzle snapshots predate several manually maintained migrations.
