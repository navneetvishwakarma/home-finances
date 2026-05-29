import { createHash, randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accounts, importBatches, statementTallies, transactions } from "@/db/schema";
import {
  isTransactionCategory,
  type TransactionCategory
} from "@/modules/classification/categories";
import {
  classifyWithStoredRules,
  learnManualClassificationRule
} from "@/modules/classification/persistence";
import type { CanonicalParsedRow } from "@/modules/source-profiles/icici-bank-csv";

type Db = PostgresJsDatabase<Record<string, unknown>>;

export async function createAccount(
  db: Db,
  input: {
    displayName: string;
    providerLabel: string;
    currency: string;
  }
) {
  const [account] = await db
    .insert(accounts)
    .values({
      id: randomUUID(),
      accountType: "bank",
      displayName: input.displayName,
      providerLabel: input.providerLabel,
      currency: input.currency,
      active: true
    })
    .returning();

  return account;
}

export async function createImportBatch(
  db: Db,
  input: {
    accountId: string;
    sourceProfileId: string;
    filename: string;
    fileFingerprint: string;
    rawSource: string;
    status: string;
  }
) {
  const [importBatch] = await db
    .insert(importBatches)
    .values({
      id: randomUUID(),
      accountId: input.accountId,
      sourceProfileId: input.sourceProfileId,
      filename: input.filename,
      fileFingerprint: input.fileFingerprint,
      rawSource: input.rawSource,
      status: input.status
    })
    .returning();

  return importBatch;
}

export async function uploadIciciCsvForAccount(
  db: Db,
  input: {
    accountId: string;
    filename: string;
    rawCsv: string;
    sourceProfileId?: string;
  }
) {
  const fileFingerprint = `sha256:${createHash("sha256").update(input.rawCsv).digest("hex")}`;

  try {
    return await createImportBatch(db, {
      accountId: input.accountId,
      sourceProfileId: input.sourceProfileId ?? "icici-bank-csv",
      filename: input.filename,
      fileFingerprint,
      rawSource: input.rawCsv,
      status: "uploaded"
    });
  } catch (error) {
    if (isDuplicateImportBatch(error)) {
      const [existingImportBatch] = await db
        .select()
        .from(importBatches)
        .where(
          sql`${importBatches.accountId} = ${input.accountId} AND ${importBatches.fileFingerprint} = ${fileFingerprint}`
        );

      if (existingImportBatch) {
        return existingImportBatch;
      }
    }

    throw error;
  }
}

function isDuplicateImportBatch(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const errorRecord = error as Record<string, unknown>;
  const message = "message" in errorRecord ? String(errorRecord.message) : "";
  const constraintName =
    "constraint_name" in errorRecord
      ? String(errorRecord.constraint_name)
      : "constraint" in errorRecord
        ? String(errorRecord.constraint)
        : "";

  if (
    errorRecord.code === "23505" &&
    (constraintName === "import_batches_account_fingerprint_unique" ||
      message.includes("import_batches_account_fingerprint_unique"))
  ) {
    return true;
  }

  return isDuplicateImportBatch(errorRecord.cause);
}

export async function persistParsedTransactions(
  db: Db,
  input: {
    accountId: string;
    importBatchId: string;
    rows: CanonicalParsedRow[];
  }
) {
  const values = await Promise.all(
    input.rows.map(async (row) => {
      const direction = moneyToMinorUnits(row.depositAmount) > 0 ? "incoming" : "outgoing";
      const amount =
        direction === "incoming"
          ? moneyToMinorUnits(row.depositAmount)
          : moneyToMinorUnits(row.withdrawalAmount);
      const rowHash = `sha256:${createHash("sha256")
        .update(JSON.stringify(row.rawRow))
        .digest("hex")}`;
      const classification = await classifyWithStoredRules(db, row.description);

      return {
        id: randomUUID(),
        accountId: input.accountId,
        importBatchId: input.importBatchId,
        sourceType: "imported",
        sourceRowId: sourceRowId(row.rawRow, rowHash),
        transactionDate: row.transactionDate,
        description: row.description,
        originalDescription: row.description,
        direction,
        amountMinorUnits: amount,
        runningBalanceMinorUnits: moneyToMinorUnits(row.balance),
        category: classification.category,
        categorySource: classification.categorySource,
        rowHash,
        rawSourcePayload: row.rawRow,
        tags: []
      };
    })
  );

  return db
    .insert(transactions)
    .values(values)
    .onConflictDoUpdate({
      target: [transactions.importBatchId, transactions.rowHash],
      set: {
        deletedAt: null,
        transactionDate: sql`excluded.transaction_date`,
        direction: sql`excluded.direction`,
        amountMinorUnits: sql`excluded.amount_minor_units`,
        runningBalanceMinorUnits: sql`excluded.running_balance_minor_units`,
        rawSourcePayload: sql`excluded.raw_source_payload`,
        sourceRowId: sql`excluded.source_row_id`
      }
    })
    .returning();
}

export async function updateTransactionCategory(
  db: Db,
  input: {
    transactionId: string;
    category: TransactionCategory | string;
  }
) {
  if (!isTransactionCategory(input.category)) {
    throw new Error("Invalid transaction category");
  }

  const [transaction] = await db
    .update(transactions)
    .set({
      category: input.category,
      categorySource: "manual"
    })
    .where(eq(transactions.id, input.transactionId))
    .returning();

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  await learnManualClassificationRule(db, {
    description: transaction.description,
    category: input.category
  });

  return transaction;
}

export async function updateTransactionDetails(
  db: Db,
  input: {
    transactionId: string;
    description: string;
    category: TransactionCategory | string;
    tags: string[];
  }
) {
  if (!isTransactionCategory(input.category)) {
    throw new Error("Invalid transaction category");
  }

  const [transaction] = await db
    .update(transactions)
    .set({
      description: input.description,
      category: input.category,
      categorySource: "manual",
      tags: normalizeTags(input.tags)
    })
    .where(eq(transactions.id, input.transactionId))
    .returning();

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  await learnManualClassificationRule(db, {
    description: transaction.description,
    category: input.category
  });

  return transaction;
}

export async function createManualTransaction(
  db: Db,
  input: {
    accountId: string;
    transactionDate: string;
    description: string;
    direction: "incoming" | "outgoing";
    amountMinorUnits: number;
    category: TransactionCategory | string;
    tags: string[];
  }
) {
  if (!isTransactionCategory(input.category)) {
    throw new Error("Invalid transaction category");
  }

  const id = randomUUID();
  const [transaction] = await db
    .insert(transactions)
    .values({
      id,
      accountId: input.accountId,
      importBatchId: null,
      sourceType: "manual",
      sourceRowId: null,
      transactionDate: input.transactionDate,
      description: input.description,
      originalDescription: null,
      direction: input.direction,
      amountMinorUnits: input.amountMinorUnits,
      runningBalanceMinorUnits: 0,
      category: input.category,
      categorySource: "manual",
      rowHash: `manual:${id}`,
      rawSourcePayload: { source: "manual" },
      tags: normalizeTags(input.tags)
    })
    .returning();

  return transaction;
}

export async function deleteTransaction(
  db: Db,
  input: {
    transactionId: string;
  }
) {
  const [transaction] = await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(eq(transactions.id, input.transactionId))
    .returning();

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  return transaction;
}

export async function deleteImportBatch(
  db: Db,
  input: {
    importBatchId: string;
  }
) {
  const [importBatch] = await db
    .update(importBatches)
    .set({ status: "deleted" })
    .where(eq(importBatches.id, input.importBatchId))
    .returning();

  if (!importBatch) {
    throw new Error("Import not found");
  }

  await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(eq(transactions.importBatchId, input.importBatchId));

  return importBatch;
}

function moneyToMinorUnits(value: string) {
  const normalized = value.replaceAll(",", "");
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

export async function computeStatementTally(
  db: Db,
  input: {
    accountId: string;
    importBatchId: string;
  }
) {
  const ledgerRows = await db
    .select()
    .from(transactions)
    .where(
      sql`${transactions.importBatchId} = ${input.importBatchId} AND ${transactions.deletedAt} IS NULL`
    );
  const orderedRows = ledgerRows.sort(
    (left, right) => sourceRowNumber(left.rawSourcePayload) - sourceRowNumber(right.rawSourcePayload)
  );
  const totalIncomingMinorUnits = orderedRows
    .filter((row) => row.direction === "incoming")
    .reduce((total, row) => total + row.amountMinorUnits, 0);
  const totalOutgoingMinorUnits = orderedRows
    .filter((row) => row.direction === "outgoing")
    .reduce((total, row) => total + row.amountMinorUnits, 0);
  const netMovementMinorUnits = totalIncomingMinorUnits - totalOutgoingMinorUnits;
  const firstRow = orderedRows[0];
  const lastRow = orderedRows[orderedRows.length - 1];
  const firstSignedMovement =
    firstRow.direction === "incoming" ? firstRow.amountMinorUnits : -firstRow.amountMinorUnits;
  const openingBalanceMinorUnits = firstRow.runningBalanceMinorUnits - firstSignedMovement;
  const closingBalanceMinorUnits = lastRow.runningBalanceMinorUnits;
  const calculatedClosingBalanceMinorUnits = openingBalanceMinorUnits + netMovementMinorUnits;
  const differenceMinorUnits = closingBalanceMinorUnits - calculatedClosingBalanceMinorUnits;

  const [tally] = await db
    .insert(statementTallies)
    .values({
      id: randomUUID(),
      accountId: input.accountId,
      importBatchId: input.importBatchId,
      totalIncomingMinorUnits,
      totalOutgoingMinorUnits,
      netMovementMinorUnits,
      openingBalanceMinorUnits,
      closingBalanceMinorUnits,
      calculatedClosingBalanceMinorUnits,
      differenceMinorUnits
    })
    .onConflictDoUpdate({
      target: statementTallies.importBatchId,
      set: {
        totalIncomingMinorUnits,
        totalOutgoingMinorUnits,
        netMovementMinorUnits,
        openingBalanceMinorUnits,
        closingBalanceMinorUnits,
        calculatedClosingBalanceMinorUnits,
        differenceMinorUnits
      }
    })
    .returning();

  await db
    .update(importBatches)
    .set({ status: "imported" })
    .where(eq(importBatches.id, input.importBatchId));

  return tally;
}

function sourceRowNumber(rawSourcePayload: unknown) {
  if (
    typeof rawSourcePayload === "object" &&
    rawSourcePayload !== null &&
    "S No." in rawSourcePayload
  ) {
    return Number(rawSourcePayload["S No."]);
  }

  if (
    typeof rawSourcePayload === "object" &&
    rawSourcePayload !== null &&
    "Source Row Number" in rawSourcePayload
  ) {
    return Number(rawSourcePayload["Source Row Number"]);
  }

  return 0;
}

export async function getImportDashboard(db: Db, importBatchId: string) {
  const [importBatch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, importBatchId));
  const [tally] = await db
    .select()
    .from(statementTallies)
    .where(eq(statementTallies.importBatchId, importBatchId));
  const ledgerRows = await db
    .select()
    .from(transactions)
    .where(
      sql`${transactions.importBatchId} = ${importBatchId} AND ${transactions.deletedAt} IS NULL`
    );

  return {
    importBatch,
    tally,
    transactions: ledgerRows.sort(
      (left, right) => sourceRowNumber(left.rawSourcePayload) - sourceRowNumber(right.rawSourcePayload)
    )
  };
}

export async function getLatestImportDashboards(db: Db, limit = 12) {
  const latestImportBatches = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(eq(importBatches.status, "imported"))
    .orderBy(desc(importBatches.importedAt))
    .limit(limit);

  const dashboards = await Promise.all(
    latestImportBatches.map((importBatch) => getImportDashboard(db, importBatch.id))
  );

  return dashboards.filter(isCompleteImportDashboard);
}

export type ImportDashboard = Awaited<ReturnType<typeof getImportDashboard>>;
export type CompleteImportDashboard = ImportDashboard & {
  importBatch: NonNullable<ImportDashboard["importBatch"]>;
  tally: NonNullable<ImportDashboard["tally"]>;
};

export function isCompleteImportDashboard(
  dashboard: ImportDashboard
): dashboard is CompleteImportDashboard {
  return Boolean(dashboard.importBatch && dashboard.importBatch.status === "imported" && dashboard.tally);
}

function sourceRowId(rawRow: Record<string, string>, rowHash: string) {
  const sourceNumber = rawRow["S No."] || rawRow["Sr.No."] || rawRow["Source Row Number"];
  return sourceNumber ? `${sourceNumber}:${rowHash}` : rowHash;
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
}
