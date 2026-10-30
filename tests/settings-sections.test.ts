import assert from "node:assert/strict";
import test from "node:test";

import * as days from "../app/features/app-settings/booking-days.ts";
import * as policy from "../app/features/app-settings/booking-policy.ts";
import * as times from "../app/features/app-settings/booking-times.ts";
import * as windowPolicy from "../app/features/app-settings/booking-window.ts";
import * as cancellation from "../app/features/app-settings/cancellation-policy.ts";
import * as sections from "../app/features/app-settings/settings-sections.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const form = (values: Record<string, string>) => {
  const result = new FormData();
  for (const [k, v] of Object.entries(values)) result.set(k, v);
  return result;
};
const examples: Record<sections.SettingsSectionId, Record<string, string>> = {
  class_defaults: {
    durationMinutes: "40, 50",
    defaultDurationMinutes: "50",
    max_concurrent_students: "3",
  },
  booking_times: {
    firstStart: "09:10",
    lastStart: "18:40",
    startIntervalMinutes: "50",
    leadMinutes: "60",
    booking_times_present: "1",
    disabled_start_times: '["09:10"]',
  },
  booking_window: { bookingWindowMode: "rolling", bookingDaysAhead: "14" },
  booking_days: { booking_days_present: "1", disabled_weekdays: "6" },
  cancellation_policy: {
    cancellationMode: "hours_before",
    cancellationHours: "3",
  },
};
test("each settings section parses only its own fields and ignores unfinished drafts from other sections", () => {
  for (const [section, fields] of Object.entries(examples)) {
    const parsed = sections.settingsSectionFromForm(
      form({
        section,
        ...fields,
        organization_id: "spoofed",
        unrelated: "unfinished",
      }),
    );
    assert.equal(parsed.section, section);
    assert.ok(!Object.hasOwn(parsed.values, "organization_id"));
    assert.ok(!Object.hasOwn(parsed.values, "unrelated"));
  }
  const local = sections.settingsSectionFromForm(
    form({
      section: "booking_window",
      ...examples.booking_window,
      max_concurrent_students: "bad",
      firstStart: "bad",
      durationMinutes: "bad",
      cancellationMode: "bad",
    }),
  );
  assert.deepEqual(local.values, { mode: "rolling", daysAhead: 14 });
  assert.deepEqual(
    sections.settingsSectionFromForm(
      form({ section: "class_defaults", ...examples.class_defaults }),
    ).values,
    { durationMinutes: [40, 50], defaultDurationMinutes: 50, maxCapacity: 3 },
  );
});
test("section saves distinguish explicit empty restrictions from missing controls and reject malformed input", () => {
  for (const section of sections.SETTINGS_SECTIONS)
    assert.throws(() => sections.settingsSectionFromForm(form({ section })));
  for (const section of ["", "all", "student_types"])
    assert.throws(() => sections.settingsSectionFromForm(form({ section })));
  assert.deepEqual(
    sections.settingsSectionFromForm(
      form({ section: "booking_days", booking_days_present: "1" }),
    ).values,
    { disabledWeekdays: [] },
  );
  const emptyTimes = sections.settingsSectionFromForm(
    form({
      section: "booking_times",
      ...examples.booking_times,
      disabled_start_times: "[]",
    }),
  );
  if (emptyTimes.section !== "booking_times") throw new Error("Wrong section");
  assert.deepEqual(emptyTimes.values.disabledStartTimes, []);
  const patches: Record<string, string>[] = [
    { max_concurrent_students: "101" },
    { durationMinutes: "40, 40" },
    { defaultDurationMinutes: "90" },
  ];
  for (const patch of patches)
    assert.throws(() =>
      sections.settingsSectionFromForm(
        form({
          section: "class_defaults",
          ...examples.class_defaults,
          ...patch,
        }),
      ),
    );
  assert.throws(() =>
    sections.settingsSectionFromForm(
      form({
        section: "booking_times",
        ...examples.booking_times,
        lastStart: "08:00",
      }),
    ),
  );
  assert.throws(() =>
    sections.settingsSectionFromForm(
      form({
        section: "booking_times",
        ...examples.booking_times,
        disabled_start_times: '["25:00"]',
      }),
    ),
  );
});
function route(error: unknown = null) {
  const calls: any[] = [];
  const { action } = loadMockedModule<any>(
    new URL("../app/features/admin/api/settings/update.tsx", import.meta.url),
    {
      "react-router": {
        data: (body: any, init: any) => ({ body, init }),
        redirect: (url: string) => ({ url }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            rpc: async (name: string, args: any) => {
              calls.push({ name, args });
              return { error };
            },
            from: () => {
              throw new Error("Section save must not perform a full upsert");
            },
          },
        ],
      },
      "~/features/app-settings/booking-days": days,
      "~/features/app-settings/booking-times": times,
      "~/features/app-settings/schema": {
        SETTING_KEYS: { MAX_CONCURRENT_STUDENTS: "max_concurrent_students" },
      },
      "../../../app-settings/booking-policy": policy,
      "../../../app-settings/booking-window": windowPolicy,
      "../../../app-settings/cancellation-policy": cancellation,
      "../../../app-settings/settings-sections": sections,
      "../../../app-settings/booking-policy.server": {
        getBookingPolicy: () => {
          throw new Error("Section saves merge the current policy in the DB");
        },
      },
      "../../guards.server": {
        requireAdminRole: async () => ({ organizationId: "trusted-org" }),
      },
    },
  );
  return {
    calls,
    run: (values: Record<string, string>) =>
      action({
        request: new Request("https://lestly.test/api/admin/settings", {
          method: "POST",
          body: form(values),
        }),
      }),
  };
}
test("section API uses trusted organization and one scoped RPC, returning local success without redirect", async () => {
  const f = route();
  for (const section of sections.SETTINGS_SECTIONS) {
    const r = await f.run({
      section,
      ...examples[section],
      organization_id: "spoofed",
    });
    assert.equal(r.body.success, true);
    assert.equal(r.body.section, section);
    assert.equal(r.url, undefined);
  }
  assert.equal(f.calls.length, 5);
  for (const call of f.calls) {
    assert.equal(call.name, "save_booking_settings_section");
    assert.equal(call.args.p_org, "trusted-org");
    assert.ok(!Object.hasOwn(call.args.p_values, "organization_id"));
  }
});
test("invalid sections and missing fields never write; DB errors stay with their submitted section", async () => {
  const f = route();
  for (const values of [
    { section: "" },
    { section: "unknown" },
    { section: "class_defaults" },
  ])
    assert.equal((await f.run(values)).init.status, 400);
  assert.equal(f.calls.length, 0);
  for (const [code, status] of [
    ["42501", 403],
    ["22023", 400],
    ["P0001", 400],
    ["NETWORK", 500],
  ] as const) {
    const f = route({ code, message: "private database message" });
    const r = await f.run({
      section: "booking_window",
      ...examples.booking_window,
    });
    assert.equal(r.init.status, status);
    assert.equal(r.body.section, "booking_window");
    assert.equal(r.body.success, false);
    assert.ok(!r.body.error.includes("private"));
  }
});
