import assert from "node:assert/strict";

export async function checkSettingsSections({
  db,
  check,
  asRole,
  blocked,
  source,
  orgA,
  orgB,
  adminA,
  studentA,
  existingProgramId = 1,
}) {
  if (source) {
    const snapshot =
      "SELECT (SELECT jsonb_agg(s ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(s ORDER BY program_id) FROM programs s) programs,(SELECT jsonb_agg(s ORDER BY organization_id,setting_key) FROM settings s) settings,(SELECT jsonb_agg(s ORDER BY event_id) FROM attendance_events s) attendance";
    const before = (await db.query(snapshot)).rows;
    await db.exec(source);
    assert.deepEqual((await db.query(snapshot)).rows, before);
    console.log(
      "PASS settings-section migration preserves existing settings, classes, reservations and attendance",
    );
  }
  const initial = {
    durationMinutes: [50, 90],
    defaultDurationMinutes: 50,
    firstStart: "09:10",
    lastStart: "18:40",
    startIntervalMinutes: 50,
    leadMinutes: 60,
  };
  const defaults = {
    durationMinutes: [40, 80],
    defaultDurationMinutes: 40,
    maxCapacity: 7,
  };
  const times = {
    firstStart: "10:00",
    lastStart: "19:00",
    startIntervalMinutes: 30,
    leadMinutes: 10,
    disabledStartTimes: ["10:30"],
  };
  const read = async () =>
    (
      await db.query(
        "SELECT * FROM settings WHERE organization_id=$1 ORDER BY setting_key",
        [orgA],
      )
    ).rows;
  const map = (rows) =>
    Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  const seed = async () => {
    for (const [key, value] of Object.entries({
      booking_policy: initial,
      max_concurrent_students: { value: 3 },
      disabled_booking_start_times: { value: ["09:10"] },
      disabled_booking_weekdays: { value: [6, 0] },
      booking_window: { mode: "rolling", daysAhead: 14 },
      cancellation_policy: { mode: "hours_before", hours: 3 },
    }))
      await db.query(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,$2,$3) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [orgA, key, JSON.stringify(value)],
      );
  };
  const save = (section, values, org = orgA) =>
    db.query("SELECT save_booking_settings_section($1,$2,$3)", [
      org,
      section,
      JSON.stringify(values),
    ]);
  const cases = [
    ["class_defaults", defaults, ["booking_policy", "max_concurrent_students"]],
    [
      "booking_times",
      times,
      ["booking_policy", "disabled_booking_start_times"],
    ],
    ["booking_window", { mode: "monthly", openingDay: 31 }, ["booking_window"]],
    [
      "booking_days",
      { disabledWeekdays: [1, 2] },
      ["disabled_booking_weekdays"],
    ],
    ["cancellation_policy", { mode: "previous_day" }, ["cancellation_policy"]],
  ];
  for (const [section, values, changed] of cases)
    await check(
      `${section} saves only its own settings without touching other rows, classes or reservations`,
      async () => {
        await seed();
        const previous = await read();
        const business = (
          await db.query(
            "SELECT (SELECT jsonb_agg(s ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(p ORDER BY program_id) FROM programs p) programs",
          )
        ).rows;
        await asRole("authenticated", adminA);
        await save(section, values);
        const next = await read();
        assert.deepEqual(
          next.filter((r) => !changed.includes(r.setting_key)),
          previous.filter((r) => !changed.includes(r.setting_key)),
        );
        const m = map(next);
        if (section === "class_defaults") {
          assert.deepEqual(m.booking_policy, {
            ...initial,
            durationMinutes: defaults.durationMinutes,
            defaultDurationMinutes: 40,
          });
          assert.deepEqual(m.max_concurrent_students, { value: 7 });
        } else if (section === "booking_times") {
          const { disabledStartTimes, ...patch } = times;
          assert.deepEqual(m.booking_policy, { ...initial, ...patch });
          assert.deepEqual(m.disabled_booking_start_times, {
            value: disabledStartTimes,
          });
        } else if (section === "booking_days")
          assert.deepEqual(m.disabled_booking_weekdays, { value: [1, 2] });
        else assert.deepEqual(m[section], values);
        await asRole("postgres");
        assert.deepEqual(
          (
            await db.query(
              "SELECT (SELECT jsonb_agg(s ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(p ORDER BY program_id) FROM programs p) programs",
            )
          ).rows,
          business,
        );
      },
    );
  await check(
    "different sections merge latest saved policy values in either order",
    async () => {
      await seed();
      await asRole("authenticated", adminA);
      await save("class_defaults", defaults);
      await save("booking_times", times);
      let current = map(await read()).booking_policy;
      assert.deepEqual(current, {
        durationMinutes: [40, 80],
        defaultDurationMinutes: 40,
        firstStart: "10:00",
        lastStart: "19:00",
        startIntervalMinutes: 30,
        leadMinutes: 10,
      });
      await save("class_defaults", {
        ...defaults,
        durationMinutes: [60],
        defaultDurationMinutes: 60,
      });
      current = map(await read()).booking_policy;
      assert.equal(current.firstStart, "10:00");
      assert.deepEqual(current.durationMinutes, [60]);
    },
  );
  await check(
    "invalid section payloads and cross-section injection roll back all writes",
    async () => {
      await seed();
      await asRole("authenticated", adminA);
      const previous = await read();
      const bad = [
        ["class_defaults", { ...defaults, maxCapacity: 0 }],
        ["class_defaults", { ...defaults, durationMinutes: [40, 40] }],
        ["class_defaults", { ...defaults, firstStart: "01:00" }],
        ["booking_times", { ...times, disabledStartTimes: ["25:00"] }],
        ["booking_times", { ...times, lastStart: "01:00" }],
        ["booking_window", { mode: "both" }],
        ["booking_days", { disabledWeekdays: [8] }],
        ["cancellation_policy", { mode: "hours_before", hours: 721 }],
        ["unknown", {}],
        ["booking_times", {}],
      ];
      for (const [section, values] of bad)
        await blocked(
          "SELECT save_booking_settings_section($1,$2,$3)",
          [orgA, section, JSON.stringify(values)],
          /invalid_/,
        );
      assert.deepEqual(await read(), previous);
    },
  );
  await check(
    "empty restriction arrays explicitly clear only the selected section",
    async () => {
      await seed();
      await asRole("authenticated", adminA);
      await save("booking_days", { disabledWeekdays: [] });
      await save("booking_times", { ...times, disabledStartTimes: [] });
      const m = map(await read());
      assert.deepEqual(m.disabled_booking_weekdays, { value: [] });
      assert.deepEqual(m.disabled_booking_start_times, { value: [] });
      assert.deepEqual(m.booking_window, { mode: "rolling", daysAhead: 14 });
    },
  );
  await check(
    "students, anonymous users and another tenant admin cannot save settings sections",
    async () => {
      await asRole("authenticated", studentA);
      await blocked(
        "SELECT save_booking_settings_section($1,$2,$3)",
        [orgA, "class_defaults", JSON.stringify(defaults)],
        /settings_not_authorized/,
      );
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT save_booking_settings_section($1,$2,$3)",
        [orgB, "class_defaults", JSON.stringify(defaults)],
        /settings_not_authorized/,
      );
      await asRole("anon");
      await blocked(
        "SELECT save_booking_settings_section($1,$2,$3)",
        [orgA, "class_defaults", JSON.stringify(defaults)],
        /permission denied/,
      );
    },
  );
  await check(
    "first scoped save creates only necessary settings and uses class defaults without propagating to existing classes",
    async () => {
      await asRole("postgres");
      await db.query("DELETE FROM settings WHERE organization_id=$1", [orgA]);
      const old = (
        await db.query("SELECT * FROM programs WHERE program_id=$1", [
          existingProgramId,
        ])
      ).rows;
      await asRole("authenticated", adminA);
      await save("class_defaults", defaults);
      assert.deepEqual(
        (await read()).map((r) => r.setting_key),
        ["booking_policy", "max_concurrent_students"],
      );
      assert.deepEqual(
        (
          await db.query("SELECT * FROM programs WHERE program_id=$1", [
            existingProgramId,
          ])
        ).rows,
        old,
      );
      const p = (
        await db.query(
          "INSERT INTO programs(organization_id,title) VALUES($1,'New section defaults') RETURNING *",
          [orgA],
        )
      ).rows[0];
      assert.equal(p.max_capacity, 7);
      assert.deepEqual(p.booking_duration_minutes, [40, 80]);
    },
  );
  await check(
    "scoped save RPC retains booking lock discipline and authenticated-only execution",
    async () => {
      const def = (
        await db.query(
          "SELECT prosrc,prosecdef,proconfig FROM pg_proc WHERE oid='public.save_booking_settings_section(uuid,text,jsonb)'::regprocedure",
        )
      ).rows[0];
      assert.equal(def.prosecdef, true);
      assert.match(def.prosrc, /schedule-org:/);
      assert.match(def.prosrc, /read_booking_policy/);
      assert.ok(def.proconfig.some((v) => v.startsWith("search_path=")));
      const perms = (
        await db.query(
          "SELECT has_function_privilege('anon','save_booking_settings_section(uuid,text,jsonb)','EXECUTE') anonymous,has_function_privilege('authenticated','save_booking_settings_section(uuid,text,jsonb)','EXECUTE') authenticated",
        )
      ).rows[0];
      assert.deepEqual(perms, { anonymous: false, authenticated: true });
    },
  );
}
