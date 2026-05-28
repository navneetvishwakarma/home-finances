import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accounts } from "@/db/schema";
import { seedLocalClassificationKnowledge } from "@/modules/classification/persistence";
import {
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
    accountDisplayName: string;
    filename: string;
    rawCsv: string;
  }
) {
  const account = await findOrCreateBankAccount(db, input.accountDisplayName);
  await seedLocalClassificationKnowledge(db);
  const parsed = parseSourceCsv(input.rawCsv);
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: account.id,
    filename: input.filename,
    rawCsv: input.rawCsv,
    sourceProfileId: parsed.profileId
  });

  await persistParsedTransactions(db, {
    accountId: account.id,
    importBatchId: importBatch.id,
    rows: parsed.rows
  });
  await computeStatementTally(db, {
    accountId: account.id,
    importBatchId: importBatch.id
  });

  return getImportDashboard(db, importBatch.id);
}

async function findOrCreateBankAccount(db: Db, displayName: string) {
  const [existingAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.displayName, displayName))
    .limit(1);

  if (existingAccount) {
    return existingAccount;
  }

  return createAccount(db, {
    displayName,
    providerLabel: "Imported statement",
    currency: "INR"
  });
}
