import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is required to run database migrations.");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  prepare: !isSupabasePostgresUrl(url),
  ssl: isSupabasePostgresUrl(url) && !url.includes("sslmode=") ? "require" : undefined
});
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Database migrations completed.");
} finally {
  await sql.end();
}

function isSupabasePostgresUrl(value) {
  return value.includes(".supabase.co");
}
