import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accounts, transactions, transferMatches } from "@/db/schema";

type Db = PostgresJsDatabase<Record<string, unknown>>;

export type TransferCandidate = {
  outgoingTransactionId: string;
  incomingTransactionId: string;
  outgoingAccountName: string;
  incomingAccountName: string;
  outgoingDate: string;
  incomingDate: string;
  amountMinorUnits: number;
  dayDifference: number;
};

export async function detectTransferCandidates(db: Db, month: string, ownerUserId: string, windowDays = 2) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return [];
  }

  const startDate = `${month}-01`;
  const endDate = nextMonthStart(month);
  const ownerTransactions = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      transactionDate: transactions.transactionDate,
      direction: transactions.direction,
      amountMinorUnits: transactions.amountMinorUnits,
      accountName: accounts.displayName
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(accounts.ownerUserId, ownerUserId),
        sql`${transactions.deletedAt} IS NULL`,
        sql`${transactions.transactionDate} >= ${startDate}`,
        sql`${transactions.transactionDate} < ${endDate}`
      )
    );
  const matches = await db.select().from(transferMatches);
  const confirmedTransactionIds = new Set(
    matches
      .filter((match) => match.confirmedAt && !match.dismissed)
      .flatMap((match) => [match.outgoingTransactionId, match.incomingTransactionId])
  );
  const dismissedPairs = new Set(
    matches
      .filter((match) => match.dismissed)
      .map((match) => `${match.outgoingTransactionId}:${match.incomingTransactionId}`)
  );
  const incoming = ownerTransactions.filter(
    (transaction) => transaction.direction === "incoming" && !confirmedTransactionIds.has(transaction.id)
  );
  const candidates: TransferCandidate[] = [];

  for (const outgoing of ownerTransactions.filter(
    (transaction) => transaction.direction === "outgoing" && !confirmedTransactionIds.has(transaction.id)
  )) {
    const bestMatch = incoming
      .filter(
        (incomingTransaction) =>
          outgoing.accountId !== incomingTransaction.accountId &&
          outgoing.amountMinorUnits === incomingTransaction.amountMinorUnits &&
          !dismissedPairs.has(`${outgoing.id}:${incomingTransaction.id}`)
      )
      .map((incomingTransaction) => ({
        incomingTransaction,
        dayDifference: Math.abs(daysBetween(outgoing.transactionDate, incomingTransaction.transactionDate))
      }))
      .filter((candidate) => candidate.dayDifference <= windowDays)
      .sort((left, right) => left.dayDifference - right.dayDifference)[0];

    if (!bestMatch) {
      continue;
    }

    candidates.push({
      outgoingTransactionId: outgoing.id,
      incomingTransactionId: bestMatch.incomingTransaction.id,
      outgoingAccountName: outgoing.accountName,
      incomingAccountName: bestMatch.incomingTransaction.accountName,
      outgoingDate: outgoing.transactionDate,
      incomingDate: bestMatch.incomingTransaction.transactionDate,
      amountMinorUnits: outgoing.amountMinorUnits,
      dayDifference: bestMatch.dayDifference
    });
  }

  return candidates.sort(
    (left, right) => left.dayDifference - right.dayDifference || right.amountMinorUnits - left.amountMinorUnits
  );
}

export async function confirmTransfer(
  db: Db,
  input: {
    outgoingTransactionId: string;
    incomingTransactionId: string;
    ownerUserId: string;
  }
) {
  await requireOwnedTransferPair(db, input);
  const [match] = await db
    .insert(transferMatches)
    .values({
      id: randomUUID(),
      outgoingTransactionId: input.outgoingTransactionId,
      incomingTransactionId: input.incomingTransactionId,
      confirmedAt: new Date(),
      confirmedBy: input.ownerUserId,
      dismissed: false,
      dismissedAt: null
    })
    .onConflictDoUpdate({
      target: [transferMatches.outgoingTransactionId, transferMatches.incomingTransactionId],
      set: {
        confirmedAt: new Date(),
        confirmedBy: input.ownerUserId,
        dismissed: false,
        dismissedAt: null
      }
    })
    .returning();

  return match;
}

export async function dismissTransfer(
  db: Db,
  input: {
    outgoingTransactionId: string;
    incomingTransactionId: string;
    ownerUserId: string;
  }
) {
  await requireOwnedTransferPair(db, input);
  const [match] = await db
    .insert(transferMatches)
    .values({
      id: randomUUID(),
      outgoingTransactionId: input.outgoingTransactionId,
      incomingTransactionId: input.incomingTransactionId,
      dismissed: true,
      dismissedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [transferMatches.outgoingTransactionId, transferMatches.incomingTransactionId],
      set: {
        dismissed: true,
        dismissedAt: new Date()
      }
    })
    .returning();

  return match;
}

async function requireOwnedTransferPair(
  db: Db,
  input: {
    outgoingTransactionId: string;
    incomingTransactionId: string;
    ownerUserId: string;
  }
) {
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(accounts.ownerUserId, input.ownerUserId),
        inArray(transactions.id, [input.outgoingTransactionId, input.incomingTransactionId])
      )
    );

  if (rows.length !== 2) {
    throw new Error("Transfer transactions not found");
  }
}

function daysBetween(left: string, right: string) {
  const milliseconds = new Date(`${left}T00:00:00Z`).getTime() - new Date(`${right}T00:00:00Z`).getTime();
  return Math.round(milliseconds / 86_400_000);
}

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}
