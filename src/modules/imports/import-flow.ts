import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accounts } from "@/db/schema";
import { seedLocalClassificationKnowledge } from "@/modules/classification/persistence";
import {
  assertMonthsOpen,
  computeStatementTally,
  createAccount,
  getImportDashboard,
  persistParsedTransactions,
  uploadIciciCsvForAccount
} from "@/modules/imports/persistence";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

type Db = PostgresJsDatabase<Record<string, unknown>>;

export async function runIciciCsvImport(
  db: Db,
  input: {
    ownerUserId?: string;
    accountDisplayName: string;
    filename: string;
    rawCsv: string;
  }
) {
  const parsed = parseSourceCsv(input.rawCsv);
  if (input.ownerUserId) {
    await assertMonthsOpen(
      db,
      parsed.rows.map((row) => row.transactionDate.slice(0, 7)),
      input.ownerUserId
    );
  }

  await seedLocalClassificationKnowledge(db);
  const account = await findOrCreateBankAccount(db, {
    displayName: input.accountDisplayName,
    ownerUserId: input.ownerUserId,
    metadata: parsed.metadata
  });
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: input.filename,
    rawCsv: input.rawCsv,
    sourceProfileId: parsed.profileId
  });

  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    sourceProfileId: parsed.profileId,
    rows: parsed.rows
  });
  await computeStatementTally(db, {
    accountId: account.id,
    importBatchId: importBatch.id
  });

  return getImportDashboard(db, importBatch.id, input.ownerUserId);
}

async function findOrCreateBankAccount(
  db: Db,
  input: {
    displayName: string;
    ownerUserId?: string;
    metadata?: {
      accountHolderName?: string;
      institutionName?: string;
      linkedAccountRef?: string;
    };
  }
) {
  const [existingAccount] = await db
    .select()
    .from(accounts)
    .where(
      sql`lower(${accounts.displayName}) = ${input.displayName.toLocaleLowerCase()} AND ${accounts.ownerUserId} = ${input.ownerUserId ?? "legacy-local-user"}`
    )
    .limit(1);

  if (existingAccount) {
    if (input.metadata) {
      const [updatedAccount] = await db
        .update(accounts)
        .set({
          statementHolderName: input.metadata.accountHolderName,
          institutionName: input.metadata.institutionName,
          linkedAccountRef: input.metadata.linkedAccountRef
        })
        .where(eq(accounts.id, existingAccount.id))
        .returning();
      return updatedAccount;
    }

    return existingAccount;
  }

  return createAccount(db, {
    ownerUserId: input.ownerUserId,
    displayName: input.displayName,
    providerLabel: input.metadata?.institutionName ?? "Imported statement",
    currency: "INR",
    statementHolderName: input.metadata?.accountHolderName,
    institutionName: input.metadata?.institutionName,
    linkedAccountRef: input.metadata?.linkedAccountRef
  });
}
