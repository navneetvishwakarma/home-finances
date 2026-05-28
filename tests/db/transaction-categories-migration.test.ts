import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import postgres from "postgres";

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describe("transaction category migration", () => {
  test("adds category columns and backfills existing transaction rows with deterministic SQL rules", async () => {
    const migration = await readFile("drizzle/0003_transaction_categories.sql", "utf8");

    expect(migration).toContain('ADD COLUMN "category" text NOT NULL DEFAULT \'uncategorized\'');
    expect(migration).toContain(
      'ADD COLUMN "category_source" text NOT NULL DEFAULT \'uncategorized\''
    );
    expect(migration).toContain("IWISH");
    expect(migration).toContain("CRED");
    expect(migration).toContain("SALARY");
    expect(migration).toContain("NEFT");
    expect(migration).toContain('"category_source" = CASE');
    expect(migration).toContain("THEN 'rule'");
  });

  test("adds classification knowledge tables and normalizes legacy rule sources", async () => {
    const migration = await readFile("drizzle/0004_classification_knowledge.sql", "utf8");

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "classification_datasets"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "classification_examples"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "classification_rules"');
    expect(migration).toContain(`SET "category_source" = 'system_rule'`);
  });

  test("backfills statement-specific investment income and EMI descriptions", async () => {
    const migration = await readFile(
      "drizzle/0005_statement_specific_classification_backfill.sql",
      "utf8"
    );

    expect(migration).toContain("ZERODHA");
    expect(migration).toContain("INDIAN[[:space:]]+CLEARING");
    expect(migration).toContain("SIPG");
    expect(migration).toContain("'savings_investments'");
    expect(migration).toContain("'emis'");
    expect(migration).toContain("'income'");
    expect(migration).toContain(`WHERE "category_source" <> 'manual'`);
  });
});

describeDb("transaction category migration backfill", () => {
  test("backfills existing transaction rows with deterministic categories", async () => {
    const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
    const schemaName = `category_migration_${Date.now()}`;

    try {
      await sql.unsafe(`CREATE SCHEMA "${schemaName}"`);
      await sql.unsafe(`SET search_path TO "${schemaName}"`);
      await runMigrationFile(sql, "drizzle/0000_initial.sql");
      await runMigrationFile(sql, "drizzle/0001_statement_tallies.sql");
      await runMigrationFile(sql, "drizzle/0002_money_columns_bigint.sql");
      await sql.unsafe(`
        INSERT INTO accounts (id, display_name, provider_label, currency)
        VALUES ('00000000-0000-0000-0000-000000000001', 'ICICI Savings', 'ICICI Bank', 'INR');
        INSERT INTO import_batches (
          id,
          account_id,
          source_profile_id,
          filename,
          file_fingerprint,
          raw_source,
          status
        )
        VALUES (
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000001',
          'icici-bank-csv',
          'statement.csv',
          'sha256:test',
          'csv',
          'uploaded'
        );
        INSERT INTO transactions (
          id,
          account_id,
          import_batch_id,
          transaction_date,
          description,
          direction,
          amount_minor_units,
          running_balance_minor_units,
          row_hash,
          raw_source_payload
        )
        VALUES
          (
            '00000000-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '2026-04-01',
            'MMT INF IWISH CONTRIBUTION',
            'outgoing',
            10000,
            90000,
            'sha256:row-1',
            '{"S No.":"1"}'
          ),
          (
            '00000000-0000-0000-0000-000000000004',
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '2026-04-02',
            'NEFT TRANSFER TO SELF',
            'outgoing',
            20000,
            70000,
            'sha256:row-2',
            '{"S No.":"2"}'
          ),
          (
            '00000000-0000-0000-0000-000000000005',
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '2026-04-03',
            'ACCT CLOSURE TRANSACTION 0354',
            'incoming',
            30000,
            100000,
            'sha256:row-3',
            '{"S No.":"3"}'
          );
      `);

      await runMigrationFile(sql, "drizzle/0003_transaction_categories.sql");

      const rows = await sql`
        SELECT description, category, category_source
        FROM transactions
        ORDER BY transaction_date
      `;

      expect(rows).toEqual([
        {
          description: "MMT INF IWISH CONTRIBUTION",
          category: "savings_investments",
          category_source: "rule"
        },
        {
          description: "NEFT TRANSFER TO SELF",
          category: "transfers",
          category_source: "rule"
        },
        {
          description: "ACCT CLOSURE TRANSACTION 0354",
          category: "uncategorized",
          category_source: "uncategorized"
        }
      ]);
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await sql.end();
    }
  });
});

async function runMigrationFile(sql: postgres.Sql, path: string) {
  const migration = await readFile(path, "utf8");

  for (const statement of migration.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();

    if (trimmed) {
      await sql.unsafe(trimmed);
    }
  }
}
