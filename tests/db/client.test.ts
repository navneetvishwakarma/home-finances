import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const migrate = vi.fn(async () => undefined);
const postgres = vi.fn(() => ({ end: vi.fn() }));
const drizzle = vi.fn(() => ({ db: true }));
const originalNodeEnv = process.env.NODE_ENV;

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
  migrate
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle
}));

vi.mock("postgres", () => ({
  default: postgres
}));

describe("database client migration behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    migrate.mockClear();
    postgres.mockClear();
    drizzle.mockClear();
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("does not run request-time migrations in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/home_finances";
    const { getMigratedDatabase } = await import("@/db/client");

    await expect(getMigratedDatabase()).resolves.toEqual({ db: true });

    expect(migrate).not.toHaveBeenCalled();
  });

  test("keeps request-time migrations outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/home_finances";
    const { getMigratedDatabase } = await import("@/db/client");

    await expect(getMigratedDatabase()).resolves.toEqual({ db: true });

    expect(migrate).toHaveBeenCalledWith({ db: true }, { migrationsFolder: "drizzle" });
  });
});
