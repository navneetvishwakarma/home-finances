import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accounts, importBatches, monthCloses, statementTallies, transactions } from "@/db/schema";
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
    ownerUserId?: string;
    displayName: string;
    providerLabel: string;
    currency: string;
    statementHolderName?: string;
    institutionName?: string;
    linkedAccountRef?: string;
  }
) {
  const [account] = await db
    .insert(accounts)
    .values({
      id: randomUUID(),
      accountType: "bank",
      ownerUserId: input.ownerUserId ?? "legacy-local-user",
      displayName: input.displayName,
      providerLabel: input.providerLabel,
      currency: input.currency,
      statementHolderName: input.statementHolderName,
      institutionName: input.institutionName,
      linkedAccountRef: input.linkedAccountRef,
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
    const importBatch = await createImportBatch(db, {
      accountId: input.accountId,
      sourceProfileId: input.sourceProfileId ?? "icici-bank-csv",
      filename: input.filename,
      fileFingerprint,
      rawSource: input.rawCsv,
      status: "uploaded"
    });
    return Object.assign(importBatch, { alreadyImported: false });
  } catch (error) {
    if (isDuplicateImportBatch(error)) {
      const [existingImportBatch] = await db
        .select()
        .from(importBatches)
        .where(
          sql`${importBatches.accountId} = ${input.accountId} AND ${importBatches.fileFingerprint} = ${fileFingerprint}`
        );

      if (existingImportBatch) {
        return Object.assign(existingImportBatch, { alreadyImported: true });
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
        globalRowFingerprint: globalRowFingerprint(input.sourceProfileId, {
          transactionDate: row.transactionDate,
          description: row.description,
          direction,
          amountMinorUnits: amount,
          runningBalanceMinorUnits: moneyToMinorUnits(row.balance)
        }),
        rowHash,
        rawSourcePayload: row.rawRow,
        tags: []
      };
    })
  );
  const persistedTransactions = [];
  let skippedCount = 0;

  for (const value of values) {
    try {
      const [transaction] = await db.insert(transactions).values(value).returning();
      persistedTransactions.push(transaction);
    } catch (error) {
      if (isDuplicateTransactionImportBatchRowHash(error)) {
        const [transaction] = await restoreImportBatchRowHashTransaction(db, value);
        if (transaction) {
          persistedTransactions.push(transaction);
          continue;
        }
      }

      if (isDuplicateTransactionSourceFingerprint(error)) {
        const [transaction] = await restoreSourceFingerprintTransaction(db, value);
        if (transaction) {
          persistedTransactions.push(transaction);
          continue;
        }
      }

      if (isDuplicateTransactionGlobalFingerprint(error)) {
        const transaction = await resolveGlobalFingerprintConflict(db, value);
        if (transaction) {
          persistedTransactions.push(transaction);
        } else {
          skippedCount += 1;
        }
        continue;
      }

      throw error;
    }
  }

  await db
    .update(importBatches)
    .set({ skippedRowCount: skippedCount })
    .where(eq(importBatches.id, input.importBatchId));

  return Object.assign(persistedTransactions, { skippedCount });
}

export async function updateTransactionCategory(
  db: Db,
  input: {
    transactionId: string;
    category: TransactionCategory | string;
    ownerUserId?: string;
  }
) {
  if (!isTransactionCategory(input.category)) {
    throw new Error("Invalid transaction category");
  }

  const [existingTransaction] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.transactionId), accountOwnerCondition(transactions.accountId, input.ownerUserId)))
    .limit(1);

  if (!existingTransaction) {
    throw new Error("Transaction not found");
  }

  if (input.ownerUserId) {
    await assertMonthOpen(db, existingTransaction.transactionDate.slice(0, 7), input.ownerUserId);
  }

  const [transaction] = await db
    .update(transactions)
    .set({
      category: input.category,
      categorySource: "manual"
    })
    .where(and(eq(transactions.id, input.transactionId), accountOwnerCondition(transactions.accountId, input.ownerUserId)))
    .returning();

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
    ownerUserId?: string;
  }
) {
  if (!isTransactionCategory(input.category)) {
    throw new Error("Invalid transaction category");
  }

  const [existingTransaction] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.transactionId), accountOwnerCondition(transactions.accountId, input.ownerUserId)))
    .limit(1);

  if (!existingTransaction) {
    throw new Error("Transaction not found");
  }

  if (input.ownerUserId) {
    await assertMonthOpen(db, existingTransaction.transactionDate.slice(0, 7), input.ownerUserId);
  }

  const [transaction] = await db
    .update(transactions)
    .set({
      description: input.description,
      category: input.category,
      categorySource: "manual",
      tags: normalizeTags(input.tags)
    })
    .where(and(eq(transactions.id, input.transactionId), accountOwnerCondition(transactions.accountId, input.ownerUserId)))
    .returning();

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
    runningBalanceMinorUnits?: number;
    category: TransactionCategory | string;
    tags: string[];
    ownerUserId?: string;
  }
) {
  if (!isTransactionCategory(input.category)) {
    throw new Error("Invalid transaction category");
  }

  const id = randomUUID();
  if (input.ownerUserId) {
    await requireOwnedAccount(db, input.accountId, input.ownerUserId);
    await assertMonthOpen(db, input.transactionDate.slice(0, 7), input.ownerUserId);
  }
  const balance = await resolveManualRunningBalance(db, input);

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
      runningBalanceMinorUnits: balance.runningBalanceMinorUnits,
      balanceEstimated: balance.estimated,
      category: input.category,
      categorySource: "manual",
      sourceFingerprint: `manual:${id}`,
      globalRowFingerprint: `manual:${id}`,
      rowHash: `manual:${id}`,
      rawSourcePayload: { source: "manual" },
      tags: normalizeTags(input.tags)
    })
    .returning();

  return transaction;
}

export async function backfillManualTransactionRunningBalances(db: Db) {
  const manualTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.sourceType, "manual"),
        sql`${transactions.deletedAt} IS NULL`,
        sql`${transactions.runningBalanceMinorUnits} = 0`,
        sql`${transactions.balanceEstimated} = false`
      )
    )
    .orderBy(asc(transactions.transactionDate), asc(transactions.createdAt));
  let updatedCount = 0;

  for (const transaction of manualTransactions) {
    const balance = await resolveManualRunningBalance(db, {
      accountId: transaction.accountId,
      transactionDate: transaction.transactionDate,
      direction: transaction.direction === "incoming" ? "incoming" : "outgoing",
      amountMinorUnits: transaction.amountMinorUnits
    });

    await db
      .update(transactions)
      .set({
        runningBalanceMinorUnits: balance.runningBalanceMinorUnits,
        balanceEstimated: true
      })
      .where(eq(transactions.id, transaction.id));
    updatedCount += 1;
  }

  return { updatedCount };
}

async function resolveManualRunningBalance(
  db: Db,
  input: {
    accountId: string;
    transactionDate: string;
    direction: "incoming" | "outgoing";
    amountMinorUnits: number;
    runningBalanceMinorUnits?: number;
  }
) {
  if (typeof input.runningBalanceMinorUnits === "number" && Number.isFinite(input.runningBalanceMinorUnits)) {
    return {
      runningBalanceMinorUnits: input.runningBalanceMinorUnits,
      estimated: false
    };
  }

  const [priorTransaction] = await db
    .select({
      runningBalanceMinorUnits: transactions.runningBalanceMinorUnits
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, input.accountId),
        sql`${transactions.deletedAt} IS NULL`,
        sql`${transactions.runningBalanceMinorUnits} <> 0`,
        sql`${transactions.transactionDate} <= ${input.transactionDate}`
      )
    )
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .limit(1);

  if (!priorTransaction) {
    return {
      runningBalanceMinorUnits: 0,
      estimated: true
    };
  }

  const signedAmount = input.direction === "incoming" ? input.amountMinorUnits : -input.amountMinorUnits;

  return {
    runningBalanceMinorUnits: priorTransaction.runningBalanceMinorUnits + signedAmount,
    estimated: true
  };
}

export async function deleteTransaction(
  db: Db,
  input: {
    transactionId: string;
    ownerUserId?: string;
  }
) {
  const [existingTransaction] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.transactionId), accountOwnerCondition(transactions.accountId, input.ownerUserId)))
    .limit(1);

  if (!existingTransaction) {
    throw new Error("Transaction not found");
  }

  if (input.ownerUserId) {
    await assertMonthOpen(db, existingTransaction.transactionDate.slice(0, 7), input.ownerUserId);
  }

  const [transaction] = await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(and(eq(transactions.id, input.transactionId), accountOwnerCondition(transactions.accountId, input.ownerUserId)))
    .returning();

  return transaction;
}

export async function deleteImportBatch(
  db: Db,
  input: {
    importBatchId: string;
    ownerUserId?: string;
  }
) {
  const [importBatch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, input.importBatchId), accountOwnerCondition(importBatches.accountId, input.ownerUserId)))
    .limit(1);

  if (!importBatch) {
    throw new Error("Import not found");
  }

  if (input.ownerUserId) {
    const batchTransactions = await db
      .select({ transactionDate: transactions.transactionDate })
      .from(transactions)
      .where(
        and(
          eq(transactions.importBatchId, input.importBatchId),
          sql`${transactions.deletedAt} IS NULL`,
          accountOwnerCondition(transactions.accountId, input.ownerUserId)
        )
      );

    await assertMonthsOpen(
      db,
      batchTransactions.map((transaction) => transaction.transactionDate.slice(0, 7)),
      input.ownerUserId
    );
  }

  const [deletedImportBatch] = await db
    .update(importBatches)
    .set({ status: "deleted" })
    .where(and(eq(importBatches.id, input.importBatchId), accountOwnerCondition(importBatches.accountId, input.ownerUserId)))
    .returning();

  await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(and(eq(transactions.importBatchId, input.importBatchId), accountOwnerCondition(transactions.accountId, input.ownerUserId)));

  return deletedImportBatch;
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
  if (!firstRow || !lastRow) {
    const [tally] = await db
      .insert(statementTallies)
      .values({
        id: randomUUID(),
        accountId: input.accountId,
        importBatchId: input.importBatchId,
        totalIncomingMinorUnits: 0,
        totalOutgoingMinorUnits: 0,
        netMovementMinorUnits: 0,
        openingBalanceMinorUnits: 0,
        closingBalanceMinorUnits: 0,
        calculatedClosingBalanceMinorUnits: 0,
        differenceMinorUnits: 0
      })
      .onConflictDoUpdate({
        target: statementTallies.importBatchId,
        set: {
          totalIncomingMinorUnits: 0,
          totalOutgoingMinorUnits: 0,
          netMovementMinorUnits: 0,
          openingBalanceMinorUnits: 0,
          closingBalanceMinorUnits: 0,
          calculatedClosingBalanceMinorUnits: 0,
          differenceMinorUnits: 0
        }
      })
      .returning();

    await db
      .update(importBatches)
      .set({ status: "imported" })
      .where(eq(importBatches.id, input.importBatchId));

    return tally;
  }
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

export async function getImportDashboard(db: Db, importBatchId: string, ownerUserId?: string) {
  const [importBatch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, importBatchId), accountOwnerCondition(importBatches.accountId, ownerUserId)));
  const [tally] = await db
    .select()
    .from(statementTallies)
    .where(
      and(
        eq(statementTallies.importBatchId, importBatchId),
        accountOwnerCondition(statementTallies.accountId, ownerUserId)
      )
    );
  const ledgerRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        sql`${transactions.importBatchId} = ${importBatchId} AND ${transactions.deletedAt} IS NULL`,
        accountOwnerCondition(transactions.accountId, ownerUserId)
      )
    );

  return {
    importBatch,
    tally,
    transactions: ledgerRows.sort(
      (left, right) => sourceRowNumber(left.rawSourcePayload) - sourceRowNumber(right.rawSourcePayload)
    )
  };
}

export async function getLatestImportDashboards(db: Db, limit = 12, ownerUserId?: string) {
  const latestImportBatches = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(and(eq(importBatches.status, "imported"), accountOwnerCondition(importBatches.accountId, ownerUserId)))
    .orderBy(desc(importBatches.importedAt))
    .limit(limit);

  const dashboards = await Promise.all(
    latestImportBatches.map((importBatch) => getImportDashboard(db, importBatch.id, ownerUserId))
  );

  return dashboards.filter(isCompleteImportDashboard);
}

export async function getAvailableLedgerMonths(db: Db, ownerUserId?: string) {
  const ledgerRows = await db
    .select({ transactionDate: transactions.transactionDate })
    .from(transactions)
    .where(and(sql`${transactions.deletedAt} IS NULL`, accountOwnerCondition(transactions.accountId, ownerUserId)));

  return Array.from(new Set(ledgerRows.map((row) => row.transactionDate.slice(0, 7)))).sort(
    (left, right) => right.localeCompare(left)
  );
}

export async function getAccountMetadataSummary(db: Db, ownerUserId?: string) {
  const accountRows = await getAccountManagementRows(db, ownerUserId);
  const profileRows = await db
    .select({ sourceProfileId: importBatches.sourceProfileId })
    .from(importBatches)
    .where(and(sql`${importBatches.status} <> 'deleted'`, accountOwnerCondition(importBatches.accountId, ownerUserId)));

  return {
    accountCount: accountRows.length,
    sourceProfiles: Array.from(new Set(profileRows.map((row) => row.sourceProfileId))).sort(),
    activeAccountNames: accountRows.filter((account) => account.active).map((account) => account.displayName),
    accounts: accountRows
  };
}

export async function getAccountManagementRows(db: Db, ownerUserId?: string) {
  const accountRows = await db
    .select()
    .from(accounts)
    .where(accountOwnerCondition(accounts.id, ownerUserId))
    .orderBy(asc(accounts.displayName), asc(accounts.createdAt));
  const batchRows = await db
    .select({
      accountId: importBatches.accountId,
      sourceProfileId: importBatches.sourceProfileId,
      importedAt: importBatches.importedAt
    })
    .from(importBatches)
    .where(and(sql`${importBatches.status} <> 'deleted'`, accountOwnerCondition(importBatches.accountId, ownerUserId)));
  const transactionCountRows = await db
    .select({
      accountId: transactions.accountId,
      count: sql<number>`count(*)::int`
    })
    .from(transactions)
    .where(and(sql`${transactions.deletedAt} IS NULL`, accountOwnerCondition(transactions.accountId, ownerUserId)))
    .groupBy(transactions.accountId);
  const transactionCounts = new Map(transactionCountRows.map((row) => [row.accountId, row.count]));

  return accountRows.map((account) => {
    const accountBatches = batchRows.filter((batch) => batch.accountId === account.id);
    const lastImportedAt =
      accountBatches
        .map((batch) => batch.importedAt)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    return {
      id: account.id,
      displayName: account.displayName,
      providerLabel: account.providerLabel,
      accountType: account.accountType,
      currency: account.currency,
      statementHolderName: account.statementHolderName,
      sourceProfiles: Array.from(new Set(accountBatches.map((batch) => batch.sourceProfileId))).sort(),
      transactionCount: transactionCounts.get(account.id) ?? 0,
      lastImportedAt,
      active: account.active
    };
  });
}

export async function renameAccount(
  db: Db,
  input: {
    accountId: string;
    displayName: string;
    ownerUserId: string;
  }
) {
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("Account name is required");
  }

  if (displayName.length > 80) {
    throw new Error("Account name must be 80 characters or fewer");
  }

  const [account] = await db
    .update(accounts)
    .set({ displayName })
    .where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, input.ownerUserId)))
    .returning();

  if (!account) {
    throw new Error("Account not found");
  }

  return account;
}

export async function deactivateAccount(
  db: Db,
  input: {
    accountId: string;
    ownerUserId: string;
  }
) {
  return setAccountActive(db, input, false);
}

export async function reactivateAccount(
  db: Db,
  input: {
    accountId: string;
    ownerUserId: string;
  }
) {
  return setAccountActive(db, input, true);
}

async function setAccountActive(
  db: Db,
  input: {
    accountId: string;
    ownerUserId: string;
  },
  active: boolean
) {
  const [account] = await db
    .update(accounts)
    .set({ active })
    .where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, input.ownerUserId)))
    .returning();

  if (!account) {
    throw new Error("Account not found");
  }

  return account;
}

export async function getConsolidatedMonthTally(db: Db, month: string, ownerUserId?: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return {
      month,
      totalIncomingMinorUnits: 0,
      totalOutgoingMinorUnits: 0,
      netMovementMinorUnits: 0,
      instrumentCount: 0,
      manualTransactionCount: 0
    };
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
        sql`${transactions.deletedAt} IS NULL`,
        accountOwnerCondition(transactions.accountId, ownerUserId)
      )
    );
  const totalIncomingMinorUnits = ledgerRows
    .filter((transaction) => transaction.direction === "incoming")
    .reduce((total, transaction) => total + transaction.amountMinorUnits, 0);
  const totalOutgoingMinorUnits = ledgerRows
    .filter((transaction) => transaction.direction === "outgoing")
    .reduce((total, transaction) => total + transaction.amountMinorUnits, 0);

  return {
    month,
    totalIncomingMinorUnits,
    totalOutgoingMinorUnits,
    netMovementMinorUnits: totalIncomingMinorUnits - totalOutgoingMinorUnits,
    instrumentCount: new Set(ledgerRows.map((transaction) => transaction.accountId)).size,
    manualTransactionCount: ledgerRows.filter((transaction) => transaction.sourceType === "manual").length
  };
}

export async function closeMonth(
  db: Db,
  input: {
    month: string;
    ownerUserId: string;
    note?: string;
  }
) {
  const [monthClose] = await db
    .insert(monthCloses)
    .values({
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      month: input.month,
      status: "closed",
      note: input.note,
      closedBy: input.ownerUserId,
      closedAt: new Date(),
      reopenedAt: null
    })
    .onConflictDoUpdate({
      target: [monthCloses.ownerUserId, monthCloses.month],
      set: {
        status: "closed",
        note: input.note,
        closedBy: input.ownerUserId,
        closedAt: new Date(),
        reopenedAt: null
      }
    })
    .returning();

  return monthClose;
}

export async function reopenMonth(
  db: Db,
  input: {
    month: string;
    ownerUserId: string;
  }
) {
  const [monthClose] = await db
    .update(monthCloses)
    .set({
      status: "reopened",
      reopenedAt: new Date()
    })
    .where(and(eq(monthCloses.ownerUserId, input.ownerUserId), eq(monthCloses.month, input.month)))
    .returning();

  if (monthClose) {
    return monthClose;
  }

  const [createdMonthClose] = await db
    .insert(monthCloses)
    .values({
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      month: input.month,
      status: "reopened",
      closedBy: input.ownerUserId,
      reopenedAt: new Date()
    })
    .returning();

  return createdMonthClose;
}

export async function getMonthCloseStatus(db: Db, month: string, ownerUserId: string) {
  const [monthClose] = await db
    .select()
    .from(monthCloses)
    .where(and(eq(monthCloses.ownerUserId, ownerUserId), eq(monthCloses.month, month)))
    .limit(1);

  if (!monthClose || monthClose.status === "reopened") {
    return {
      month,
      status: "open" as const,
      note: monthClose?.note ?? null
    };
  }

  return {
    month,
    status: "closed" as const,
    note: monthClose.note
  };
}

async function assertMonthOpen(db: Db, month: string, ownerUserId: string) {
  const status = await getMonthCloseStatus(db, month, ownerUserId);

  if (status.status === "closed") {
    throw new Error("Month is closed. Reopen before making changes.");
  }
}

export async function assertMonthsOpen(db: Db, months: Iterable<string>, ownerUserId: string) {
  for (const month of Array.from(new Set(months))) {
    await assertMonthOpen(db, month, ownerUserId);
  }
}

export async function getMonthDashboards(db: Db, month: string, ownerUserId?: string) {
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
        sql`${transactions.deletedAt} IS NULL`,
        accountOwnerCondition(transactions.accountId, ownerUserId)
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

function globalRowFingerprint(
  sourceProfileId = "unknown-source-profile",
  input: {
    transactionDate: string;
    description: string;
    direction: string;
    amountMinorUnits: number;
    runningBalanceMinorUnits: number;
  }
) {
  return [
    sourceProfileId,
    input.transactionDate,
    normalizeFingerprintText(input.description),
    input.direction,
    String(input.amountMinorUnits),
    String(input.runningBalanceMinorUnits)
  ].join("|");
}

function normalizeFingerprintText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isDuplicateTransactionSourceFingerprint(error: unknown) {
  return isDuplicateConstraint(error, "transactions_account_source_fingerprint_unique");
}

function isDuplicateTransactionGlobalFingerprint(error: unknown) {
  return isDuplicateConstraint(error, "transactions_account_global_row_fingerprint_unique");
}

function isDuplicateTransactionImportBatchRowHash(error: unknown) {
  return isDuplicateConstraint(error, "transactions_import_batch_row_hash_unique");
}

function isDuplicateConstraint(error: unknown, constraint: string): boolean {
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

  if (errorRecord.code === "23505" && (constraintName === constraint || message.includes(constraint))) {
    return true;
  }

  return isDuplicateConstraint(errorRecord.cause, constraint);
}

async function restoreSourceFingerprintTransaction(
  db: Db,
  value: typeof transactions.$inferInsert
) {
  return db
    .update(transactions)
    .set({
      deletedAt: null,
      transactionDate: value.transactionDate,
      direction: value.direction,
      amountMinorUnits: value.amountMinorUnits,
      runningBalanceMinorUnits: value.runningBalanceMinorUnits,
      globalRowFingerprint: value.globalRowFingerprint,
      rawSourcePayload: value.rawSourcePayload,
      sourceRowId: value.sourceRowId
    })
    .where(
      and(
        eq(transactions.accountId, value.accountId),
        eq(transactions.sourceFingerprint, value.sourceFingerprint)
      )
    )
    .returning();
}

async function restoreImportBatchRowHashTransaction(
  db: Db,
  value: typeof transactions.$inferInsert
) {
  if (!value.importBatchId) {
    return [];
  }

  return db
    .update(transactions)
    .set({
      deletedAt: null,
      transactionDate: value.transactionDate,
      direction: value.direction,
      amountMinorUnits: value.amountMinorUnits,
      runningBalanceMinorUnits: value.runningBalanceMinorUnits,
      sourceFingerprint: value.sourceFingerprint,
      globalRowFingerprint: value.globalRowFingerprint,
      rawSourcePayload: value.rawSourcePayload,
      sourceRowId: value.sourceRowId
    })
    .where(
      and(
        eq(transactions.importBatchId, value.importBatchId),
        eq(transactions.rowHash, value.rowHash)
      )
    )
    .returning();
}

async function resolveGlobalFingerprintConflict(
  db: Db,
  value: typeof transactions.$inferInsert
) {
  const [existingTransaction] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, value.accountId),
        eq(transactions.globalRowFingerprint, value.globalRowFingerprint)
      )
    )
    .limit(1);

  if (!existingTransaction) {
    return null;
  }

  if (existingTransaction.sourceFingerprint === value.sourceFingerprint || existingTransaction.deletedAt) {
    const [restoredTransaction] = await db
      .update(transactions)
      .set({ deletedAt: null })
      .where(eq(transactions.id, existingTransaction.id))
      .returning();
    return restoredTransaction;
  }

  return null;
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
        skippedRowCount: 0,
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

function accountOwnerCondition(accountId: AnyColumn, ownerUserId?: string) {
  if (!ownerUserId) {
    return sql`true`;
  }

  return sql`${accountId} IN (SELECT ${accounts.id} FROM ${accounts} WHERE ${accounts.ownerUserId} = ${ownerUserId})`;
}

async function requireOwnedAccount(db: Db, accountId: string, ownerUserId: string) {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, ownerUserId)))
    .limit(1);

  if (!account) {
    throw new Error("Account not found");
  }
}
