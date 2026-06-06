import { and, eq, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accounts, accountStatementTemplates, pendingStatementImports } from "@/db/schema";
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
import type { SourceAccountMetadata } from "@/modules/source-profiles/account-metadata";

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
  const alreadyImported = importBatch.alreadyImported;
  let aiClassificationFallback = false;

  if (!alreadyImported) {
    const persistedTransactions = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      sourceProfileId: parsed.profileId,
      rows: parsed.rows
    });
    aiClassificationFallback = persistedTransactions.aiClassificationFallback;
    await computeStatementTally(db, {
      accountId: account.id,
      importBatchId: importBatch.id
    });
  }

  return Object.assign(await getImportDashboard(db, importBatch.id, input.ownerUserId), {
    aiClassificationFallback,
    alreadyImported
  });
}

export async function prepareStatementImport(
  db: Db,
  input: {
    ownerUserId: string;
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

  if (!parsed.metadata) {
    throw new Error("Account metadata could not be extracted from this statement.");
  }

  const existingAccount = await findConfirmedAccount(db, {
    ownerUserId: input.ownerUserId,
    metadata: parsed.metadata
  });

  if (existingAccount) {
    const dashboard = await persistStatementForAccount(db, {
      accountId: existingAccount.id,
      filename: input.filename,
      ownerUserId: input.ownerUserId,
      parsed,
      rawCsv: input.rawCsv
    });

    return {
      status: "imported" as const,
      dashboard
    };
  }

  const templateAccount = parsed.metadata.accountRefLast4
    ? null
    : await findUniqueTemplateAccount(db, {
        ownerUserId: input.ownerUserId,
        sourceProfileId: parsed.profileId
      });

  if (templateAccount) {
    const dashboard = await persistStatementForAccount(db, {
      accountId: templateAccount.id,
      filename: input.filename,
      ownerUserId: input.ownerUserId,
      parsed,
      rawCsv: input.rawCsv
    });

    return {
      status: "imported" as const,
      dashboard
    };
  }

  const [pendingImport] = await db
    .insert(pendingStatementImports)
    .values({
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      sourceProfileId: parsed.profileId,
      filename: input.filename,
      rawSource: input.rawCsv,
      extractedMetadata: parsed.metadata,
      status: "pending"
    })
    .returning();

  return {
    status: "requires_confirmation" as const,
    pendingImportId: pendingImport.id,
    metadata: parsed.metadata
  };
}

export async function confirmPendingStatementImport(
  db: Db,
  input: {
    ownerUserId: string;
    pendingImportId: string;
    metadata: SourceAccountMetadata;
  }
) {
  const [pendingImport] = await db
    .select()
    .from(pendingStatementImports)
    .where(
      and(
        eq(pendingStatementImports.id, input.pendingImportId),
        eq(pendingStatementImports.ownerUserId, input.ownerUserId),
        eq(pendingStatementImports.status, "pending")
      )
    )
    .limit(1);

  if (!pendingImport) {
    throw new Error("Pending import not found");
  }

  const parsed = parseSourceCsv(pendingImport.rawSource);
  await assertMonthsOpen(
    db,
    parsed.rows.map((row) => row.transactionDate.slice(0, 7)),
    input.ownerUserId
  );
  await seedLocalClassificationKnowledge(db);
  const account = await findOrCreateConfirmedAccount(db, {
    ownerUserId: input.ownerUserId,
    metadata: input.metadata
  });
  await saveStatementTemplate(db, {
    accountId: account.id,
    ownerUserId: input.ownerUserId,
    sourceProfileId: pendingImport.sourceProfileId
  });
  const dashboard = await persistStatementForAccount(db, {
    accountId: account.id,
    filename: pendingImport.filename,
    ownerUserId: input.ownerUserId,
    parsed,
    rawCsv: pendingImport.rawSource
  });

  await db
    .update(pendingStatementImports)
    .set({
      status: "confirmed",
      confirmedAt: new Date()
    })
    .where(eq(pendingStatementImports.id, pendingImport.id));

  return dashboard;
}

async function findOrCreateBankAccount(
  db: Db,
  input: {
    displayName: string;
    ownerUserId?: string;
    metadata?: {
      accountHolderName?: string;
      providerName?: string;
      accountRefObfuscated?: string;
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
          institutionName: input.metadata.providerName,
          linkedAccountRef: input.metadata.accountRefObfuscated
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
    providerLabel: input.metadata?.providerName ?? "Imported statement",
    currency: "INR",
    statementHolderName: input.metadata?.accountHolderName,
    institutionName: input.metadata?.providerName,
    linkedAccountRef: input.metadata?.accountRefObfuscated
  });
}

async function findOrCreateConfirmedAccount(
  db: Db,
  input: {
    ownerUserId: string;
    metadata: SourceAccountMetadata;
  }
) {
  const existingAccount = await findConfirmedAccount(db, input);

  if (existingAccount) {
    return existingAccount;
  }

  return createAccount(db, {
    ownerUserId: input.ownerUserId,
    displayName: input.metadata.accountName,
    providerLabel: input.metadata.providerName,
    providerType: input.metadata.providerType,
    providerAbbreviation: input.metadata.providerAbbreviation,
    currency: input.metadata.currency,
    accountType: input.metadata.accountType,
    statementHolderName: input.metadata.accountHolderName,
    institutionName: input.metadata.providerName,
    linkedAccountRef: input.metadata.accountRefObfuscated,
    accountRefLast4: input.metadata.accountRefLast4,
    displayNameSource: "generated",
    metadataConfidence: input.metadata.metadataConfidence,
    metadataWarnings: input.metadata.metadataWarnings
  });
}

async function findConfirmedAccount(
  db: Db,
  input: {
    ownerUserId: string;
    metadata: SourceAccountMetadata;
  }
) {
  if (!input.metadata.accountRefLast4) {
    return null;
  }

  const [existingAccount] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.ownerUserId, input.ownerUserId),
        eq(accounts.accountRefLast4, input.metadata.accountRefLast4),
        providerIdentityCondition(input.metadata)
      )
    )
    .limit(1);

  return existingAccount ?? null;
}

function providerIdentityCondition(metadata: SourceAccountMetadata) {
  if (metadata.providerAbbreviation) {
    return eq(accounts.providerAbbreviation, metadata.providerAbbreviation);
  }

  return or(eq(accounts.institutionName, metadata.providerName), eq(accounts.providerLabel, metadata.providerName));
}

async function persistStatementForAccount(
  db: Db,
  input: {
    accountId: string;
    filename: string;
    ownerUserId: string;
    parsed: ReturnType<typeof parseSourceCsv>;
    rawCsv: string;
  }
) {
  await seedLocalClassificationKnowledge(db);
  const importBatch = await uploadIciciCsvForAccount(db, {
    accountId: input.accountId,
    filename: input.filename,
    rawCsv: input.rawCsv,
    sourceProfileId: input.parsed.profileId
  });
  const alreadyImported = importBatch.alreadyImported;
  let aiClassificationFallback = false;

  if (!alreadyImported) {
    const persistedTransactions = await persistParsedTransactions(db, {
      accountId: input.accountId,
      importBatchId: importBatch.id,
      sourceProfileId: input.parsed.profileId,
      rows: input.parsed.rows
    });
    aiClassificationFallback = persistedTransactions.aiClassificationFallback;
    await computeStatementTally(db, {
      accountId: input.accountId,
      importBatchId: importBatch.id
    });
  }

  return Object.assign(await getImportDashboard(db, importBatch.id, input.ownerUserId), {
    aiClassificationFallback,
    alreadyImported
  });
}

async function findUniqueTemplateAccount(
  db: Db,
  input: {
    ownerUserId: string;
    sourceProfileId: string;
  }
) {
  const templateRows = await db
    .select({
      account: accounts
    })
    .from(accountStatementTemplates)
    .innerJoin(accounts, eq(accountStatementTemplates.accountId, accounts.id))
    .where(
      and(
        eq(accountStatementTemplates.ownerUserId, input.ownerUserId),
        eq(accountStatementTemplates.sourceProfileId, input.sourceProfileId)
      )
    );

  if (templateRows.length !== 1) {
    return null;
  }

  return templateRows[0].account;
}

async function saveStatementTemplate(
  db: Db,
  input: {
    accountId: string;
    ownerUserId: string;
    sourceProfileId: string;
  }
) {
  await db
    .insert(accountStatementTemplates)
    .values({
      id: randomUUID(),
      accountId: input.accountId,
      ownerUserId: input.ownerUserId,
      sourceProfileId: input.sourceProfileId
    })
    .onConflictDoNothing({
      target: [
        accountStatementTemplates.ownerUserId,
        accountStatementTemplates.sourceProfileId,
        accountStatementTemplates.accountId
      ]
    });
}
