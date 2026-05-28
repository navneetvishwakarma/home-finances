import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
  }
) {
  try {
    return await createImportBatch(db, {
      accountId: input.accountId,
      sourceProfileId: "icici-bank-csv",
      filename: input.filename,
      fileFingerprint: `sha256:${createHash("sha256").update(input.rawCsv).digest("hex")}`,
      rawSource: input.rawCsv,
      status: "uploaded"
    });
  } catch (error) {
    if (isDuplicateImportBatch(error)) {
      throw new Error("CSV file already uploaded for this account");
    }

    throw error;
  }
}

function isDuplicateImportBatch(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint_name" in error &&
    error.constraint_name === "import_batches_account_fingerprint_unique"
  );
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
      const classification = await classifyWithStoredRules(db, row.description);

      return {
        id: randomUUID(),
        accountId: input.accountId,
        importBatchId: input.importBatchId,
        transactionDate: row.transactionDate,
        description: row.description,
        direction,
        amountMinorUnits: amount,
        runningBalanceMinorUnits: moneyToMinorUnits(row.balance),
        category: classification.category,
        categorySource: classification.categorySource,
        rowHash: `sha256:${createHash("sha256")
          .update(JSON.stringify(row.rawRow))
          .digest("hex")}`,
        rawSourcePayload: row.rawRow
      };
    })
  );

  return db
    .insert(transactions)
    .values(values)
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
    .where(eq(transactions.importBatchId, input.importBatchId));
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
    .returning();

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
    .where(eq(transactions.importBatchId, importBatchId));

  return {
    importBatch,
    tally,
    transactions: ledgerRows.sort(
      (left, right) => sourceRowNumber(left.rawSourcePayload) - sourceRowNumber(right.rawSourcePayload)
    )
  };
}
