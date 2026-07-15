import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// DATABASE_URL is injected by Replit's platform at runtime (both dev and prod).
// We do NOT throw here at module-load time so the API server can start up and
// pass its health check even before the production database URL is available.
// Any route that actually queries the DB will fail with a clear connection error
// if DATABASE_URL is missing, rather than crashing the whole process on import.
if (!process.env.DATABASE_URL) {
  console.warn(
    "[db] WARNING: DATABASE_URL is not set — database operations will fail until it is provided.",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
