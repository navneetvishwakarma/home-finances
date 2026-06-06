import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  accountType: text("account_type").notNull().default("bank"),
  ownerUserId: text("owner_user_id").notNull().default("legacy-local-user"),
  displayName: text("display_name").notNull(),
  providerLabel: text("provider_label").notNull(),
  providerType: text("provider_type").notNull().default("bank"),
  providerAbbreviation: text("provider_abbreviation"),
  currency: text("currency").notNull(),
  statementHolderName: text("statement_holder_name"),
  institutionName: text("institution_name"),
  linkedAccountRef: text("linked_account_ref"),
  accountRefLast4: text("account_ref_last4"),
  displayNameSource: text("display_name_source").notNull().default("user"),
  metadataConfidence: text("metadata_confidence").notNull().default("defaulted"),
  metadataWarnings: jsonb("metadata_warnings").notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const pendingStatementImports = pgTable("pending_statement_imports", {
  id: uuid("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  sourceProfileId: text("source_profile_id").notNull(),
  filename: text("filename").notNull(),
  rawSource: text("raw_source").notNull(),
  extractedMetadata: jsonb("extracted_metadata").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true })
});

export const accountStatementTemplates = pgTable(
  "account_statement_templates",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    sourceProfileId: text("source_profile_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    accountSourceUnique: unique("account_statement_templates_account_source_unique").on(
      table.ownerUserId,
      table.sourceProfileId,
      table.accountId
    )
  })
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    sourceProfileId: text("source_profile_id").notNull(),
    filename: text("filename").notNull(),
    fileFingerprint: text("file_fingerprint").notNull(),
    rawSource: text("raw_source").notNull(),
    status: text("status").notNull(),
    skippedRowCount: integer("skipped_row_count").notNull().default(0),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    accountFingerprintUnique: unique("import_batches_account_fingerprint_unique").on(
      table.accountId,
      table.fileFingerprint
    )
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    importBatchId: uuid("import_batch_id")
      .references(() => importBatches.id),
    sourceType: text("source_type").notNull().default("imported"),
    sourceRowId: text("source_row_id"),
    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    originalDescription: text("original_description"),
    direction: text("direction").notNull(),
    amountMinorUnits: bigint("amount_minor_units", { mode: "number" }).notNull(),
    runningBalanceMinorUnits: bigint("running_balance_minor_units", { mode: "number" }).notNull(),
    balanceEstimated: boolean("balance_estimated").notNull().default(false),
    category: text("category").notNull().default("uncategorized"),
    categorySource: text("category_source").notNull().default("uncategorized"),
    sourceFingerprint: text("source_fingerprint").notNull(),
    globalRowFingerprint: text("global_row_fingerprint").notNull(),
    rowHash: text("row_hash").notNull(),
    rawSourcePayload: jsonb("raw_source_payload").notNull(),
    tags: jsonb("tags").notNull().default([]),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    accountSourceFingerprintUnique: unique("transactions_account_source_fingerprint_unique").on(
      table.accountId,
      table.sourceFingerprint
    ),
    accountGlobalRowFingerprintUnique: unique("transactions_account_global_row_fingerprint_unique").on(
      table.accountId,
      table.globalRowFingerprint
    ),
    importBatchRowHashUnique: unique("transactions_import_batch_row_hash_unique").on(
      table.importBatchId,
      table.rowHash
    )
  })
);

export const transferMatches = pgTable(
  "transfer_matches",
  {
    id: uuid("id").primaryKey(),
    outgoingTransactionId: uuid("outgoing_transaction_id")
      .notNull()
      .references(() => transactions.id),
    incomingTransactionId: uuid("incoming_transaction_id")
      .notNull()
      .references(() => transactions.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by"),
    dismissed: boolean("dismissed").notNull().default(false),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
  },
  (table) => ({
    transferPairUnique: unique("transfer_matches_pair_unique").on(
      table.outgoingTransactionId,
      table.incomingTransactionId
    )
  })
);

export const statementTallies = pgTable(
  "statement_tallies",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
    totalIncomingMinorUnits: bigint("total_incoming_minor_units", { mode: "number" }).notNull(),
    totalOutgoingMinorUnits: bigint("total_outgoing_minor_units", { mode: "number" }).notNull(),
    netMovementMinorUnits: bigint("net_movement_minor_units", { mode: "number" }).notNull(),
    openingBalanceMinorUnits: bigint("opening_balance_minor_units", { mode: "number" }).notNull(),
    closingBalanceMinorUnits: bigint("closing_balance_minor_units", { mode: "number" }).notNull(),
    calculatedClosingBalanceMinorUnits: bigint("calculated_closing_balance_minor_units", {
      mode: "number"
    }).notNull(),
    differenceMinorUnits: bigint("difference_minor_units", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    importBatchUnique: unique("statement_tallies_import_batch_unique").on(table.importBatchId)
  })
);

export const monthCloses = pgTable(
  "month_closes",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    month: text("month").notNull(),
    status: text("status").notNull().default("closed"),
    note: text("note"),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
    closedBy: text("closed_by").notNull(),
    reopenedAt: timestamp("reopened_at", { withTimezone: true })
  },
  (table) => ({
    ownerMonthUnique: unique("month_closes_owner_month_unique").on(table.ownerUserId, table.month)
  })
);

export const classificationDatasets = pgTable("classification_datasets", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  sourcePath: text("source_path").notNull(),
  checksum: text("checksum").notNull(),
  importedRowCount: integer("imported_row_count").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow()
});

export const classificationExamples = pgTable(
  "classification_examples",
  {
    id: uuid("id").primaryKey(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => classificationDatasets.id),
    originalText: text("original_text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    category: text("category").notNull(),
    sourceRowHash: text("source_row_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    datasetRowUnique: unique("classification_examples_dataset_row_unique").on(
      table.datasetId,
      table.sourceRowHash
    )
  })
);

export const classificationRules = pgTable(
  "classification_rules",
  {
    id: uuid("id").primaryKey(),
    pattern: text("pattern").notNull(),
    category: text("category").notNull(),
    priority: integer("priority").notNull(),
    source: text("source").notNull(),
    supportCount: integer("support_count").notNull().default(1),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    patternSourceUnique: unique("classification_rules_pattern_source_unique").on(
      table.pattern,
      table.source
    )
  })
);

export const classificationMemories = pgTable(
  "classification_memories",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull().default("legacy-local-user"),
    normalizedText: text("normalized_text").notNull(),
    tokenSignature: text("token_signature").notNull(),
    category: text("category").notNull(),
    source: text("source").notNull(),
    priority: integer("priority").notNull(),
    supportCount: integer("support_count").notNull().default(1),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ownerTokenSignatureSourceUnique: unique("classification_memories_owner_token_signature_source_unique").on(
      table.ownerUserId,
      table.tokenSignature,
      table.source
    ),
    normalizedTextIndex: index("classification_memories_normalized_text_idx").on(table.normalizedText)
  })
);
