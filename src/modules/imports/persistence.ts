import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
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
    sourceProfileId?: string;
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
        sourceFingerprint: sourceFingerprint(input.sourceProfileId, rowHash),
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
      target: [transactions.accountId, transactions.sourceFingerprint],
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
      sourceFingerprint: `manual:${id}`,
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

export async function getAvailableLedgerMonths(db: Db) {
  const ledgerRows = await db
    .select({ transactionDate: transactions.transactionDate })
    .from(transactions)
    .where(sql`${transactions.deletedAt} IS NULL`);

  return Array.from(new Set(ledgerRows.map((row) => row.transactionDate.slice(0, 7)))).sort(
    (left, right) => right.localeCompare(left)
  );
}

export async function getAccountMetadataSummary(db: Db) {
  const [accountCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accounts);
  const profileRows = await db
    .select({ sourceProfileId: importBatches.sourceProfileId })
    .from(importBatches)
    .where(sql`${importBatches.status} <> 'deleted'`);

  return {
    accountCount: accountCountRow?.count ?? 0,
    sourceProfiles: Array.from(new Set(profileRows.map((row) => row.sourceProfileId))).sort()
  };
}

export async function getMonthDashboards(db: Db, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return [];
  }

  const startDate = `${month}-01`;
  const endDate = nextMonthStart(month);
  const ledgerRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        gte(transactions.transactionDate, startDate),
        lt(transactions.transactionDate, endDate),
        sql`${transactions.deletedAt} IS NULL`
      )
    );
  const importBatchIds = Array.from(
    new Set(
      ledgerRows
        .map((transaction) => transaction.importBatchId)
        .filter((importBatchId): importBatchId is string => Boolean(importBatchId))
    )
  );

  if (importBatchIds.length === 0) {
    return buildManualMonthDashboards(ledgerRows, month);
  }

  const importedDashboards = await Promise.all(
    importBatchIds.map(async (importBatchId) => {
      const [importBatch] = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, importBatchId));
      if (!importBatch || importBatch.status === "deleted") {
        return null;
      }
      const batchTransactions = ledgerRows
        .filter((transaction) => transaction.importBatchId === importBatchId)
        .sort(
          (left, right) =>
            left.transactionDate.localeCompare(right.transactionDate) ||
            sourceRowNumber(left.rawSourcePayload) - sourceRowNumber(right.rawSourcePayload)
        );

      return {
        importBatch: { ...importBatch, status: "imported" },
        tally: buildMonthTally(batchTransactions, importBatch.accountId),
        transactions: batchTransactions
      };
    })
  );

  return [
    ...importedDashboards.filter((dashboard) => dashboard !== null),
    ...buildManualMonthDashboards(ledgerRows, month)
  ];
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

function sourceFingerprint(sourceProfileId = "unknown-source-profile", rowHash: string) {
  return `${sourceProfileId}:${rowHash}`;
}

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function buildMonthTally(
  ledgerRows: Awaited<ReturnType<typeof getImportDashboard>>["transactions"],
  accountId: string
) {
  const orderedRows = ledgerRows.sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) ||
      sourceRowNumber(left.rawSourcePayload) - sourceRowNumber(right.rawSourcePayload)
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
  const firstSignedMovement = firstRow
    ? firstRow.direction === "incoming"
      ? firstRow.amountMinorUnits
      : -firstRow.amountMinorUnits
    : 0;
  const openingBalanceMinorUnits = firstRow
    ? firstRow.runningBalanceMinorUnits - firstSignedMovement
    : 0;
  const closingBalanceMinorUnits = lastRow?.runningBalanceMinorUnits ?? openingBalanceMinorUnits;
  const calculatedClosingBalanceMinorUnits = openingBalanceMinorUnits + netMovementMinorUnits;

  return {
    id: `month-tally:${accountId}:${orderedRows[0]?.importBatchId ?? "none"}`,
    accountId,
    importBatchId: orderedRows[0]?.importBatchId ?? "",
    totalIncomingMinorUnits,
    totalOutgoingMinorUnits,
    netMovementMinorUnits,
    openingBalanceMinorUnits,
    closingBalanceMinorUnits,
    calculatedClosingBalanceMinorUnits,
    differenceMinorUnits: closingBalanceMinorUnits - calculatedClosingBalanceMinorUnits,
    createdAt: new Date()
  };
}

function buildManualMonthDashboards(
  ledgerRows: Awaited<ReturnType<typeof getImportDashboard>>["transactions"],
  month: string
) {
  const manualRowsByAccount = new Map<string, typeof ledgerRows>();

  for (const transaction of ledgerRows) {
    if (transaction.importBatchId !== null || transaction.sourceType !== "manual") {
      continue;
    }

    manualRowsByAccount.set(transaction.accountId, [
      ...(manualRowsByAccount.get(transaction.accountId) ?? []),
      transaction
    ]);
  }

  return [...manualRowsByAccount.entries()].map(([accountId, accountRows]) => {
    const syntheticImportBatchId = `manual:${accountId}:${month}`;

    return {
      importBatch: {
        id: syntheticImportBatchId,
        accountId,
        sourceProfileId: "manual-transactions",
        filename: "Manual transactions",
        fileFingerprint: syntheticImportBatchId,
        rawSource: "manual",
        status: "imported",
        importedAt: new Date()
      },
      tally: {
        ...buildMonthTally(accountRows, accountId),
        id: `month-tally:${syntheticImportBatchId}`,
        importBatchId: syntheticImportBatchId
      },
      transactions: accountRows.sort((left, right) =>
        left.transactionDate.localeCompare(right.transactionDate)
      )
    };
  });
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
}
