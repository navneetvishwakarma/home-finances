import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle>;

let sql: SqlClient | undefined;
let db: Database | undefined;
let migration: Promise<void> | undefined;

export function getDatabase() {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required");
  }

  sql ??= postgres(url, {
    max: 1,
    onnotice: () => {},
    prepare: !isSupabasePostgresUrl(url),
    ssl: isSupabasePostgresUrl(url) && !url.includes("sslmode=") ? "require" : undefined
  });
  db ??= drizzle(sql);

  return db;
}

function isSupabasePostgresUrl(url: string) {
  return url.includes(".supabase.co");
}

export async function getMigratedDatabase() {
  const database = getDatabase();
  migration ??= migrate(database, { migrationsFolder: "drizzle" });
  await migration;

  return database;
}
