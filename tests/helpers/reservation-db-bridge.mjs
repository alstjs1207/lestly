// Exercise real route actions and schedule query helpers against isolated SQL.
// Authentication identity and browser/network delivery are supplied by the fixture.
import * as queryUtils from "../../app/core/lib/query-utils.ts";
import * as lifecycle from "../../app/features/admin/lib/student-lifecycle.server.ts";
import * as policy from "../../app/features/app-settings/booking-policy.ts";
import * as cancellation from "../../app/features/app-settings/cancellation-policy.ts";
import * as programPolicy from "../../app/features/programs/booking-policy.ts";
import * as kst from "../../app/features/schedules/utils/kst.ts";
import * as validation from "../../app/features/schedules/utils/schedule-validation.ts";
import * as rules from "../../app/features/schedules/utils/student-schedule-rules.ts";
import { loadMockedModule } from "./mocked-module.ts";

const base = new URL("../../", import.meta.url);
const quote = (x) => {
  if (!/^[a-z_]+$/.test(x)) throw Error(`Unsupported field ${x}`);
  return `"${x}"`;
};
export function bridge(db, org, user) {
  class Query {
    constructor(table) {
      this.table = quote(table);
      this.filters = [];
      this.values = [];
      this.orders = [];
      this.mode = "select";
    }
    select() {
      return this;
    }
    where(key, op, value) {
      this.values.push(value);
      this.filters.push(`${quote(key)} ${op} $${this.values.length}`);
      return this;
    }
    eq(k, v) {
      return this.where(k, "=", v);
    }
    gte(k, v) {
      return this.where(k, ">=", v);
    }
    gt(k, v) {
      return this.where(k, ">", v);
    }
    lt(k, v) {
      return this.where(k, "<", v);
    }
    lte(k, v) {
      return this.where(k, "<=", v);
    }
    is(k, v) {
      if (v !== null) throw Error("Unsupported is");
      this.filters.push(`${quote(k)} IS NULL`);
      return this;
    }
    or(value) {
      this.filters.push(
        "(" +
          value
            .split(",")
            .map((s) => {
              const [key, op, v] = s.split(".");
              if (op !== "eq" || !/^\d+$/.test(v))
                throw Error("Unsupported OR");
              this.values.push(v);
              return `${quote(key)}=$${this.values.length}`;
            })
            .join(" OR ") +
          ")",
      );
      return this;
    }
    order(k, o = {}) {
      this.orders.push(`${quote(k)} ${o.ascending === false ? "DESC" : "ASC"}`);
      return this;
    }
    range(a, b) {
      this.offset = a;
      this.limitCount = b - a + 1;
      return this;
    }
    limit(n) {
      this.limitCount = n;
      return this;
    }
    delete() {
      this.mode = "delete";
      return this;
    }
    single() {
      return this.run("single");
    }
    maybeSingle() {
      return this.run("maybe");
    }
    then(resolve, reject) {
      return this.run().then(resolve, reject);
    }
    async run(one) {
      try {
        let sql = `${this.mode === "delete" ? "DELETE FROM" : "SELECT * FROM"} public.${this.table}`;
        if (this.filters.length) sql += " WHERE " + this.filters.join(" AND ");
        if (this.mode === "delete") sql += " RETURNING *";
        else {
          if (this.orders.length) sql += " ORDER BY " + this.orders.join(",");
          if (this.limitCount !== undefined)
            sql += ` LIMIT ${this.limitCount} OFFSET ${this.offset ?? 0}`;
        }
        const { rows } = await db.query(sql, this.values);
        if (one) {
          if (rows.length > 1 || (!rows.length && one === "single"))
            return {
              data: null,
              error: { code: "PGRST116", message: "single row expected" },
            };
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error };
      }
    }
  }
  const rpcArgs = {
    update_admin_schedule_batch: ["p_org", "p_student", "p_program", "p_rows"],
    create_admin_schedule_series: [
      "p_org",
      "p_student",
      "p_program",
      "p_rows",
      "p_rrule",
    ],
    book_student_schedule_with_policy: [
      "p_organization_id",
      "p_program_id",
      "p_start_time",
      "p_end_time",
      "p_expected_cancellation_policy",
      "p_accept_no_cancellation",
    ],
    set_student_state: [
      "p_organization_id",
      "p_student_id",
      "p_state",
      "p_confirmation",
    ],
  };
  const client = {
    from: (t) => new Query(t),
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    async rpc(fn, args) {
      try {
        const vals = rpcArgs[fn].map((k) =>
          Array.isArray(args[k]) ? JSON.stringify(args[k]) : (args[k] ?? null),
        );
        const result = await db.query(
          `SELECT public.${fn}(${vals.map((_, i) => "$" + (i + 1)).join(",")}) result`,
          vals,
        );
        return { data: result.rows[0].result, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
  const queries = loadMockedModule(
    new URL("app/features/schedules/queries.ts", base),
    {
      "~/core/lib/query-utils": queryUtils,
      "~/features/schedules/utils/calendar-month": {},
      "~/features/schedules/utils/kst": kst,
      "~/features/schedules/utils/schedule-validation": validation,
      "~/features/schedules/utils/student-hours": {},
      "~/features/schedules/utils/student-streak": {},
    },
  );
  const getProgramBookingPolicy = loadMockedModule(
    new URL("app/features/programs/booking-policy.server.ts", base),
    {
      "../app-settings/booking-policy.server": {
        getBookingPolicy: async () => policy.DEFAULT_BOOKING_POLICY,
      },
      "./booking-policy": programPolicy,
    },
  ).getProgramBookingPolicy;
  const deps = {
    "react-router": {
      data: (body, init) => ({ body, init }),
      redirect: (url) => ({ url }),
    },
    "~/core/lib/guards.server": { requireMethod: () => () => {} },
    "~/core/lib/supa-client.server": {
      default: () => [client, new Headers()],
      getSessionUser: async () => ({ id: user }),
    },
    "~/features/schedules/queries": queries,
    "../../guards.server": {
      requireAdminRole: async () => ({ organizationId: org }),
    },
    "~/features/schedules/utils/kst": kst,
    "~/features/schedules/utils/schedule-validation": validation,
    "~/features/schedules/utils/student-schedule-rules": rules,
    "../../../app-settings/booking-policy": policy,
    "../../../programs/booking-policy.server": { getProgramBookingPolicy },
    "../../queries": {
      getStudentById: async (_, p) =>
        (
          await db.query(
            "SELECT p.*,m.state FROM profiles p JOIN organization_members m USING(profile_id) WHERE m.organization_id=$1 AND p.profile_id=$2 AND m.role='STUDENT'",
            [p.organizationId, p.studentId],
          )
        ).rows[0],
    },
    "~/features/notifications/push/dispatch.server": {
      dispatchSchedulePush: async () => {},
    },
    "../../app-settings/cancellation-policy": cancellation,
    "../../lib/student-lifecycle.server": lifecycle,
  };
  const action = (path) => loadMockedModule(new URL(path, base), deps).action;
  const call = (handler, id, values) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) form.set(k, String(v));
    return handler({
      request: new Request("https://lestly.test/api/audit", {
        method: "POST",
        body: form,
      }),
      params: { scheduleId: String(id), studentId: String(id) },
    });
  };
  return {
    adminDelete: (id, scope = "single") =>
      call(action("app/features/admin/api/schedules/delete.tsx"), id, {
        delete_scope: scope,
      }),
    studentDelete: (id) =>
      call(action("app/features/schedules/api/delete-schedule.tsx"), id, {}),
    adminState: (id, state, token) =>
      call(
        action(
          `app/features/admin/api/students/${state === "GRADUATE" ? "graduate" : "delete"}.tsx`,
        ),
        id,
        { lifecycle_confirmation: token ?? "" },
      ),
    adminRestore: (id) =>
      call(action("app/features/admin/api/students/restore.tsx"), id, {}),
    adminUpdate: (s, values = {}) =>
      call(
        action("app/features/admin/api/schedules/update.tsx"),
        s.schedule_id,
        {
          student_id: s.student_id,
          program_id: s.program_id,
          date: kst.toKSTDateString(new Date(s.start_time)),
          start_time: "11:00",
          duration_minutes: 60,
          update_scope: "single",
          ...values,
        },
      ),
  };
}
