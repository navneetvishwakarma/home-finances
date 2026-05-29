import { readFile } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { accounts, importBatches, statementTallies, transactions } from "@/db/schema";
import {
  computeStatementTally,
  createAccount,
  createImportBatch,
  getImportDashboard,
  persistParsedTransactions,
  updateTransactionCategory,
  updateTransactionDetails,
  createManualTransaction,
  deleteTransaction,
  deleteImportBatch,
  uploadIciciCsvForAccount
} from "@/modules/imports/persistence";
import { DashboardLedger } from "@/modules/dashboard/DashboardLedger";
import { runIciciCsvImport } from "@/modules/imports/import-flow";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDb("database-backed import flow", () => {
const client = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(client);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.delete(statementTallies);
  await db.delete(transactions);
  await db.delete(importBatches);
  await db.delete(accounts);
});

afterAll(async () => {
  await client.end();
});

test("persists a bank account and an import batch through the database schema", async () => {
  const account = await createAccount(db, {
    displayName: "ICICI Savings",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });

  const importBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "2604-icici-savings-statement.csv",
    fileFingerprint: "sha256:test-fixture",
    rawSource: "csv-content",
    status: "imported"
  });

  expect(account).toMatchObject({
    accountType: "bank",
    displayName: "ICICI Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    active: true
  });
  expect(importBatch).toMatchObject({
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "2604-icici-savings-statement.csv",
    fileFingerprint: "sha256:test-fixture",
    status: "imported"
  });
});

test("reuses the existing import batch when the same ICICI CSV is uploaded twice for one account", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Duplicate Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });

  const firstUpload = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });

  const duplicateUpload = await uploadIciciCsvForAccount(db, {
      accountId: account.id,
      filename: "2604-icici-savings-statement.csv",
      rawCsv
    });

  const [persistedBatch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, firstUpload.id));
  const accountImportBatches = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.accountId, account.id));

  expect(duplicateUpload.id).toBe(firstUpload.id);
  expect(accountImportBatches).toHaveLength(1);
  expect(persistedBatch).toMatchObject({
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "2604-icici-savings-statement.csv",
    rawSource: rawCsv,
    status: "uploaded"
  });
  expect(persistedBatch.fileFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
});

test("persists parsed ICICI rows as canonical bank transactions", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Ledger Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });
  const parsedRows = parseSourceCsv(rawCsv).rows;

  const persistedTransactions = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [parsedRows[0], parsedRows[2]]
  });

  const transactionsByDirection = Object.fromEntries(
    persistedTransactions.map((transaction) => [transaction.direction, transaction])
  );
  const [incoming, outgoing] = await db
    .select()
    .from(transactions)
    .where(
      inArray(transactions.id, [
        transactionsByDirection.incoming.id,
        transactionsByDirection.outgoing.id
      ])
    );

  expect(transactionsByDirection.incoming).toMatchObject({
    accountId: account.id,
    importBatchId: importBatch.id,
    transactionDate: "2026-04-02",
    description: "ACCT CLOSURE TRANSACTION 0354",
    direction: "incoming",
    amountMinorUnits: 14920000,
    runningBalanceMinorUnits: 15226846
  });
  expect(transactionsByDirection.incoming.rowHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(incoming.rawSourcePayload).toMatchObject({
    "Transaction Remarks": "ACCT CLOSURE TRANSACTION 0354",
    "Deposit Amount(INR)": "149200.00"
  });
  expect(transactionsByDirection.outgoing).toMatchObject({
    transactionDate: "2026-04-05",
    description: "INF/IWISH CONTRIBUTION",
    direction: "outgoing",
    amountMinorUnits: 620000,
    runningBalanceMinorUnits: 15336546,
    category: "savings_investments",
    categorySource: "system_rule"
  });
  expect(outgoing.rawSourcePayload).toMatchObject({
    "Transaction Remarks": "INF/IWISH CONTRIBUTION",
    "Withdrawal Amount(INR)": "6200.00"
  });
});

test("updates a transaction category manually and marks the source as manual", async () => {
  const account = await createAccount(db, {
    displayName: "ICICI Savings Manual Category Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "manual-category.csv",
    fileFingerprint: "sha256:manual-category",
    rawSource: "csv-content",
    status: "uploaded"
  });
  const [transaction] = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [
      {
        valueDate: "2026-04-01",
        transactionDate: "2026-04-01",
        description: "UPI GROCERY STORE",
        withdrawalAmount: "1200.00",
        depositAmount: "0.00",
        balance: "10000.00",
        rawRow: {
          "S No.": "1",
          "Transaction Remarks": "UPI GROCERY STORE",
          "Withdrawal Amount(INR)": "1200.00",
          "Deposit Amount(INR)": "0.00"
        }
      }
    ]
  });

  const updated = await updateTransactionCategory(db, {
    transactionId: transaction.id,
    category: "food"
  });

  expect(updated).toMatchObject({
    id: transaction.id,
    category: "food",
    categorySource: "manual"
  });
});

test("edits imported transaction display fields without mutating source identity", async () => {
  const account = await createAccount(db, {
    displayName: "Imported Transaction Edit Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "editable-import.csv",
    fileFingerprint: "sha256:editable-import",
    rawSource: "csv-content",
    status: "uploaded"
  });
  const [transaction] = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [
      {
        valueDate: "2026-04-01",
        transactionDate: "2026-04-01",
        description: "UPI GROCERY STORE",
        withdrawalAmount: "1200.00",
        depositAmount: "0.00",
        balance: "10000.00",
        rawRow: {
          "S No.": "1",
          "Transaction Remarks": "UPI GROCERY STORE",
          "Withdrawal Amount(INR)": "1200.00",
          "Deposit Amount(INR)": "0.00"
        }
      }
    ]
  });

  const updated = await updateTransactionDetails(db, {
    transactionId: transaction.id,
    description: "Groceries at local store",
    category: "food",
    tags: ["household", "weekly"]
  });

  expect(updated).toMatchObject({
    id: transaction.id,
    description: "Groceries at local store",
    originalDescription: "UPI GROCERY STORE",
    category: "food",
    categorySource: "manual",
    sourceType: "imported",
    importBatchId: importBatch.id,
    rowHash: transaction.rowHash,
    sourceRowId: transaction.sourceRowId,
    tags: ["household", "weekly"]
  });
});

test("restores a manually deleted imported transaction when the same source is re-imported", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "Imported Transaction Restore Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });
  const [firstParsedRow] = parseSourceCsv(rawCsv).rows;
  const [transaction] = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [firstParsedRow]
  });

  await deleteTransaction(db, { transactionId: transaction.id });
  expect((await getImportDashboard(db, importBatch.id)).transactions).toHaveLength(0);

  const duplicateImportBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });
  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: duplicateImportBatch.id,
    rows: [firstParsedRow]
  });

  const restoredDashboard = await getImportDashboard(db, importBatch.id);
  expect(duplicateImportBatch.id).toBe(importBatch.id);
  expect(restoredDashboard.transactions).toHaveLength(1);
  expect(restoredDashboard.transactions[0]).toMatchObject({
    id: transaction.id,
    deletedAt: null,
    sourceType: "imported"
  });
});

test("manual transactions can be added and deleted without source-row restore behavior", async () => {
  const account = await createAccount(db, {
    displayName: "Manual Transaction Test",
    providerLabel: "Manual",
    currency: "INR"
  });

  const manualTransaction = await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-10",
    description: "Cash groceries",
    direction: "outgoing",
    amountMinorUnits: 180000,
    category: "food",
    tags: ["cash"]
  });

  expect(manualTransaction).toMatchObject({
    accountId: account.id,
    importBatchId: null,
    sourceType: "manual",
    sourceRowId: null,
    originalDescription: null,
    description: "Cash groceries",
    tags: ["cash"]
  });

  await deleteTransaction(db, { transactionId: manualTransaction.id });

  const [deletedManualTransaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, manualTransaction.id));
  expect(deletedManualTransaction.deletedAt).toBeInstanceOf(Date);
});

test("deleting an import hides its source-derived transactions from active dashboards", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");
  const dashboard = await runIciciCsvImport(db, {
    accountDisplayName: "Import Delete Test",
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });

  await deleteImportBatch(db, { importBatchId: dashboard.importBatch.id });

  const deletedDashboard = await getImportDashboard(db, dashboard.importBatch.id);
  expect(deletedDashboard.importBatch.status).toBe("deleted");
  expect(deletedDashboard.transactions).toHaveLength(0);
});

test("computes and persists a statement tally for an imported ledger", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Tally Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });
  const parsedRows = parseSourceCsv(rawCsv).rows;
  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: parsedRows.slice(0, 3)
  });

  const tally = await computeStatementTally(db, {
    accountId: account.id,
    importBatchId: importBatch.id
  });

  expect(tally).toMatchObject({
    accountId: account.id,
    importBatchId: importBatch.id,
    totalIncomingMinorUnits: 15649700,
    totalOutgoingMinorUnits: 620000,
    netMovementMinorUnits: 15029700,
    openingBalanceMinorUnits: 306846,
    closingBalanceMinorUnits: 15336546,
    calculatedClosingBalanceMinorUnits: 15336546,
    differenceMinorUnits: 0
  });

  const [persistedTally] = await db
    .select()
    .from(statementTallies)
    .where(eq(statementTallies.importBatchId, importBatch.id));

  expect(persistedTally.id).toBe(tally.id);
});

test("persists transaction and tally amounts above 32-bit integer range", async () => {
  const account = await createAccount(db, {
    displayName: "ICICI Savings Large Amount Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "large-amount.csv",
    fileFingerprint: "sha256:large-amount",
    rawSource: "csv-content",
    status: "uploaded"
  });

  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [
      {
        valueDate: "2026-04-01",
        transactionDate: "2026-04-01",
        description: "LARGE CREDIT",
        withdrawalAmount: "0.00",
        depositAmount: "30000000.00",
        balance: "30000000.00",
        rawRow: {
          "S No.": "1",
          "Transaction Remarks": "LARGE CREDIT",
          "Deposit Amount(INR)": "30000000.00",
          "Withdrawal Amount(INR)": "0.00"
        }
      }
    ]
  });

  const tally = await computeStatementTally(db, {
    accountId: account.id,
    importBatchId: importBatch.id
  });

  expect(tally.totalIncomingMinorUnits).toBe(3000000000);
  expect(tally.closingBalanceMinorUnits).toBe(3000000000);
});

test("renders persisted tally values and ledger rows in the dashboard", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Dashboard Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });
  const parsedRows = parseSourceCsv(rawCsv).rows;
  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: parsedRows.slice(0, 3)
  });
  await computeStatementTally(db, {
    accountId: account.id,
    importBatchId: importBatch.id
  });

  const dashboard = await getImportDashboard(db, importBatch.id);
  const html = renderToStaticMarkup(createElement(DashboardLedger, { data: dashboard }));

  expect(html).toContain("Import batch");
  expect(html).toContain(importBatch.id);
  expect(html).toContain("INR 156,497.00");
  expect(html).toContain("INR 6,200.00");
  expect(html).toContain("INR 150,297.00");
  expect(html).toContain("Balanced");
  expect(html).toContain("ACCT CLOSURE TRANSACTION 0354");
  expect(html).toContain("Incoming");
  expect(html).toContain("INF/IWISH CONTRIBUTION");
  expect(html).toContain("Outgoing");
  expect(html).toContain("INR 153,365.46");
});

test("runs the full ICICI import flow and returns dashboard data for the UI", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");

  const dashboard = await runIciciCsvImport(db, {
    accountDisplayName: "ICICI Savings UI Flow Test",
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });

  expect(dashboard.importBatch.filename).toBe("2604-icici-savings-statement.csv");
  expect(dashboard.tally.totalIncomingMinorUnits).toBeGreaterThan(0);
  expect(dashboard.tally.differenceMinorUnits).toBe(400000);
  expect(dashboard.transactions.length).toBeGreaterThan(10);
  expect(dashboard.transactions[0]).toMatchObject({
    transactionDate: "2026-04-02",
    direction: "incoming",
    amountMinorUnits: 14920000
  });
});

test("runs the full import flow idempotently when the same statement is re-imported", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");

  const firstDashboard = await runIciciCsvImport(db, {
    accountDisplayName: "ICICI Savings Full Idempotency Test",
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });
  const secondDashboard = await runIciciCsvImport(db, {
    accountDisplayName: "ICICI Savings Full Idempotency Test",
    filename: "2604-icici-savings-statement.csv",
    rawCsv
  });
  const accountTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, firstDashboard.importBatch.accountId));

  expect(secondDashboard.importBatch.id).toBe(firstDashboard.importBatch.id);
  expect(secondDashboard.transactions).toHaveLength(firstDashboard.transactions.length);
  expect(accountTransactions).toHaveLength(firstDashboard.transactions.length);
});
});
