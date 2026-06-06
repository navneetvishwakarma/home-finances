import { readFile } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  accounts,
  accountStatementTemplates,
  importBatches,
  monthCloses,
  pendingStatementImports,
  statementTallies,
  transactions,
  transferMatches
} from "@/db/schema";
import {
  computeStatementTally,
  createAccount,
  createImportBatch,
  deactivateAccount,
  getImportDashboard,
  persistParsedTransactions,
  reactivateAccount,
  renameAccount,
  updateAccountMetadata,
  updateTransactionCategory,
  updateTransactionDetails,
  createManualTransaction,
  backfillManualTransactionRunningBalances,
  closeMonth,
  deleteTransaction,
  deleteImportBatch,
  getAvailableLedgerMonths,
  getAccountManagementRows,
  getCategoryBreakdown,
  getConsolidatedMonthTally,
  getMonthDashboards,
  getMonthCloseStatus,
  getPendingStatementImport,
  reopenMonth,
  uploadIciciCsvForAccount
} from "@/modules/imports/persistence";
import { DashboardLedger } from "@/modules/dashboard/DashboardLedger";
import {
  confirmPendingStatementImport,
  prepareStatementImport,
  runIciciCsvImport
} from "@/modules/imports/import-flow";
import { buildSourceAccountMetadata } from "@/modules/source-profiles/account-metadata";
import { parseSourceCsv } from "@/modules/source-profiles/registry";
import {
  confirmTransfer,
  detectTransferCandidates,
  dismissTransfer
} from "@/modules/transfers/persistence";

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDb("database-backed import flow", () => {
const client = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(client);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.delete(transferMatches);
  await db.delete(monthCloses);
  await db.delete(statementTallies);
  await db.delete(transactions);
  await db.delete(importBatches);
  await db.delete(pendingStatementImports);
  await db.delete(accountStatementTemplates);
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
    filename: "icici-savings-sample-01.csv",
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
    filename: "icici-savings-sample-01.csv",
    fileFingerprint: "sha256:test-fixture",
    status: "imported"
  });
});

test("reuses the existing import batch when the same ICICI CSV is uploaded twice for one account", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Duplicate Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });

  const firstUpload = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "icici-savings-sample-01.csv",
    rawCsv
  });

  const duplicateUpload = await uploadIciciCsvForAccount(db, {
      accountId: account.id,
      filename: "icici-savings-sample-01.csv",
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
    filename: "icici-savings-sample-01.csv",
    rawSource: rawCsv,
    status: "uploaded"
  });
  expect(persistedBatch.fileFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
});

test("persists parsed ICICI rows as canonical bank transactions", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Ledger Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "icici-savings-sample-01.csv",
    rawCsv
  });
  const parsedRows = parseSourceCsv(rawCsv).rows;

  const persistedTransactions = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [parsedRows[0], parsedRows[4]]
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
    transactionDate: "2026-05-04",
    description: "UPI/NAVNEET KU/navneet.nifft-/RDs/HDFC BANK/122615852638/HDF58f4840ac39b4f1186c297b72148f332",
    direction: "incoming",
    amountMinorUnits: 2500000,
    runningBalanceMinorUnits: 3369077
  });
  expect(transactionsByDirection.incoming.rowHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(incoming.rawSourcePayload).toMatchObject({
    "Transaction Remarks": "UPI/NAVNEET KU/navneet.nifft-/RDs/HDFC BANK/122615852638/HDF58f4840ac39b4f1186c297b72148f332",
    "Deposit Amount(INR)": "25000.00"
  });
  expect(transactionsByDirection.outgoing).toMatchObject({
    transactionDate: "2026-05-05",
    description: "INF/IWISH CONTRIBUTION",
    direction: "outgoing",
    amountMinorUnits: 620000,
    runningBalanceMinorUnits: 7370131,
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
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "Imported Transaction Restore Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "icici-savings-sample-01.csv",
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
    filename: "icici-savings-sample-01.csv",
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

test("stores a supplied running balance for a manual transaction", async () => {
  const account = await createAccount(db, {
    displayName: "Manual Supplied Balance Test",
    providerLabel: "Manual",
    currency: "INR"
  });

  const manualTransaction = await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-10",
    description: "Cash rent",
    direction: "outgoing",
    amountMinorUnits: 2500000,
    runningBalanceMinorUnits: 7250000,
    category: "rent_home",
    tags: []
  });

  expect(manualTransaction).toMatchObject({
    runningBalanceMinorUnits: 7250000,
    balanceEstimated: false
  });
});

test("computes a manual transaction running balance from the closest prior non-zero balance", async () => {
  const account = await createAccount(db, {
    displayName: "Manual Computed Balance Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "prior-balance.csv",
    fileFingerprint: "sha256:prior-balance",
    rawSource: "csv-content",
    status: "uploaded"
  });
  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [
      {
        valueDate: "2026-04-08",
        transactionDate: "2026-04-08",
        description: "OLDER BALANCE",
        withdrawalAmount: "0.00",
        depositAmount: "100.00",
        balance: "50000.00",
        rawRow: { "S No.": "1", "Transaction Remarks": "OLDER BALANCE" }
      },
      {
        valueDate: "2026-04-09",
        transactionDate: "2026-04-09",
        description: "CLOSEST PRIOR BALANCE",
        withdrawalAmount: "0.00",
        depositAmount: "200.00",
        balance: "60000.00",
        rawRow: { "S No.": "2", "Transaction Remarks": "CLOSEST PRIOR BALANCE" }
      }
    ]
  });

  const manualTransaction = await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-10",
    description: "Cash groceries",
    direction: "outgoing",
    amountMinorUnits: 180000,
    category: "food",
    tags: []
  });

  expect(manualTransaction).toMatchObject({
    runningBalanceMinorUnits: 5820000,
    balanceEstimated: true
  });
});

test("stores zero and marks balance estimated when a manual transaction has no prior balance", async () => {
  const account = await createAccount(db, {
    displayName: "Manual No Prior Balance Test",
    providerLabel: "Manual",
    currency: "INR"
  });

  const manualTransaction = await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-10",
    description: "Opening cash expense",
    direction: "outgoing",
    amountMinorUnits: 180000,
    category: "food",
    tags: []
  });

  expect(manualTransaction).toMatchObject({
    runningBalanceMinorUnits: 0,
    balanceEstimated: true
  });
});

test("backfills existing manual transaction running balances idempotently", async () => {
  const account = await createAccount(db, {
    displayName: "Manual Balance Backfill Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "backfill-prior-balance.csv",
    fileFingerprint: "sha256:backfill-prior-balance",
    rawSource: "csv-content",
    status: "uploaded"
  });
  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [
      {
        valueDate: "2026-04-09",
        transactionDate: "2026-04-09",
        description: "PRIOR BALANCE",
        withdrawalAmount: "0.00",
        depositAmount: "100.00",
        balance: "60000.00",
        rawRow: { "S No.": "1", "Transaction Remarks": "PRIOR BALANCE" }
      }
    ]
  });
  await db.insert(transactions).values({
    id: "11111111-1111-4111-8111-111111111111",
    accountId: account.id,
    importBatchId: null,
    sourceType: "manual",
    sourceRowId: null,
    transactionDate: "2026-04-10",
    description: "Historical cash groceries",
    originalDescription: null,
    direction: "outgoing",
    amountMinorUnits: 180000,
    runningBalanceMinorUnits: 0,
    balanceEstimated: false,
    category: "food",
    categorySource: "manual",
    sourceFingerprint: "manual:backfill-balance",
    globalRowFingerprint: "manual:backfill-balance",
    rowHash: "manual:backfill-balance",
    rawSourcePayload: { source: "manual" },
    tags: []
  });

  const firstBackfill = await backfillManualTransactionRunningBalances(db);
  const secondBackfill = await backfillManualTransactionRunningBalances(db);
  const [backfilledTransaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.sourceFingerprint, "manual:backfill-balance"));

  expect(firstBackfill.updatedCount).toBe(1);
  expect(secondBackfill.updatedCount).toBe(0);
  expect(backfilledTransaction).toMatchObject({
    runningBalanceMinorUnits: 5820000,
    balanceEstimated: true
  });
});

test("deleting an import hides its source-derived transactions from active dashboards", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const dashboard = await runIciciCsvImport(db, {
    accountDisplayName: "Import Delete Test",
    filename: "icici-savings-sample-01.csv",
    rawCsv
  });

  await deleteImportBatch(db, { importBatchId: dashboard.importBatch.id });

  const deletedDashboard = await getImportDashboard(db, dashboard.importBatch.id);
  expect(deletedDashboard.importBatch.status).toBe("deleted");
  expect(deletedDashboard.transactions).toHaveLength(0);
});

test("computes and persists a statement tally for an imported ledger", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Tally Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "icici-savings-sample-01.csv",
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
    totalIncomingMinorUnits: 8038500,
    totalOutgoingMinorUnits: 767446,
    netMovementMinorUnits: 7271054,
    openingBalanceMinorUnits: 869077,
    closingBalanceMinorUnits: 8140131,
    calculatedClosingBalanceMinorUnits: 8140131,
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
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const account = await createAccount(db, {
    displayName: "ICICI Savings Dashboard Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: "icici-savings-sample-01.csv",
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
  expect(html).toContain("INR 80,385.00");
  expect(html).toContain("INR 7,674.46");
  expect(html).toContain("INR 72,710.54");
  expect(html).toContain("Balanced");
  expect(html).toContain("UPI/NAVNEET KU/navneet.nifft-/RDs/HDFC BANK/122615852638/HDF58f4840ac39b4f1186c297b72148f332");
  expect(html).toContain("Incoming");
  expect(html).toContain("UPI/AXIS BANK/fcpgaxisbankbs/UPI/AXIS BANK/649177254396/FCPGUPIINTENTbbd84ed50e364244645474/");
  expect(html).toContain("Outgoing");
  expect(html).toContain("INR 81,401.31");
});

test("runs the full ICICI import flow and returns dashboard data for the UI", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");

  const dashboard = await runIciciCsvImport(db, {
    accountDisplayName: "ICICI Savings UI Flow Test",
    filename: "icici-savings-sample-01.csv",
    rawCsv
  });

  expect(dashboard.importBatch.filename).toBe("icici-savings-sample-01.csv");
  expect(dashboard.tally.totalIncomingMinorUnits).toBeGreaterThan(0);
  expect(dashboard.tally.differenceMinorUnits).toBe(0);
  expect(dashboard.transactions.length).toBeGreaterThan(10);
  expect(dashboard.transactions[0]).toMatchObject({
    transactionDate: "2026-05-04",
    direction: "incoming",
    amountMinorUnits: 2500000
  });
});

test("runs the full import flow idempotently when the same statement is re-imported", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");

  const firstDashboard = await runIciciCsvImport(db, {
    accountDisplayName: "ICICI Savings Full Idempotency Test",
    filename: "icici-savings-sample-01.csv",
    rawCsv
  });
  const secondDashboard = await runIciciCsvImport(db, {
    accountDisplayName: "ICICI Savings Full Idempotency Test",
    filename: "icici-savings-sample-01.csv",
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

test("deduplicates source transactions across different import batches in a month view", async () => {
  const account = await createAccount(db, {
    displayName: "Source Transaction Idempotency Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const firstImportBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "part-one.csv",
    fileFingerprint: "sha256:part-one",
    rawSource: "csv-content-one",
    status: "uploaded"
  });
  const secondImportBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "part-two.csv",
    fileFingerprint: "sha256:part-two",
    rawSource: "csv-content-two",
    status: "uploaded"
  });
  const row = {
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
  };

  const [firstTransaction] = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: firstImportBatch.id,
    rows: [row]
  });
  const [secondTransaction] = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: secondImportBatch.id,
    rows: [row]
  });

  expect(secondTransaction.id).toBe(firstTransaction.id);

  const monthDashboards = await getMonthDashboards(db, "2026-04");
  const matchingTransactions = monthDashboards.flatMap((dashboard) =>
    dashboard.transactions.filter((transaction) =>
      [firstTransaction.id, secondTransaction.id].includes(transaction.id)
    )
  );

  expect(matchingTransactions).toHaveLength(1);
  expect(matchingTransactions[0]).toMatchObject({
    id: firstTransaction.id,
    importBatchId: firstImportBatch.id,
    sourceType: "imported"
  });
});

test("skips duplicate transactions across import batches by global row fingerprint", async () => {
  const account = await createAccount(db, {
    displayName: "Global Row Fingerprint Duplicate Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const firstImportBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "overlap-april.csv",
    fileFingerprint: "sha256:overlap-april",
    rawSource: "csv-content-one",
    status: "uploaded"
  });
  const secondImportBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "overlap-may.csv",
    fileFingerprint: "sha256:overlap-may",
    rawSource: "csv-content-two",
    status: "uploaded"
  });

  const [firstTransaction] = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: firstImportBatch.id,
    sourceProfileId: "icici-bank-csv",
    rows: [
      {
        valueDate: "2026-04-30",
        transactionDate: "2026-04-30",
        description: "UPI GROCERY STORE",
        withdrawalAmount: "1200.00",
        depositAmount: "0.00",
        balance: "10000.00",
        rawRow: {
          "S No.": "18",
          "Transaction Remarks": "UPI GROCERY STORE",
          "Withdrawal Amount(INR)": "1200.00",
          "Deposit Amount(INR)": "0.00",
          "Balance(INR)": "10000.00"
        }
      }
    ]
  });
  const secondResult = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: secondImportBatch.id,
    sourceProfileId: "icici-bank-csv",
    rows: [
      {
        valueDate: "2026-04-30",
        transactionDate: "2026-04-30",
        description: "UPI GROCERY STORE",
        withdrawalAmount: "1200.00",
        depositAmount: "0.00",
        balance: "10000.00",
        rawRow: {
          "S No.": "2",
          "Transaction Remarks": "UPI GROCERY STORE",
          "Withdrawal Amount(INR)": "1200.00",
          "Deposit Amount(INR)": "0.00",
          "Balance(INR)": "10000.00"
        }
      }
    ]
  });

  const accountTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, account.id));
  const [updatedSecondBatch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, secondImportBatch.id));

  expect(secondResult).toHaveLength(0);
  expect((secondResult as any).skippedCount).toBe(1);
  expect(updatedSecondBatch).toMatchObject({ skippedRowCount: 1 });
  expect(accountTransactions).toHaveLength(1);
  expect(accountTransactions[0]).toMatchObject({
    id: firstTransaction.id,
    importBatchId: firstImportBatch.id
  });

  const duplicateOnlyTally = await computeStatementTally(db, {
    accountId: account.id,
    importBatchId: secondImportBatch.id
  });

  expect(duplicateOnlyTally).toMatchObject({
    totalIncomingMinorUnits: 0,
    totalOutgoingMinorUnits: 0,
    netMovementMinorUnits: 0
  });
});

test("does not globally dedupe same-day same-amount transactions with different running balances", async () => {
  const account = await createAccount(db, {
    displayName: "Global Row Fingerprint Tie Breaker Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const firstImportBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "same-amount-one.csv",
    fileFingerprint: "sha256:same-amount-one",
    rawSource: "csv-content-one",
    status: "uploaded"
  });
  const secondImportBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "same-amount-two.csv",
    fileFingerprint: "sha256:same-amount-two",
    rawSource: "csv-content-two",
    status: "uploaded"
  });

  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: firstImportBatch.id,
    sourceProfileId: "icici-bank-csv",
    rows: [
      {
        valueDate: "2026-04-30",
        transactionDate: "2026-04-30",
        description: "UPI GROCERY STORE",
        withdrawalAmount: "1200.00",
        depositAmount: "0.00",
        balance: "10000.00",
        rawRow: { "S No.": "18", "Transaction Remarks": "UPI GROCERY STORE" }
      }
    ]
  });
  const secondResult = await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: secondImportBatch.id,
    sourceProfileId: "icici-bank-csv",
    rows: [
      {
        valueDate: "2026-04-30",
        transactionDate: "2026-04-30",
        description: "UPI GROCERY STORE",
        withdrawalAmount: "1200.00",
        depositAmount: "0.00",
        balance: "98800.00",
        rawRow: { "S No.": "19", "Transaction Remarks": "UPI GROCERY STORE" }
      }
    ]
  });

  const accountTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, account.id));

  expect(secondResult).toHaveLength(1);
  expect((secondResult as any).skippedCount).toBe(0);
  expect(accountTransactions).toHaveLength(2);
});

test("lists ledger months from active transaction dates with latest month first", async () => {
  const account = await createAccount(db, {
    displayName: "Available Month Test",
    providerLabel: "ICICI Bank",
    currency: "INR"
  });
  const importBatch = await createImportBatch(db, {
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "multi-month.csv",
    fileFingerprint: "sha256:multi-month",
    rawSource: "csv-content",
    status: "uploaded"
  });
  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: [
      {
        valueDate: "2026-03-31",
        transactionDate: "2026-03-31",
        description: "MARCH ROW",
        withdrawalAmount: "0.00",
        depositAmount: "100.00",
        balance: "100.00",
        rawRow: { "S No.": "1", "Transaction Remarks": "MARCH ROW" }
      },
      {
        valueDate: "2026-04-01",
        transactionDate: "2026-04-01",
        description: "APRIL ROW",
        withdrawalAmount: "0.00",
        depositAmount: "100.00",
        balance: "200.00",
        rawRow: { "S No.": "2", "Transaction Remarks": "APRIL ROW" }
      }
    ]
  });

  const months = await getAvailableLedgerMonths(db);

  expect(months.slice(0, 2)).toEqual(["2026-05", "2026-04"]);
});

test("computes a consolidated month tally across accounts including manual transactions", async () => {
  const ownerUserId = "consolidated-month-user";
  const bankAccount = await createAccount(db, {
    displayName: "Consolidated Bank Account",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const cardAccount = await createAccount(db, {
    displayName: "Consolidated Card Account",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  const bankImportBatch = await createImportBatch(db, {
    accountId: bankAccount.id,
    sourceProfileId: "icici-bank-csv",
    filename: "bank-april.csv",
    fileFingerprint: "sha256:bank-april",
    rawSource: "csv",
    status: "uploaded"
  });
  const cardImportBatch = await createImportBatch(db, {
    accountId: cardAccount.id,
    sourceProfileId: "icici-credit-card-csv",
    filename: "card-april.csv",
    fileFingerprint: "sha256:card-april",
    rawSource: "csv",
    status: "uploaded"
  });
  await persistParsedTransactions(db, {
    accountId: bankAccount.id,
    importBatchId: bankImportBatch.id,
    sourceProfileId: "icici-bank-csv",
    rows: [
      {
        valueDate: "2026-04-03",
        transactionDate: "2026-04-03",
        description: "APRIL SALARY",
        withdrawalAmount: "0.00",
        depositAmount: "80000.00",
        balance: "90000.00",
        rawRow: { "S No.": "1", "Transaction Remarks": "APRIL SALARY" }
      },
      {
        valueDate: "2026-04-04",
        transactionDate: "2026-04-04",
        description: "UPI GROCERIES",
        withdrawalAmount: "5000.00",
        depositAmount: "0.00",
        balance: "85000.00",
        rawRow: { "S No.": "2", "Transaction Remarks": "UPI GROCERIES" }
      }
    ]
  });
  await persistParsedTransactions(db, {
    accountId: cardAccount.id,
    importBatchId: cardImportBatch.id,
    sourceProfileId: "icici-credit-card-csv",
    rows: [
      {
        valueDate: "2026-04-05",
        transactionDate: "2026-04-05",
        description: "CARD RESTAURANT",
        withdrawalAmount: "10000.00",
        depositAmount: "0.00",
        balance: "75000.00",
        rawRow: { "S No.": "1", "Transaction Remarks": "CARD RESTAURANT" }
      }
    ]
  });
  await createManualTransaction(db, {
    accountId: bankAccount.id,
    transactionDate: "2026-04-06",
    description: "Manual cash income",
    direction: "incoming",
    amountMinorUnits: 200000,
    category: "income",
    tags: []
  });

  const tally = await getConsolidatedMonthTally(db, "2026-04", ownerUserId);

  expect(tally).toMatchObject({
    totalIncomingMinorUnits: 8200000,
    totalOutgoingMinorUnits: 1500000,
    netMovementMinorUnits: 6700000,
    instrumentCount: 2,
    manualTransactionCount: 1
  });
});

test("detects transfer candidates across owned accounts within the date window", async () => {
  const ownerUserId = "transfer-candidate-owner";
  const savings = await createAccount(db, {
    displayName: "Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const card = await createAccount(db, {
    displayName: "Credit card",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-05",
    description: "CARD PAYMENT",
    direction: "outgoing",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-06",
    description: "PAYMENT RECEIVED",
    direction: "incoming",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });

  const candidates = await detectTransferCandidates(db, "2026-04", ownerUserId);

  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({
    outgoingAccountName: "Savings",
    incomingAccountName: "Credit card",
    amountMinorUnits: 5000000,
    dayDifference: 1
  });
});

test("does not detect transfer candidates outside the date window", async () => {
  const ownerUserId = "transfer-window-owner";
  const savings = await createAccount(db, {
    displayName: "Window Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const card = await createAccount(db, {
    displayName: "Window Card",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-05",
    description: "CARD PAYMENT",
    direction: "outgoing",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-08",
    description: "PAYMENT RECEIVED",
    direction: "incoming",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });

  await expect(detectTransferCandidates(db, "2026-04", ownerUserId)).resolves.toEqual([]);
});

test("does not detect transfer candidates when amounts differ", async () => {
  const ownerUserId = "transfer-amount-owner";
  const savings = await createAccount(db, {
    displayName: "Amount Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const card = await createAccount(db, {
    displayName: "Amount Card",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-05",
    description: "CARD PAYMENT",
    direction: "outgoing",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-05",
    description: "PAYMENT RECEIVED",
    direction: "incoming",
    amountMinorUnits: 4999000,
    category: "transfers",
    tags: [],
    ownerUserId
  });

  await expect(detectTransferCandidates(db, "2026-04", ownerUserId)).resolves.toEqual([]);
});

test("persists confirmed transfers and suppresses the matched pair from future candidates", async () => {
  const ownerUserId = "transfer-confirm-owner";
  const savings = await createAccount(db, {
    displayName: "Confirm Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const card = await createAccount(db, {
    displayName: "Confirm Card",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  const outgoing = await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-05",
    description: "CARD PAYMENT",
    direction: "outgoing",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  const incoming = await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-05",
    description: "PAYMENT RECEIVED",
    direction: "incoming",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });

  const match = await confirmTransfer(db, {
    outgoingTransactionId: outgoing.id,
    incomingTransactionId: incoming.id,
    ownerUserId
  });
  const [persistedMatch] = await db
    .select()
    .from(transferMatches)
    .where(eq(transferMatches.id, match.id));

  expect(persistedMatch).toMatchObject({
    outgoingTransactionId: outgoing.id,
    incomingTransactionId: incoming.id,
    confirmedBy: ownerUserId,
    dismissed: false
  });
  expect(persistedMatch.confirmedAt).toBeInstanceOf(Date);
  await expect(detectTransferCandidates(db, "2026-04", ownerUserId)).resolves.toEqual([]);
});

test("surfaces only the closest incoming match for the same outgoing transaction", async () => {
  const ownerUserId = "transfer-closest-owner";
  const savings = await createAccount(db, {
    displayName: "Closest Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const card = await createAccount(db, {
    displayName: "Closest Card",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-05",
    description: "CARD PAYMENT",
    direction: "outgoing",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-07",
    description: "OLDER POSSIBLE PAYMENT",
    direction: "incoming",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-06",
    description: "CLOSEST PAYMENT",
    direction: "incoming",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });

  const candidates = await detectTransferCandidates(db, "2026-04", ownerUserId);

  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({
    incomingDate: "2026-04-06",
    dayDifference: 1
  });
});

test("confirmed and dismissed transfers are not surfaced as candidates", async () => {
  const ownerUserId = "transfer-dismiss-owner";
  const savings = await createAccount(db, {
    displayName: "Dismiss Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const card = await createAccount(db, {
    displayName: "Dismiss Card",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  const outgoing = await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-05",
    description: "CARD PAYMENT",
    direction: "outgoing",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  const incoming = await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-05",
    description: "PAYMENT RECEIVED",
    direction: "incoming",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });

  await dismissTransfer(db, {
    outgoingTransactionId: outgoing.id,
    incomingTransactionId: incoming.id,
    ownerUserId
  });

  await expect(detectTransferCandidates(db, "2026-04", ownerUserId)).resolves.toEqual([]);
});

test("confirmed transfers are neutralized in consolidated month tally", async () => {
  const ownerUserId = "transfer-neutralized-owner";
  const savings = await createAccount(db, {
    displayName: "Neutral Savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  const card = await createAccount(db, {
    displayName: "Neutral Card",
    providerLabel: "ICICI Card",
    currency: "INR",
    ownerUserId
  });
  const outgoing = await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-05",
    description: "CARD PAYMENT",
    direction: "outgoing",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  const incoming = await createManualTransaction(db, {
    accountId: card.id,
    transactionDate: "2026-04-05",
    description: "PAYMENT RECEIVED",
    direction: "incoming",
    amountMinorUnits: 5000000,
    category: "transfers",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: savings.id,
    transactionDate: "2026-04-06",
    description: "Groceries",
    direction: "outgoing",
    amountMinorUnits: 120000,
    category: "food",
    tags: [],
    ownerUserId
  });

  await confirmTransfer(db, {
    outgoingTransactionId: outgoing.id,
    incomingTransactionId: incoming.id,
    ownerUserId
  });
  const tally = await getConsolidatedMonthTally(db, "2026-04", ownerUserId);

  expect(tally).toMatchObject({
    totalIncomingMinorUnits: 0,
    totalOutgoingMinorUnits: 120000,
    transferNeutralizedPairCount: 1,
    transferNeutralizedMinorUnits: 5000000
  });
});

test("computes monthly category spend totals and percentages", async () => {
  const ownerUserId = "category-breakdown-owner";
  const account = await createAccount(db, {
    displayName: "Category Breakdown Account",
    providerLabel: "Manual",
    currency: "INR",
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-05",
    description: "Rent",
    direction: "outgoing",
    amountMinorUnits: 3000000,
    category: "rent_home",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-06",
    description: "Groceries",
    direction: "outgoing",
    amountMinorUnits: 1000000,
    category: "food",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-07",
    description: "Needs review",
    direction: "outgoing",
    amountMinorUnits: 500000,
    category: "uncategorized",
    tags: [],
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-08",
    description: "Salary",
    direction: "incoming",
    amountMinorUnits: 10000000,
    category: "income",
    tags: [],
    ownerUserId
  });

  const breakdown = await getCategoryBreakdown(db, "2026-04", ownerUserId);

  expect(breakdown).toEqual([
    expect.objectContaining({
      category: "uncategorized",
      label: "Uncategorized",
      outgoingTotalMinorUnits: 500000,
      transactionCount: 1,
      percentageOfTotalOutgoing: 11.1
    }),
    expect.objectContaining({
      category: "rent_home",
      label: "Rent & Home",
      outgoingTotalMinorUnits: 3000000,
      transactionCount: 1,
      percentageOfTotalOutgoing: 66.7
    }),
    expect.objectContaining({
      category: "food",
      label: "Food",
      outgoingTotalMinorUnits: 1000000,
      incomingTotalMinorUnits: 0,
      transactionCount: 1,
      percentageOfTotalOutgoing: 22.2
    })
  ]);
});

test("returns no category spend breakdown when the month has no outgoing transactions", async () => {
  const ownerUserId = "category-income-only-owner";
  const account = await createAccount(db, {
    displayName: "Income Only Account",
    providerLabel: "Manual",
    currency: "INR",
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-06-01",
    description: "Salary",
    direction: "incoming",
    amountMinorUnits: 10000000,
    category: "income",
    tags: [],
    ownerUserId
  });

  await expect(getCategoryBreakdown(db, "2026-06", ownerUserId)).resolves.toEqual([]);
});

test("includes manual transactions in the selected month view", async () => {
  const account = await createAccount(db, {
    displayName: "Manual Month View Test",
    providerLabel: "Manual",
    currency: "INR"
  });
  const manualTransaction = await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-05-10",
    description: "Cash groceries for month view",
    direction: "outgoing",
    amountMinorUnits: 180000,
    category: "food",
    tags: ["cash"]
  });

  const monthDashboards = await getMonthDashboards(db, "2026-05");
  const matchingTransactions = monthDashboards.flatMap((dashboard) =>
    dashboard.transactions.filter((transaction) => transaction.id === manualTransaction.id)
  );

  expect(matchingTransactions).toHaveLength(1);
  expect(matchingTransactions[0]).toMatchObject({
    importBatchId: null,
    sourceType: "manual"
  });
  expect(monthDashboards.some((dashboard) => dashboard.importBatch.filename === "Manual transactions")).toBe(
    true
  );
});

test("scopes dashboard reads and transaction mutations to the authenticated owner", async () => {
  const userAAccount = await createAccount(db, {
    displayName: "User A Isolation",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId: "user-a"
  } as any);
  const userBAccount = await createAccount(db, {
    displayName: "User B Isolation",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId: "user-b"
  } as any);
  const userATransaction = await createManualTransaction(db, {
    accountId: userAAccount.id,
    transactionDate: "2026-04-10",
    description: "User A private row",
    direction: "incoming",
    amountMinorUnits: 10000,
    category: "income",
    tags: []
  });
  const userBTransaction = await createManualTransaction(db, {
    accountId: userBAccount.id,
    transactionDate: "2026-04-11",
    description: "User B private row",
    direction: "incoming",
    amountMinorUnits: 20000,
    category: "income",
    tags: []
  });

  const userADashboards = await getMonthDashboards(db, "2026-04", "user-a");
  const userATransactionIds = userADashboards.flatMap((dashboard) =>
    dashboard.transactions.map((transaction) => transaction.id)
  );

  expect(userATransactionIds).toContain(userATransaction.id);
  expect(userATransactionIds).not.toContain(userBTransaction.id);
  await expect(
    updateTransactionCategory(db, {
      transactionId: userBTransaction.id,
      category: "income",
      ownerUserId: "user-a"
    } as any)
  ).rejects.toThrow("Transaction not found");
});

test("closes and reopens a month for an owner", async () => {
  const closed = await closeMonth(db, {
    month: "2026-04",
    ownerUserId: "month-close-user",
    note: "April reviewed"
  });
  const closedStatus = await getMonthCloseStatus(db, "2026-04", "month-close-user");
  const reopened = await reopenMonth(db, {
    month: "2026-04",
    ownerUserId: "month-close-user"
  });
  const reopenedStatus = await getMonthCloseStatus(db, "2026-04", "month-close-user");

  expect(closed).toMatchObject({
    month: "2026-04",
    ownerUserId: "month-close-user",
    status: "closed",
    note: "April reviewed"
  });
  expect(closedStatus.status).toBe("closed");
  expect(reopened).toMatchObject({
    month: "2026-04",
    ownerUserId: "month-close-user",
    status: "reopened"
  });
  expect(reopenedStatus.status).toBe("open");
});

test("rejects manual transaction creation when the month is closed", async () => {
  const ownerUserId = "closed-month-mutation-user";
  const account = await createAccount(db, {
    displayName: "Closed Month Mutation Account",
    providerLabel: "Manual",
    currency: "INR",
    ownerUserId
  });
  await closeMonth(db, {
    month: "2026-04",
    ownerUserId
  });

  await expect(
    createManualTransaction(db, {
      accountId: account.id,
      transactionDate: "2026-04-10",
      description: "Late cash expense",
      direction: "outgoing",
      amountMinorUnits: 10000,
      category: "food",
      tags: [],
      ownerUserId
    })
  ).rejects.toThrow("Month is closed. Reopen before making changes.");
});

test("rejects transaction category updates when the month is closed", async () => {
  const ownerUserId = "closed-month-update-user";
  const account = await createAccount(db, {
    displayName: "Closed Month Update Account",
    providerLabel: "Manual",
    currency: "INR",
    ownerUserId
  });
  const transaction = await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-10",
    description: "Cash expense before close",
    direction: "outgoing",
    amountMinorUnits: 10000,
    category: "food",
    tags: [],
    ownerUserId
  });
  await closeMonth(db, {
    month: "2026-04",
    ownerUserId
  });

  await expect(
    updateTransactionCategory(db, {
      transactionId: transaction.id,
      category: "other",
      ownerUserId
    })
  ).rejects.toThrow("Month is closed. Reopen before making changes.");
});

test("rejects imports when any parsed transaction month is closed", async () => {
  await closeMonth(db, {
    month: "2026-05",
    ownerUserId: "closed-month-import-user"
  });

  await expect(
    runIciciCsvImport(db, {
      accountDisplayName: "Closed Month Import Account",
      filename: "closed-month.csv",
      rawCsv: await readFile("assets/sample/icici-savings-sample-01.csv", "utf8"),
      ownerUserId: "closed-month-import-user"
    })
  ).rejects.toThrow("Month is closed. Reopen before making changes.");
});

test("persists extracted statement metadata on the authenticated owner's account", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const dashboard = await runIciciCsvImport(db, {
    accountDisplayName: "Metadata Extraction Owner",
    filename: "icici-savings-sample-01.csv",
    rawCsv,
    ownerUserId: "metadata-user"
  } as any);
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, dashboard.importBatch?.accountId ?? ""));

  expect(account).toMatchObject({
    ownerUserId: "metadata-user",
    statementHolderName: "NAVNEET KUMAR VISHWAKARMA",
    institutionName: "ICICI Bank",
    linkedAccountRef: "XXXXXXXX1047"
  });
});

test("prepares first import for account metadata confirmation before persisting account transactions", async () => {
  const ownerUserId = "account-confirmation-owner";
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");

  const prepared = await prepareStatementImport(db, {
    filename: "icici-savings-sample-01.csv",
    ownerUserId,
    rawCsv
  });
  const ownerAccountsBeforeConfirmation = await db
    .select()
    .from(accounts)
    .where(eq(accounts.ownerUserId, ownerUserId));

  expect(prepared).toMatchObject({
    status: "requires_confirmation",
    metadata: {
      accountHolderName: "NAVNEET KUMAR VISHWAKARMA",
      accountName: "ICICI-UNK-1047",
      accountRefLast4: "1047",
      accountRefObfuscated: "XXXXXXXX1047",
      accountType: "unknown",
      providerName: "ICICI Bank",
      providerType: "bank"
    }
  });
  expect(ownerAccountsBeforeConfirmation).toHaveLength(0);

  const dashboard = await confirmPendingStatementImport(db, {
    ownerUserId,
    pendingImportId: prepared.pendingImportId,
    metadata: {
      ...prepared.metadata,
      accountType: "savings",
      accountName: "ICICI-SAV-1047"
    }
  });
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, dashboard.importBatch?.accountId ?? ""));

  expect(account).toMatchObject({
    ownerUserId,
    displayName: "ICICI-SAV-1047",
    providerLabel: "ICICI Bank",
    accountType: "savings",
    statementHolderName: "NAVNEET KUMAR VISHWAKARMA",
    institutionName: "ICICI Bank",
    linkedAccountRef: "XXXXXXXX1047"
  });
  expect(dashboard.importBatch).toMatchObject({
    accountId: account.id,
    sourceProfileId: "icici-bank-csv",
    filename: "icici-savings-sample-01.csv"
  });
  expect(dashboard.transactions).toHaveLength(62);
});

test("imports directly when statement metadata matches an existing confirmed account identity", async () => {
  const ownerUserId = "confirmed-account-match-owner";
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const account = await createAccount(db, {
    ownerUserId,
    displayName: "Custom savings name",
    providerLabel: "ICICI Bank Ltd",
    providerType: "bank",
    providerAbbreviation: "ICICI",
    currency: "INR",
    accountType: "savings",
    statementHolderName: "NAVNEET KUMAR VISHWAKARMA",
    institutionName: "ICICI Bank",
    linkedAccountRef: "XXXXXXXX1047",
    accountRefLast4: "1047",
    displayNameSource: "user",
    metadataConfidence: "extracted",
    metadataWarnings: []
  });

  const prepared = await prepareStatementImport(db, {
    filename: "later-icici-savings.csv",
    ownerUserId,
    rawCsv
  });
  const ownerAccounts = await getAccountManagementRows(db, ownerUserId);

  expect(prepared).toMatchObject({
    status: "imported",
    dashboard: {
      importBatch: {
        accountId: account.id,
        sourceProfileId: "icici-bank-csv",
        filename: "later-icici-savings.csv"
      }
    }
  });
  expect(ownerAccounts).toHaveLength(1);
  expect(ownerAccounts[0]).toMatchObject({
    id: account.id,
    displayName: "Custom savings name"
  });
});

test("confirmation rechecks month-close state before inserting pending import transactions", async () => {
  const ownerUserId = "pending-confirmation-closed-month-owner";
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");
  const prepared = await prepareStatementImport(db, {
    filename: "closed-after-prepare.csv",
    ownerUserId,
    rawCsv
  });

  expect(prepared).toMatchObject({
    status: "requires_confirmation"
  });

  await closeMonth(db, {
    month: "2026-05",
    ownerUserId,
    note: "Closed after pending import was created"
  });

  await expect(
    confirmPendingStatementImport(db, {
      ownerUserId,
      pendingImportId: prepared.pendingImportId,
      metadata: {
        ...prepared.metadata,
        accountType: "savings",
        accountName: "ICICI-SAV-1047"
      }
    })
  ).rejects.toThrow("Month is closed. Reopen before making changes.");

  const persistedTransactions = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.ownerUserId, ownerUserId));

  expect(persistedTransactions).toHaveLength(0);
});

test("reuses a unique confirmed statement template when account reference is missing later", async () => {
  const ownerUserId = "template-match-owner";
  const rawCsv = removeIciciAccountNumber(await readFile("assets/sample/icici-savings-sample-01.csv", "utf8"));
  const firstPrepared = await prepareStatementImport(db, {
    filename: "missing-account-first.csv",
    ownerUserId,
    rawCsv
  });

  expect(firstPrepared).toMatchObject({
    status: "requires_confirmation",
    metadata: {
      accountRefLast4: undefined
    }
  });

  const firstDashboard = await confirmPendingStatementImport(db, {
    ownerUserId,
    pendingImportId: firstPrepared.pendingImportId,
    metadata: {
      ...buildSourceAccountMetadata({
        accountHolderName: "NAVNEET KUMAR VISHWAKARMA",
        accountRef: "046801511047",
        accountType: "savings",
        providerAbbreviation: "ICICI",
        providerName: "ICICI Bank",
        providerType: "bank"
      }),
      accountName: "ICICI-SAV-1047"
    }
  });
  const secondPrepared = await prepareStatementImport(db, {
    filename: "missing-account-second.csv",
    ownerUserId,
    rawCsv
  });

  expect(secondPrepared).toMatchObject({
    status: "imported",
    dashboard: {
      importBatch: {
        accountId: firstDashboard.importBatch?.accountId
      }
    }
  });
});

test("requires confirmation when a missing-reference statement template is ambiguous", async () => {
  const ownerUserId = "template-ambiguous-owner";
  const rawCsv = removeIciciAccountNumber(await readFile("assets/sample/icici-savings-sample-01.csv", "utf8"));
  const prepared = await prepareStatementImport(db, {
    filename: "missing-account-1111.csv",
    ownerUserId,
    rawCsv
  });
  await confirmPendingStatementImport(db, {
    ownerUserId,
    pendingImportId: prepared.pendingImportId,
    metadata: {
      ...buildSourceAccountMetadata({
        accountHolderName: "NAVNEET KUMAR VISHWAKARMA",
        accountRef: "046801511111",
        accountType: "savings",
        providerAbbreviation: "ICICI",
        providerName: "ICICI Bank",
        providerType: "bank"
      }),
      accountName: "ICICI-SAV-1111"
    }
  });
  const secondAccount = await createAccount(db, {
    displayName: "ICICI-SAV-2222",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  await db.insert(accountStatementTemplates).values({
    id: "22222222-2222-4222-8222-222222222222",
    ownerUserId,
    sourceProfileId: "icici-bank-csv",
    accountId: secondAccount.id
  });

  const ambiguousPrepared = await prepareStatementImport(db, {
    filename: "missing-account-ambiguous.csv",
    ownerUserId,
    rawCsv
  });

  expect(ambiguousPrepared).toMatchObject({
    status: "requires_confirmation"
  });
});

test("normalizes pending import metadata when stored JSON omits warnings", async () => {
  const pendingImportId = "33333333-3333-4333-8333-333333333333";
  const ownerUserId = "pending-metadata-normalization-owner";

  await db.insert(pendingStatementImports).values({
    id: pendingImportId,
    ownerUserId,
    sourceProfileId: "icici-bank-csv",
    filename: "legacy-pending.csv",
    rawSource: "legacy raw source",
    extractedMetadata: {
      accountName: "ICICI-UNK-1047",
      accountRefLast4: "1047",
      accountRefObfuscated: "XXXXXXXX1047",
      accountType: "unknown",
      currency: "INR",
      metadataConfidence: "extracted",
      providerAbbreviation: "ICICI",
      providerName: "ICICI Bank",
      providerType: "bank"
    },
    status: "pending"
  });

  const pendingImport = await getPendingStatementImport(db, pendingImportId, ownerUserId);

  expect(pendingImport?.metadata.metadataWarnings).toEqual([]);
});

test("reuses an existing account when the import name differs only by case", async () => {
  const ownerUserId = "case-insensitive-account-owner";
  const existingAccount = await createAccount(db, {
    displayName: "Primary Account",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });

  const dashboard = await runIciciCsvImport(db, {
    accountDisplayName: "primary account",
    filename: "case-insensitive-account.csv",
    rawCsv: await readFile("assets/sample/icici-savings-sample-01.csv", "utf8"),
    ownerUserId
  });
  const ownerAccounts = await getAccountManagementRows(db, ownerUserId);

  expect(dashboard.importBatch?.accountId).toBe(existingAccount.id);
  expect(ownerAccounts).toHaveLength(1);
});

test("renames an owned account and rejects owner mismatches", async () => {
  const account = await createAccount(db, {
    displayName: "Old account name",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId: "account-rename-owner"
  });

  const renamedAccount = await renameAccount(db, {
    accountId: account.id,
    displayName: "Primary savings",
    ownerUserId: "account-rename-owner"
  });

  expect(renamedAccount.displayName).toBe("Primary savings");
  await expect(
    renameAccount(db, {
      accountId: account.id,
      displayName: "Intruder name",
      ownerUserId: "account-rename-other-owner"
    })
  ).rejects.toThrow("Account not found");
});

test("updates editable account metadata for an owned account", async () => {
  const account = await createAccount(db, {
    displayName: "Original account metadata",
    providerLabel: "ICICI Bank",
    providerType: "bank",
    providerAbbreviation: "ICICI",
    currency: "INR",
    accountType: "unknown",
    statementHolderName: "Not captured",
    ownerUserId: "account-metadata-edit-owner"
  });

  const updated = await updateAccountMetadata(db, {
    accountId: account.id,
    ownerUserId: "account-metadata-edit-owner",
    accountName: "ICICI-SAV-1047",
    accountType: "savings",
    providerType: "bank",
    providerName: "ICICI Bank Ltd",
    accountHolderName: "NAVNEET KUMAR VISHWAKARMA"
  });

  expect(updated).toMatchObject({
    id: account.id,
    displayName: "ICICI-SAV-1047",
    accountType: "savings",
    providerType: "bank",
    providerLabel: "ICICI Bank Ltd",
    institutionName: "ICICI Bank Ltd",
    statementHolderName: "NAVNEET KUMAR VISHWAKARMA",
    displayNameSource: "user",
    metadataConfidence: "user_provided"
  });
  await expect(
    updateAccountMetadata(db, {
      accountId: account.id,
      ownerUserId: "other-owner",
      accountName: "Intruder",
      accountType: "current",
      providerType: "bank",
      providerName: "Other",
      accountHolderName: "Other"
    })
  ).rejects.toThrow("Account not found");
});

test("normalizes legacy editable account type values before storing metadata", async () => {
  const account = await createAccount(db, {
    displayName: "Legacy selectable account type",
    providerLabel: "ICICI Bank",
    providerType: "bank",
    providerAbbreviation: "ICICI",
    currency: "INR",
    accountType: "savings",
    ownerUserId: "account-metadata-type-owner"
  });

  const updated = await updateAccountMetadata(db, {
    accountId: account.id,
    ownerUserId: "account-metadata-type-owner",
    accountName: "ICICI account",
    accountType: "bank",
    providerType: "bank",
    providerName: "ICICI Bank",
    accountHolderName: ""
  });

  expect(updated.accountType).toBe("unknown");
});

test("deactivates and reactivates an account while preserving historical month views", async () => {
  const ownerUserId = "account-active-owner";
  const account = await createAccount(db, {
    displayName: "Dormant savings",
    providerLabel: "ICICI Bank",
    currency: "INR",
    ownerUserId
  });
  await createManualTransaction(db, {
    accountId: account.id,
    transactionDate: "2026-04-10",
    description: "Historical expense",
    direction: "outgoing",
    amountMinorUnits: 25000,
    category: "other",
    tags: [],
    ownerUserId
  });

  const deactivatedAccount = await deactivateAccount(db, {
    accountId: account.id,
    ownerUserId
  });
  const inactiveRows = await getAccountManagementRows(db, ownerUserId);
  const historicalDashboards = await getMonthDashboards(db, "2026-04", ownerUserId);

  expect(deactivatedAccount.active).toBe(false);
  expect(inactiveRows.find((row) => row.id === account.id)).toMatchObject({
    active: false,
    transactionCount: 1
  });
  expect(historicalDashboards.flatMap((dashboard) => dashboard.transactions)).toEqual(
    expect.arrayContaining([expect.objectContaining({ description: "Historical expense" })])
  );

  const reactivatedAccount = await reactivateAccount(db, {
    accountId: account.id,
    ownerUserId
  });

  expect(reactivatedAccount.active).toBe(true);
});
});

function removeIciciAccountNumber(rawCsv: string) {
  return rawCsv.replace(
    "046801511047 ( INR )  - NAVNEET KUMAR VISHWAKARMA",
    "NA"
  );
}
