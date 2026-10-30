import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import * as policy from "../app/features/app-settings/booking-policy.ts";
import * as programPolicy from "../app/features/programs/booking-policy.ts";
import * as kst from "../app/features/schedules/utils/kst.ts";
import * as rrule from "../app/features/schedules/utils/rrule-helper.ts";
import * as validation from "../app/features/schedules/utils/schedule-validation.ts";
import * as rules from "../app/features/schedules/utils/student-schedule-rules.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const require = createRequire(new URL("../package.json", import.meta.url));
const React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
const base = new URL("../", import.meta.url);
const tomorrow = kst.toKSTDateString(new Date(Date.now() + 86400000));
const request = (values: Record<string, string | string[]>) => {
  const form = new FormData();
  for (const [k, vs] of Object.entries(values))
    for (const v of Array.isArray(vs) ? vs : [vs]) form.append(k, v);
  return new Request("https://lestly.test/api/audit", {
    method: "POST",
    body: form,
  });
};
const common = {
  "react-router": {
    data: (body: any, init?: any) => ({ body, init }),
    redirect: (url: string) => ({ url }),
  },
  "~/core/lib/guards.server": { requireMethod: () => () => {} },
  "../../guards.server": {
    requireAdminRole: async () => ({ organizationId: "org-a" }),
  },
  "../../../app-settings/booking-policy": policy,
  "../../../programs/booking-policy.server": {
    getProgramBookingPolicy: async () => ({
      policy: policy.DEFAULT_BOOKING_POLICY,
    }),
  },
  "~/features/schedules/utils/kst": kst,
  "~/features/schedules/utils/rrule-helper": rrule,
  "~/features/schedules/utils/student-schedule-rules": rules,
};

const saves: string[] = [];
const client = {
  rpc: async (name: string, args: any) => {
    saves.push(args.p_student);
    return {
      error:
        args.p_student === "expired-student"
          ? { message: "schedule_outside_course" }
          : null,
    };
  },
};
const create = loadMockedModule<any>(
  new URL("app/features/admin/api/schedules/create.tsx", base),
  {
    ...common,
    "~/core/lib/supa-client.server": { default: () => [client, new Headers()] },
    "~/features/schedules/queries": {
      validateScheduleBatch: async () => ({ allowed: true }),
    },
    "../../queries": {
      getStudentById: async (_: unknown, p: { studentId: string }) => ({
        name: p.studentId,
        class_end_date: "2099-12-31",
      }),
    },
  },
);
const partial = await create.action({
  request: request({
    student_ids: ["valid-student", "expired-student"],
    program_id: "1",
    date: tomorrow,
    start_time: "10:00",
    duration_minutes: "180",
  }),
});
assert.deepEqual(saves, ["valid-student", "expired-student"]);
assert.equal(partial.init.status, 207);
assert.equal(partial.body.partial, true);
assert.deepEqual(Array.from(partial.body.createdStudentIds), ["valid-student"]);
assert.match(partial.body.error, /expired-student/);
test("partial schedule registration reports successful IDs and every failed student", () =>
  assert.equal(partial.body.success, false));

const deleted: any[] = [];
const del = loadMockedModule<any>(
  new URL("app/features/admin/api/schedules/delete.tsx", base),
  {
    ...common,
    "~/core/lib/supa-client.server": { default: () => [{}, new Headers()] },
    "~/features/schedules/queries": {
      getScheduleById: async () => ({
        schedule_id: 10,
        student_id: "student",
        parent_schedule_id: null,
        rrule: "FREQ=WEEKLY",
        start_time: `${tomorrow}T10:00:00+09:00`,
      }),
      deleteSchedule: async (_: unknown, x: any) =>
        deleted.push({ kind: "single", ...x }),
      deleteFutureSchedules: async (_: unknown, x: any) =>
        deleted.push({ kind: "future", ...x }),
    },
  },
);
await del.action({
  request: request({ delete_scope: "future" }),
  params: { scheduleId: "10" },
});
assert.equal(deleted[0].kind, "future");
assert.equal(deleted[0].parentScheduleId, 10);
assert.equal(deleted[0].studentId, "student");
assert.equal(deleted[0].organizationId, "org-a");
test("future cancellation includes the root and scopes both student and organization", () =>
  assert.equal(deleted.length, 1));

const changes: any[] = [];
const update = loadMockedModule<any>(
  new URL("app/features/admin/api/schedules/update.tsx", base),
  {
    ...common,
    "~/core/lib/supa-client.server": {
      default: () => [
        {
          rpc: async (name: string, args: any) => {
            changes.push({ name, args });
            return { error: null };
          },
        },
        new Headers(),
      ],
    },
    "~/features/schedules/utils/schedule-validation": validation,
    "~/features/schedules/queries": {
      getScheduleById: async () => ({
        schedule_id: 10,
        student_id: "student",
        program_id: 1,
        parent_schedule_id: null,
        rrule: null,
        start_time: `${tomorrow}T10:00:00+09:00`,
        end_time: `${tomorrow}T13:00:00+09:00`,
      }),
      validateScheduleBatch: async () => ({ allowed: true }),
    },
    "../../queries": {
      getStudentById: async () => ({
        name: "Audit",
        class_end_date: "2099-12-31",
      }),
    },
  },
);
await update.action({
  request: request({
    student_id: "student",
    program_id: "1",
    date: tomorrow,
    start_time: "10:00",
    duration_minutes: "180",
    is_recurring: "true",
    update_scope: "single",
  }),
  params: { scheduleId: "10" },
});
assert.equal(changes.length, 1);
assert.equal(changes[0].name, "update_admin_schedule_batch");
assert.equal(changes[0].args.p_rows.length, 1);
assert.equal(changes[0].args.p_rrule, undefined);
test("schedule edits retain their existing recurrence model", () =>
  assert.equal(changes[0].args.p_rows.length, 1));

const dom = (tag: string) => (props: any) =>
  React.createElement(
    tag,
    {
      ...(tag === "button" ? { disabled: props.disabled } : {}),
      ...(tag === "form" ? {} : { "data-value": props.value }),
      ...(tag === "input"
        ? { name: props.name, value: props.value, readOnly: true }
        : {}),
    },
    props.children,
  );
const deps: Record<string, any> = {
  react: React,
  "react/jsx-runtime": require("react/jsx-runtime"),
  "react-router": {
    useFetcher: () => ({ state: "idle", data: null, Form: dom("form") }),
  },
  "lucide-react": Object.fromEntries(
    ["CalendarDaysIcon", "Clock3Icon", "UsersIcon"].map((k) => [
      k,
      dom("span"),
    ]),
  ),
  "../../app-settings/booking-policy": policy,
  "../../programs/booking-policy": programPolicy,
};
for (const [path, names] of Object.entries({
  button: ["Button"],
  checkbox: ["Checkbox"],
  input: ["Input"],
  label: ["Label"],
  dialog: [
    "Dialog",
    "DialogContent",
    "DialogDescription",
    "DialogFooter",
    "DialogHeader",
    "DialogTitle",
  ],
  select: [
    "Select",
    "SelectContent",
    "SelectItem",
    "SelectTrigger",
    "SelectValue",
  ],
}))
  deps[`~/core/components/ui/${path}`] = Object.fromEntries(
    names.map((k) => [
      k,
      dom(k === "Button" ? "button" : k === "Input" ? "input" : "div"),
    ]),
  );
const ScheduleForm = loadMockedModule<any>(
  new URL("app/features/admin/components/schedule-form.tsx", base),
  deps,
).default;
const render = (selected: number) =>
  renderToStaticMarkup(
    React.createElement(ScheduleForm, {
      mode: "edit",
      students: [
        { profile_id: "student", name: "Audit", color: null, phone: null },
      ],
      programs: [
        {
          program_id: 2,
          title: "Only active class",
          subtitle: null,
          duration_minutes: 180,
          booking_duration_minutes: [180],
          max_capacity: 5,
        },
      ],
      defaultValues: {
        schedule_id: 10,
        student_id: "student",
        program_id: selected,
        date: tomorrow,
        start_time: "10:00",
        duration: "180",
      },
    }),
  );
assert.match(render(1), /이동할 활성 클래스를 선택/);
assert.match(render(1), /Only active class/);
assert.doesNotMatch(render(1), /name="program_id"/);
assert.doesNotMatch(render(2), /<button disabled="">수정 완료<\/button>/);
test("inactive class edit exposes the active class selector and removes unsupported repeat controls", () => {
  assert.doesNotMatch(render(1), /매주 반복 등록/);
  assert.match(render(2), /단건 일정입니다/);
});

test("organization booking views keep distinct sibling identities across tenant selection", async () => {
  const bookingWindow = await import(
    "../app/features/app-settings/booking-window.ts"
  );
  const cancellation = await import(
    "../app/features/app-settings/cancellation-policy.ts"
  );
  const learning = await import(
    "../app/features/schedules/utils/learning-records.ts"
  );
  const booking = await import(
    "../app/features/schedules/utils/student-booking.ts"
  );
  const week = await import("../app/features/schedules/utils/student-week.ts");
  const stub = () => null;
  const view = loadMockedModule<any>(
    new URL(
      "app/features/schedules/components/student-schedules-view.tsx",
      base,
    ),
    {
      react: {
        useEffect: () => {},
        useState: (value: any) => [
          typeof value === "function" ? value() : value,
          () => {},
        ],
      },
      "react/jsx-runtime": require("react/jsx-runtime"),
      "react-router": {
        useSearchParams: () => [
          new URLSearchParams("organization_id=org-b"),
          () => {},
        ],
        Link: stub,
      },
      "lucide-react": { CalendarDays: stub, List: stub, Plus: stub },
      "~/core/components/ui/button": { Button: stub },
      "../../app-settings/booking-window": bookingWindow,
      "../../app-settings/cancellation-policy": cancellation,
      "../utils/kst": kst,
      "../utils/learning-records": learning,
      "../utils/student-booking": booking,
      "../utils/student-week": week,
      "./student-booking-dialog": { StudentBookingDialog: stub },
      "./student-schedule-manager": { StudentScheduleManager: stub },
      "./student-weekly-schedules": { StudentWeeklySchedules: stub },
    },
  );
  const result = view.StudentSchedulesView({
    data: {
      organizationId: "org-b",
      organizations: [],
      schedules: [],
      programs: [],
      year: 2026,
      month: 11,
      selectedDate: tomorrow,
      now: new Date().toISOString(),
      canBook: true,
      classStartDate: null,
      classEndDate: null,
    },
  });
  const keys = result.props.children
    .flat()
    .filter(
      (element: any) => React.isValidElement(element) && element.key !== null,
    )
    .map((element: any) => element.key);
  assert.ok(keys.length >= 2);
  assert.equal(
    new Set(keys).size,
    keys.length,
    "duplicate identities can retain obsolete booking panels during fetcher updates",
  );
});
