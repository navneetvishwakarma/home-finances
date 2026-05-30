import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("production migration scripts", () => {
  test("exposes an explicit migration step in the production build command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["db:migrate"]).toBe("node scripts/migrate-database.mjs");
    expect(packageJson.scripts["prod:build"]).toBe("npm run db:migrate && npm run build");
  });

  test("fails clearly when DATABASE_URL is missing", async () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.TEST_DATABASE_URL;

    await expect(
      execFileAsync("node", ["scripts/migrate-database.mjs"], {
        env
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("DATABASE_URL is required to run database migrations.")
    });
  });
});
