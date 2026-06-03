-- Master migration script for FinState.
-- Generated from ordered Drizzle migrations in drizzle/.
-- Do not register this file with Drizzle; update it whenever a numbered migration changes or is added.

-- ============================================================================
-- Source: drizzle/0000_initial.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_type" text NOT NULL DEFAULT 'bank',
  "display_name" text NOT NULL,
  "provider_label" text NOT NULL,
  "currency" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "source_profile_id" text NOT NULL,
  "filename" text NOT NULL,
  "file_fingerprint" text NOT NULL,
  "raw_source" text NOT NULL,
  "status" text NOT NULL,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "import_batches_account_fingerprint_unique" UNIQUE("account_id", "file_fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "import_batch_id" uuid NOT NULL REFERENCES "import_batches"("id"),
  "transaction_date" date NOT NULL,
  "description" text NOT NULL,
  "direction" text NOT NULL,
  "amount_minor_units" bigint NOT NULL,
  "running_balance_minor_units" bigint NOT NULL,
  "row_hash" text NOT NULL,
  "raw_source_payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "transactions_import_batch_row_hash_unique" UNIQUE("import_batch_id", "row_hash")
);


-- ============================================================================
-- Source: drizzle/0001_statement_tallies.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS "statement_tallies" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "import_batch_id" uuid NOT NULL REFERENCES "import_batches"("id"),
  "total_incoming_minor_units" bigint NOT NULL,
  "total_outgoing_minor_units" bigint NOT NULL,
  "net_movement_minor_units" bigint NOT NULL,
  "opening_balance_minor_units" bigint NOT NULL,
  "closing_balance_minor_units" bigint NOT NULL,
  "calculated_closing_balance_minor_units" bigint NOT NULL,
  "difference_minor_units" bigint NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "statement_tallies_import_batch_unique" UNIQUE("import_batch_id")
);


-- ============================================================================
-- Source: drizzle/0002_money_columns_bigint.sql
-- ============================================================================

ALTER TABLE "transactions"
  ALTER COLUMN "amount_minor_units" TYPE bigint,
  ALTER COLUMN "running_balance_minor_units" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "statement_tallies"
  ALTER COLUMN "total_incoming_minor_units" TYPE bigint,
  ALTER COLUMN "total_outgoing_minor_units" TYPE bigint,
  ALTER COLUMN "net_movement_minor_units" TYPE bigint,
  ALTER COLUMN "opening_balance_minor_units" TYPE bigint,
  ALTER COLUMN "closing_balance_minor_units" TYPE bigint,
  ALTER COLUMN "calculated_closing_balance_minor_units" TYPE bigint,
  ALTER COLUMN "difference_minor_units" TYPE bigint;


-- ============================================================================
-- Source: drizzle/0003_transaction_categories.sql
-- ============================================================================

ALTER TABLE "transactions"
  ADD COLUMN "category" text NOT NULL DEFAULT 'uncategorized',
  ADD COLUMN "category_source" text NOT NULL DEFAULT 'uncategorized';
--> statement-breakpoint
UPDATE "transactions"
SET
  "category" = CASE
    WHEN upper("description") ~ '\m(IWISH|PPF)\M' THEN 'savings_investments'
    WHEN upper("description") ~ '\mCRED\M|CREDIT[[:space:]]+CARD|CARD[[:space:]]+PAYMENT|CC[[:space:]]+PAYMENT' THEN 'debt_cards'
    WHEN upper("description") ~ '\m(SALARY|PAYROLL|INTEREST)\M' THEN 'income'
    WHEN upper("description") ~ '\m(FEE|FEES|CHARGE|CHARGES|TAX|COMMISSION|GST)\M' THEN 'fees_taxes'
    WHEN upper("description") ~ '\m(NEFT|IMPS|MMT)\M' THEN 'transfers'
    WHEN upper("description") ~ '\mUPI\M' THEN 'other'
    ELSE 'uncategorized'
  END,
  "category_source" = CASE
    WHEN upper("description") ~ '\m(IWISH|PPF)\M' THEN 'rule'
    WHEN upper("description") ~ '\mCRED\M|CREDIT[[:space:]]+CARD|CARD[[:space:]]+PAYMENT|CC[[:space:]]+PAYMENT' THEN 'rule'
    WHEN upper("description") ~ '\m(SALARY|PAYROLL|INTEREST)\M' THEN 'rule'
    WHEN upper("description") ~ '\m(FEE|FEES|CHARGE|CHARGES|TAX|COMMISSION|GST)\M' THEN 'rule'
    WHEN upper("description") ~ '\m(NEFT|IMPS|MMT)\M' THEN 'rule'
    WHEN upper("description") ~ '\mUPI\M' THEN 'rule'
    ELSE 'uncategorized'
  END;


-- ============================================================================
-- Source: drizzle/0004_classification_knowledge.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS "classification_datasets" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "source_path" text NOT NULL,
  "checksum" text NOT NULL,
  "imported_row_count" integer NOT NULL,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classification_examples" (
  "id" uuid PRIMARY KEY NOT NULL,
  "dataset_id" uuid NOT NULL REFERENCES "classification_datasets"("id"),
  "original_text" text NOT NULL,
  "normalized_text" text NOT NULL,
  "category" text NOT NULL,
  "source_row_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "classification_examples_dataset_row_unique" UNIQUE("dataset_id", "source_row_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classification_rules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "pattern" text NOT NULL,
  "category" text NOT NULL,
  "priority" integer NOT NULL,
  "source" text NOT NULL,
  "support_count" integer NOT NULL DEFAULT 1,
  "last_matched_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "classification_rules_pattern_source_unique" UNIQUE("pattern", "source")
);
--> statement-breakpoint
UPDATE "transactions"
SET "category_source" = 'system_rule'
WHERE "category_source" = 'rule';


-- ============================================================================
-- Source: drizzle/0005_statement_specific_classification_backfill.sql
-- ============================================================================

UPDATE "transactions"
SET
  "category" = CASE
    WHEN upper("description") ~ '\m(ZERODHA|INDIAN[[:space:]]+CLEARING[[:space:]]+CORP(ORATION)?|BROKING)\M' OR upper("description") LIKE '%SIPG%' THEN 'savings_investments'
    WHEN upper("description") ~ '\mEMI\M|HOME[[:space:]]+LOAN|CAR[[:space:]]+LOAN|BIKE[[:space:]]+LOAN|PERSONAL[[:space:]]+LOAN' THEN 'emis'
    WHEN upper("description") ~ '\m(INTDIV|DIVIDEND)\M' THEN 'income'
    ELSE "category"
  END,
  "category_source" = CASE
    WHEN upper("description") ~ '\m(ZERODHA|INDIAN[[:space:]]+CLEARING[[:space:]]+CORP(ORATION)?|BROKING)\M' OR upper("description") LIKE '%SIPG%' THEN 'system_rule'
    WHEN upper("description") ~ '\mEMI\M|HOME[[:space:]]+LOAN|CAR[[:space:]]+LOAN|BIKE[[:space:]]+LOAN|PERSONAL[[:space:]]+LOAN' THEN 'system_rule'
    WHEN upper("description") ~ '\m(INTDIV|DIVIDEND)\M' THEN 'system_rule'
    ELSE "category_source"
  END
WHERE "category_source" <> 'manual';


-- ============================================================================
-- Source: drizzle/0006_transaction_management.sql
-- ============================================================================

ALTER TABLE "transactions" ALTER COLUMN "import_batch_id" DROP NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "source_type" text DEFAULT 'imported' NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "source_row_id" text;
ALTER TABLE "transactions" ADD COLUMN "original_description" text;
ALTER TABLE "transactions" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamp with time zone;

UPDATE "transactions"
SET
  "source_type" = 'imported',
  "source_row_id" = "row_hash",
  "original_description" = "description",
  "tags" = '[]'::jsonb
WHERE "source_type" = 'imported';


-- ============================================================================
-- Source: drizzle/0007_transaction_source_fingerprint.sql
-- ============================================================================

ALTER TABLE "transactions" ADD COLUMN "source_fingerprint" text;

WITH transaction_fingerprints AS (
  SELECT
    "transactions"."id",
    CASE
      WHEN "transactions"."source_type" = 'manual' THEN "transactions"."row_hash"
      ELSE COALESCE("import_batches"."source_profile_id", 'unknown-source-profile') || ':' || "transactions"."row_hash"
    END AS "source_fingerprint"
  FROM "transactions"
  LEFT JOIN "import_batches" ON "transactions"."import_batch_id" = "import_batches"."id"
),
ranked_transactions AS (
  SELECT
    "id",
    "source_fingerprint",
    ROW_NUMBER() OVER (
      PARTITION BY "transactions"."account_id", transaction_fingerprints."source_fingerprint"
      ORDER BY "transactions"."created_at", "transactions"."id"
    ) AS duplicate_rank
  FROM transaction_fingerprints
  INNER JOIN "transactions" ON transaction_fingerprints."id" = "transactions"."id"
)
UPDATE "transactions"
SET "source_fingerprint" = CASE
  WHEN ranked_transactions.duplicate_rank = 1 THEN ranked_transactions."source_fingerprint"
  ELSE ranked_transactions."source_fingerprint" || ':' || "transactions"."id"
END
FROM ranked_transactions
WHERE "transactions"."id" = ranked_transactions."id";

ALTER TABLE "transactions" ALTER COLUMN "source_fingerprint" SET NOT NULL;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_source_fingerprint_unique" UNIQUE("account_id","source_fingerprint");


-- ============================================================================
-- Source: drizzle/0008_app_users_sessions.sql
-- ============================================================================

CREATE TABLE "app_users" (
  "id" uuid PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'user' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_users_email_unique" UNIQUE("email")
);

CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);

ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Source: drizzle/0009_account_owner_metadata.sql
-- ============================================================================

ALTER TABLE "accounts" ADD COLUMN "owner_user_id" text;
UPDATE "accounts" SET "owner_user_id" = 'legacy-local-user' WHERE "owner_user_id" IS NULL;
ALTER TABLE "accounts" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "owner_user_id" SET DEFAULT 'legacy-local-user';
ALTER TABLE "accounts" ADD COLUMN "statement_holder_name" text;
ALTER TABLE "accounts" ADD COLUMN "institution_name" text;
ALTER TABLE "accounts" ADD COLUMN "linked_account_ref" text;


-- ============================================================================
-- Source: drizzle/0010_manual_transaction_balance_estimated.sql
-- ============================================================================

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "balance_estimated" boolean NOT NULL DEFAULT false;

WITH manual_balance_backfill AS (
  SELECT
    manual_transaction."id",
    CASE
      WHEN prior_transaction."running_balance_minor_units" IS NULL THEN 0
      WHEN manual_transaction."direction" = 'incoming'
        THEN prior_transaction."running_balance_minor_units" + manual_transaction."amount_minor_units"
      ELSE prior_transaction."running_balance_minor_units" - manual_transaction."amount_minor_units"
    END AS "computed_running_balance_minor_units"
  FROM "transactions" manual_transaction
  LEFT JOIN LATERAL (
    SELECT "running_balance_minor_units"
    FROM "transactions" prior_transaction
    WHERE prior_transaction."account_id" = manual_transaction."account_id"
      AND prior_transaction."deleted_at" IS NULL
      AND prior_transaction."running_balance_minor_units" <> 0
      AND prior_transaction."transaction_date" <= manual_transaction."transaction_date"
      AND prior_transaction."id" <> manual_transaction."id"
    ORDER BY prior_transaction."transaction_date" DESC, prior_transaction."created_at" DESC
    LIMIT 1
  ) prior_transaction ON true
  WHERE manual_transaction."source_type" = 'manual'
    AND manual_transaction."deleted_at" IS NULL
    AND manual_transaction."running_balance_minor_units" = 0
    AND manual_transaction."balance_estimated" = false
)
UPDATE "transactions"
SET
  "running_balance_minor_units" = manual_balance_backfill."computed_running_balance_minor_units",
  "balance_estimated" = true
FROM manual_balance_backfill
WHERE "transactions"."id" = manual_balance_backfill."id";


-- ============================================================================
-- Source: drizzle/0011_global_row_fingerprint.sql
-- ============================================================================

ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "skipped_row_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "global_row_fingerprint" text;

UPDATE "transactions"
SET "global_row_fingerprint" = CASE
  WHEN "transactions"."source_type" = 'manual' THEN "transactions"."source_fingerprint"
  ELSE
    COALESCE("import_batches"."source_profile_id", 'unknown-source-profile') || '|' ||
    "transactions"."transaction_date"::text || '|' ||
    lower(regexp_replace(trim("transactions"."description"), '\s+', ' ', 'g')) || '|' ||
    "transactions"."direction" || '|' ||
    "transactions"."amount_minor_units"::text || '|' ||
    "transactions"."running_balance_minor_units"::text
  END
FROM "import_batches"
WHERE "transactions"."import_batch_id" = "import_batches"."id"
  AND "transactions"."global_row_fingerprint" IS NULL;

UPDATE "transactions"
SET "global_row_fingerprint" = "source_fingerprint"
WHERE "source_type" = 'manual'
  AND "global_row_fingerprint" IS NULL;

WITH ranked_transactions AS (
  SELECT
    "id",
    "global_row_fingerprint",
    ROW_NUMBER() OVER (
      PARTITION BY "account_id", "global_row_fingerprint"
      ORDER BY "created_at", "id"
    ) AS duplicate_rank
  FROM "transactions"
  WHERE "deleted_at" IS NULL
)
UPDATE "transactions"
SET
  "deleted_at" = now(),
  "global_row_fingerprint" = ranked_transactions."global_row_fingerprint" || '|duplicate:' || "transactions"."id"
FROM ranked_transactions
WHERE "transactions"."id" = ranked_transactions."id"
  AND ranked_transactions.duplicate_rank > 1;

ALTER TABLE "transactions" ALTER COLUMN "global_row_fingerprint" SET NOT NULL;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_global_row_fingerprint_unique" UNIQUE("account_id","global_row_fingerprint");


-- ============================================================================
-- Source: drizzle/0012_month_closes.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS "month_closes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "month" text NOT NULL,
  "status" text NOT NULL DEFAULT 'closed',
  "note" text,
  "closed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_by" text NOT NULL,
  "reopened_at" timestamp with time zone,
  CONSTRAINT "month_closes_owner_month_unique" UNIQUE("owner_user_id","month")
);


-- ============================================================================
-- Source: drizzle/0013_transfer_matches.sql
-- ============================================================================

CREATE TABLE "transfer_matches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "outgoing_transaction_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "incoming_transaction_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "confirmed_at" timestamp with time zone,
  "confirmed_by" text,
  "dismissed" boolean DEFAULT false NOT NULL,
  "dismissed_at" timestamp with time zone
);

ALTER TABLE "transfer_matches"
  ADD CONSTRAINT "transfer_matches_pair_unique" UNIQUE ("outgoing_transaction_id", "incoming_transaction_id");


