import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  idle_timeout: 20,
  max: 1,
});

const db = drizzle({ client });

export default db;
