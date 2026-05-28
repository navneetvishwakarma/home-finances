import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  accountType: text("account_type").notNull().default("bank"),
  displayName: text("display_name").notNull(),
  providerLabel: text("provider_label").notNull(),
  currency: text("currency").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

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
      .notNull()
      .references(() => importBatches.id),
    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    direction: text("direction").notNull(),
    amountMinorUnits: bigint("amount_minor_units", { mode: "number" }).notNull(),
    runningBalanceMinorUnits: bigint("running_balance_minor_units", { mode: "number" }).notNull(),
    category: text("category").notNull().default("uncategorized"),
    categorySource: text("category_source").notNull().default("uncategorized"),
    rowHash: text("row_hash").notNull(),
    rawSourcePayload: jsonb("raw_source_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    importBatchRowHashUnique: unique("transactions_import_batch_row_hash_unique").on(
      table.importBatchId,
      table.rowHash
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
