import { readFile } from "node:fs/promises";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type SeedIds = {
  accountId: string;
  userId: string;
  sessionId: string;
  importBatchId: string;
  outgoingTransactionId: string;
  incomingTransactionId: string;
  transferMatchId: string;
  statementTallyId: string;
  monthCloseId: string;
};

const target = seedIds("10000000");
const other = seedIds("20000000");
const datasetId = "30000000-0000-4000-8000-000000000001";
const exampleId = "30000000-0000-4000-8000-000000000002";
const ruleId = "30000000-0000-4000-8000-000000000003";

describeDb("dev database cleanup scripts", () => {
  const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await sql.end();
  });

  test("preserves accounts and login rows while clearing derived data", async () => {
    await runScriptInRolledBackTransaction(
      "scripts/dev/clean-database-except-accounts.sql",
      async () => {
        await seedUserRows(target);
        await seedClassificationRows();
      },
      async () => {
        await expect(rowCount("accounts", target.accountId)).resolves.toBe(1);
        await expect(rowCount("app_users", target.userId)).resolves.toBe(1);
        await expect(rowCount("user_sessions", target.sessionId)).resolves.toBe(1);
        await expect(rowCount("transfer_matches", target.transferMatchId)).resolves.toBe(0);
        await expect(rowCount("statement_tallies", target.statementTallyId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.outgoingTransactionId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.incomingTransactionId)).resolves.toBe(0);
        await expect(rowCount("import_batches", target.importBatchId)).resolves.toBe(0);
        await expect(rowCount("classification_examples", exampleId)).resolves.toBe(0);
        await expect(rowCount("classification_datasets", datasetId)).resolves.toBe(0);
        await expect(rowCount("classification_rules", ruleId)).resolves.toBe(0);
        await expect(rowCount("month_closes", target.monthCloseId)).resolves.toBe(0);
      }
    );
  });

  test("clears all public app data for a new database state", async () => {
    await runScriptInRolledBackTransaction(
      "scripts/dev/clean-database.sql",
      async () => {
        await seedUserRows(target);
        await seedClassificationRows();
        await seedSupabaseAuthTraceRows();
      },
      async () => {
        await expect(rowCount("accounts", target.accountId)).resolves.toBe(0);
        await expect(rowCount("app_users", target.userId)).resolves.toBe(0);
        await expect(rowCount("user_sessions", target.sessionId)).resolves.toBe(0);
        await expect(rowCount("auth.dev_cleanup_login_traces", target.userId)).resolves.toBe(0);
        await expect(rowCount("transfer_matches", target.transferMatchId)).resolves.toBe(0);
        await expect(rowCount("statement_tallies", target.statementTallyId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.outgoingTransactionId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.incomingTransactionId)).resolves.toBe(0);
        await expect(rowCount("import_batches", target.importBatchId)).resolves.toBe(0);
        await expect(rowCount("classification_examples", exampleId)).resolves.toBe(0);
        await expect(rowCount("classification_datasets", datasetId)).resolves.toBe(0);
        await expect(rowCount("classification_rules", ruleId)).resolves.toBe(0);
        await expect(rowCount("month_closes", target.monthCloseId)).resolves.toBe(0);
      }
    );
  });

  test("clears one user's financial data while preserving their account and other users", async () => {
    await runScriptInRolledBackTransaction(
      "scripts/dev/clean-user-data-except-accounts.sql",
      async () => {
        await seedUserRows(target);
        await seedUserRows(other);
      },
      async () => {
        await expect(rowCount("accounts", target.accountId)).resolves.toBe(1);
        await expect(rowCount("app_users", target.userId)).resolves.toBe(1);
        await expect(rowCount("user_sessions", target.sessionId)).resolves.toBe(1);
        await expect(rowCount("transfer_matches", target.transferMatchId)).resolves.toBe(0);
        await expect(rowCount("statement_tallies", target.statementTallyId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.outgoingTransactionId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.incomingTransactionId)).resolves.toBe(0);
        await expect(rowCount("import_batches", target.importBatchId)).resolves.toBe(0);
        await expect(rowCount("month_closes", target.monthCloseId)).resolves.toBe(0);
        await expect(rowCount("accounts", other.accountId)).resolves.toBe(1);
        await expect(rowCount("transactions", other.outgoingTransactionId)).resolves.toBe(1);
        await expect(rowCount("transactions", other.incomingTransactionId)).resolves.toBe(1);
        await expect(rowCount("import_batches", other.importBatchId)).resolves.toBe(1);
        await expect(rowCount("month_closes", other.monthCloseId)).resolves.toBe(1);
      },
      target.userId
    );
  });

  test("clears one user's financial data including their account while preserving login and other users", async () => {
    await runScriptInRolledBackTransaction(
      "scripts/dev/clean-user-data-including-accounts.sql",
      async () => {
        await seedUserRows(target);
        await seedUserRows(other);
      },
      async () => {
        await expect(rowCount("accounts", target.accountId)).resolves.toBe(0);
        await expect(rowCount("app_users", target.userId)).resolves.toBe(1);
        await expect(rowCount("user_sessions", target.sessionId)).resolves.toBe(1);
        await expect(rowCount("transfer_matches", target.transferMatchId)).resolves.toBe(0);
        await expect(rowCount("statement_tallies", target.statementTallyId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.outgoingTransactionId)).resolves.toBe(0);
        await expect(rowCount("transactions", target.incomingTransactionId)).resolves.toBe(0);
        await expect(rowCount("import_batches", target.importBatchId)).resolves.toBe(0);
        await expect(rowCount("month_closes", target.monthCloseId)).resolves.toBe(0);
        await expect(rowCount("accounts", other.accountId)).resolves.toBe(1);
        await expect(rowCount("transactions", other.outgoingTransactionId)).resolves.toBe(1);
        await expect(rowCount("transactions", other.incomingTransactionId)).resolves.toBe(1);
        await expect(rowCount("import_batches", other.importBatchId)).resolves.toBe(1);
        await expect(rowCount("month_closes", other.monthCloseId)).resolves.toBe(1);
      },
      target.userId
    );
  });

  async function runScriptInRolledBackTransaction(
    path: string,
    seedRows: () => Promise<void>,
    verifyRows: () => Promise<void>,
    ownerUserId?: string
  ) {
    await sql`BEGIN`;

    try {
      await seedRows();
      await sql.unsafe(scriptForTest(await readFile(path, "utf8"), ownerUserId));
      await verifyRows();
    } finally {
      await sql`ROLLBACK`;
    }
  }

  async function seedUserRows(ids: SeedIds) {
    await sql`
      INSERT INTO accounts (
        id,
        owner_user_id,
        display_name,
        provider_label,
        currency
      )
      VALUES (
        ${ids.accountId},
        ${ids.userId},
        'Dev Cleanup Account',
        'ICICI Bank',
        'INR'
      )
    `;
    await sql`
      INSERT INTO app_users (
        id,
        email,
        display_name,
        password_hash
      )
      VALUES (
        ${ids.userId},
        ${`${ids.userId}@example.com`},
        'Dev Cleanup User',
        'hash'
      )
    `;
    await sql`
      INSERT INTO user_sessions (
        id,
        user_id,
        token_hash,
        expires_at
      )
      VALUES (
        ${ids.sessionId},
        ${ids.userId},
        ${`token-${ids.sessionId}`},
        '2099-01-01T00:00:00Z'
      )
    `;
    await sql`
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
        ${ids.importBatchId},
        ${ids.accountId},
        'icici-bank-csv',
        ${`${ids.userId}.csv`},
        ${`sha256:${ids.importBatchId}`},
        'raw',
        'uploaded'
      )
    `;
    await sql`
      INSERT INTO transactions (
        id,
        account_id,
        import_batch_id,
        transaction_date,
        description,
        direction,
        amount_minor_units,
        running_balance_minor_units,
        source_fingerprint,
        global_row_fingerprint,
        row_hash,
        raw_source_payload
      )
      VALUES
        (
          ${ids.outgoingTransactionId},
          ${ids.accountId},
          ${ids.importBatchId},
          '2026-04-01',
          'Outgoing cleanup row',
          'outgoing',
          100,
          900,
          ${`source-${ids.outgoingTransactionId}`},
          ${`global-${ids.outgoingTransactionId}`},
          ${`hash-${ids.outgoingTransactionId}`},
          '{}'
        ),
        (
          ${ids.incomingTransactionId},
          ${ids.accountId},
          ${ids.importBatchId},
          '2026-04-02',
          'Incoming cleanup row',
          'incoming',
          100,
          1000,
          ${`source-${ids.incomingTransactionId}`},
          ${`global-${ids.incomingTransactionId}`},
          ${`hash-${ids.incomingTransactionId}`},
          '{}'
        )
    `;
    await sql`
      INSERT INTO transfer_matches (
        id,
        outgoing_transaction_id,
        incoming_transaction_id
      )
      VALUES (
        ${ids.transferMatchId},
        ${ids.outgoingTransactionId},
        ${ids.incomingTransactionId}
      )
    `;
    await sql`
      INSERT INTO statement_tallies (
        id,
        account_id,
        import_batch_id,
        total_incoming_minor_units,
        total_outgoing_minor_units,
        net_movement_minor_units,
        opening_balance_minor_units,
        closing_balance_minor_units,
        calculated_closing_balance_minor_units,
        difference_minor_units
      )
      VALUES (
        ${ids.statementTallyId},
        ${ids.accountId},
        ${ids.importBatchId},
        100,
        100,
        0,
        900,
        1000,
        1000,
        0
      )
    `;
    await sql`
      INSERT INTO month_closes (
        id,
        owner_user_id,
        month,
        closed_by
      )
      VALUES (
        ${ids.monthCloseId},
        ${ids.userId},
        '2026-04',
        ${ids.userId}
      )
    `;
  }

  async function seedClassificationRows() {
    await sql`
      INSERT INTO classification_datasets (
        id,
        name,
        source_path,
        checksum,
        imported_row_count
      )
      VALUES (
        ${datasetId},
        'Dev Cleanup Dataset',
        'assets/datasets/dev-cleanup.csv',
        'checksum',
        1
      )
    `;
    await sql`
      INSERT INTO classification_examples (
        id,
        dataset_id,
        original_text,
        normalized_text,
        category,
        source_row_hash
      )
      VALUES (
        ${exampleId},
        ${datasetId},
        'Original',
        'original',
        'food',
        'source-row-hash'
      )
    `;
    await sql`
      INSERT INTO classification_rules (
        id,
        pattern,
        category,
        priority,
        source
      )
      VALUES (
        ${ruleId},
        'cleanup',
        'food',
        1,
        'test'
      )
    `;
  }

  async function seedSupabaseAuthTraceRows() {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`
      CREATE TABLE IF NOT EXISTS auth.dev_cleanup_login_traces (
        id uuid PRIMARY KEY,
        email text NOT NULL
      )
    `;
    await sql`
      INSERT INTO auth.dev_cleanup_login_traces (
        id,
        email
      )
      VALUES (
        ${target.userId},
        'supabase-auth-trace@example.com'
      )
    `;
  }

  async function rowCount(tableName: string, id: string) {
    const [row] = await sql.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM ${tableName} WHERE id = $1`,
      [id]
    );

    return row.count;
  }
});

function seedIds(prefix: string): SeedIds {
  return {
    accountId: `${prefix}-0000-4000-8000-000000000001`,
    userId: `${prefix}-0000-4000-8000-000000000002`,
    sessionId: `${prefix}-0000-4000-8000-000000000003`,
    importBatchId: `${prefix}-0000-4000-8000-000000000004`,
    outgoingTransactionId: `${prefix}-0000-4000-8000-000000000005`,
    incomingTransactionId: `${prefix}-0000-4000-8000-000000000006`,
    transferMatchId: `${prefix}-0000-4000-8000-000000000007`,
    statementTallyId: `${prefix}-0000-4000-8000-000000000008`,
    monthCloseId: `${prefix}-0000-4000-8000-000000000009`
  };
}

function scriptForTest(script: string, ownerUserId?: string) {
  return script
    .replace(/^BEGIN;\s*/m, "")
    .replace(/\s*COMMIT;\s*$/m, "")
    .replace("replace-with-owner-user-id", ownerUserId ?? "replace-with-owner-user-id");
}
