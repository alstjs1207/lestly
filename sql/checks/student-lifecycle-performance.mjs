import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

export async function checkStudentLifecyclePerformance({
  db,
  check,
  asRole,
  baseline,
  orgA,
  adminA,
  studentA,
}) {
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  await check(
    "lifecycle read performance uses one revocation InitPlan and indexed cancellation scope across 10,000 lessons",
    async () => {
      await db.exec("ALTER TABLE schedules DISABLE TRIGGER USER");
      await db.query(
        `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time)
      SELECT $1,$2,1,t,t+interval '3 hours' FROM (SELECT now()-interval '10 years'+g*interval '6 hours' t FROM generate_series(1,10000)g)x`,
        [orgA, studentA],
      );
      await db.exec(
        "ALTER TABLE schedules ENABLE TRIGGER USER; ANALYZE schedules; ANALYZE profiles; ANALYZE organization_members",
      );
      const samples = async () => {
        const results = {};
        for (const [name, who, query, params] of [
          [
            "studentRecent",
            studentA,
            "SELECT schedule_id,start_time,end_time FROM schedules WHERE student_id=$1 ORDER BY start_time DESC LIMIT 50",
            [studentA],
          ],
          [
            "adminExistence",
            adminA,
            "SELECT schedule_id FROM schedules WHERE organization_id=$1 LIMIT 1",
            [orgA],
          ],
          [
            "completedHours",
            studentA,
            "SELECT * FROM get_student_completed_hours(ARRAY[$1]::uuid[])",
            [studentA],
          ],
        ]) {
          await asRole("authenticated", who);
          const times = [];
          for (let n = 0; n < 6; n++) {
            const plan = (
              await db.query("EXPLAIN (ANALYZE, FORMAT JSON) " + query, params)
            ).rows[0]["QUERY PLAN"][0];
            if (n) times.push(plan["Execution Time"]);
          }
          results[name] = { medianMs: median(times), samplesMs: times };
        }
        return results;
      };
      await db.exec("SAVEPOINT lifecycle_perf_baseline");
      await asRole("postgres");
      for (const definition of baseline.functions) await db.exec(definition);
      for (const table of [
        "schedules",
        "profiles",
        "organization_members",
        "programs",
        "instructors",
      ])
        await db.exec(`DROP POLICY account_access_guard ON ${table}`);
      await db.exec(
        "DROP POLICY graduated_student_program ON programs; DROP POLICY graduated_student_instructor ON instructors",
      );
      for (const p of baseline.policies) {
        const ident = (x) => '"' + x.replaceAll('"', '""') + '"';
        await db.exec(
          `ALTER POLICY ${ident(p.policyname)} ON ${ident(p.tablename)} ${p.qual ? "USING (" + p.qual + ")" : ""} ${p.with_check ? "WITH CHECK (" + p.with_check + ")" : ""}`,
        );
      }
      await db.exec(baseline.scheduleReadPolicy);
      const before = await samples();
      await db.exec("ROLLBACK TO SAVEPOINT lifecycle_perf_baseline");
      await asRole("postgres");
      const after = await samples();
      await asRole("authenticated", studentA);
      const plan = (
        await db.query(
          "EXPLAIN (FORMAT JSON) SELECT schedule_id FROM schedules WHERE student_id=$1 ORDER BY start_time DESC LIMIT 50",
          [studentA],
        )
      ).rows[0]["QUERY PLAN"][0];
      assert.ok(
        JSON.stringify(plan).includes("InitPlan"),
        "Revocation decision must be a statement-level subplan",
      );
      await asRole("postgres");
      await db.exec("SET LOCAL enable_seqscan=off");
      const cancellation = (
        await db.query(
          "EXPLAIN (FORMAT JSON) SELECT schedule_id FROM schedules WHERE organization_id=$1 AND student_id=$2 AND start_time>now()",
          [orgA, studentA],
        )
      ).rows[0]["QUERY PLAN"][0];
      assert.match(JSON.stringify(cancellation), /schedules_lifecycle_idx/);
      await db.exec(
        "SET LOCAL enable_seqscan=on; ALTER TABLE schedules DISABLE TRIGGER USER",
      );
      await db.query(
        `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time)
        SELECT $1,$2,1,t,t+interval '3 hours' FROM (SELECT now()+interval '1 day'+g*interval '6 hours' t FROM generate_series(1,1000)g)x`,
        [orgA, studentA],
      );
      await db.exec("ALTER TABLE schedules ENABLE TRIGGER USER");
      await asRole("authenticated", adminA);
      const impact = (
        await db.query(
          "SELECT get_student_change_impact($1,$2,'GRADUATE',NULL) impact",
          [orgA, studentA],
        )
      ).rows[0].impact;
      assert.equal(Number(impact.cancel_count), 1000);
      const started = performance.now();
      await db.query("SELECT set_student_state($1,$2,'GRADUATE',$3)", [
        orgA,
        studentA,
        impact.token,
      ]);
      const cancel1000Ms = performance.now() - started;
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM schedules WHERE student_id=$1 AND start_time>now()",
              [studentA],
            )
          ).rows[0].n,
        ),
        0,
      );
      await mkdir(new URL("../../test-results/", import.meta.url), {
        recursive: true,
      });
      const result = {
        datasetLessons: 10001,
        cancel1000Ms,
        before,
        after,
        scopeIndex: "schedules_lifecycle_idx",
        note: "Isolated PGlite SQL execution; excludes network and Vercel. Five measured samples after warmup.",
      };
      await writeFile(
        new URL(
          "../../test-results/student-lifecycle-performance.json",
          import.meta.url,
        ),
        JSON.stringify(result, null, 2) + "\n",
      );
      console.log("PERF " + JSON.stringify(result));
    },
  );
}
