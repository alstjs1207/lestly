import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("consult retry cleanup removes only its own job and preserves reservation retries and history", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA cron;
      CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,command text);
      CREATE FUNCTION cron.unschedule(p_jobid bigint) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
        DELETE FROM cron.job WHERE jobid=p_jobid; RETURN FOUND;
      END $$;
      CREATE TABLE history(id int PRIMARY KEY,body text);
      INSERT INTO history VALUES(1,'historical consultation');
      INSERT INTO cron.job(jobname,command) VALUES('web-push-retry-job','original-production-schedule-job'),('consult-push-retry-job','unused-consult-retry');
    `);
    const source = await readFile(
      new URL(
        "../sql/migrations/0043_consult_immediate_push_only.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(source);
    assert.deepEqual(
      (await db.query("SELECT jobname,command FROM cron.job")).rows,
      [
        {
          jobname: "web-push-retry-job",
          command: "original-production-schedule-job",
        },
      ],
    );
    assert.deepEqual((await db.query("SELECT * FROM history")).rows, [
      { id: 1, body: "historical consultation" },
    ]);
    await db.exec(source);
    assert.equal((await db.query("SELECT * FROM cron.job")).rows.length, 1);
  } finally {
    await db.close();
  }
});
