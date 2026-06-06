-- Fresh database bootstrap script for FinState.
-- Creates the latest schema directly, including all changes represented by ordered Drizzle migrations.
-- Use this for new databases. Use docs/database/master-migration.sql for ordered migration-history review.

BEGIN;

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_type" text NOT NULL DEFAULT 'bank',
  "owner_user_id" text NOT NULL DEFAULT 'legacy-local-user',
  "display_name" text NOT NULL,
  "provider_label" text NOT NULL,
  "provider_type" text NOT NULL DEFAULT 'bank',
  "provider_abbreviation" text,
  "currency" text NOT NULL,
  "statement_holder_name" text,
  "institution_name" text,
  "linked_account_ref" text,
  "account_ref_last4" text,
  "display_name_source" text NOT NULL DEFAULT 'user',
  "metadata_confidence" text NOT NULL DEFAULT 'defaulted',
  "metadata_warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pending_statement_imports" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "source_profile_id" text NOT NULL,
  "filename" text NOT NULL,
  "raw_source" text NOT NULL,
  "extracted_metadata" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "confirmed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "account_statement_templates" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "source_profile_id" text NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "account_statement_templates_account_source_unique" UNIQUE("owner_user_id", "source_profile_id", "account_id")
);

CREATE TABLE IF NOT EXISTS "app_users" (
  "id" uuid PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text NOT NULL DEFAULT 'user',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "app_users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);

ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "source_profile_id" text NOT NULL,
  "filename" text NOT NULL,
  "file_fingerprint" text NOT NULL,
  "raw_source" text NOT NULL,
  "status" text NOT NULL,
  "skipped_row_count" integer NOT NULL DEFAULT 0,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "import_batches_account_fingerprint_unique" UNIQUE("account_id", "file_fingerprint")
);

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "import_batch_id" uuid REFERENCES "import_batches"("id"),
  "source_type" text NOT NULL DEFAULT 'imported',
  "source_row_id" text,
  "transaction_date" date NOT NULL,
  "description" text NOT NULL,
  "original_description" text,
  "direction" text NOT NULL,
  "amount_minor_units" bigint NOT NULL,
  "running_balance_minor_units" bigint NOT NULL,
  "balance_estimated" boolean NOT NULL DEFAULT false,
  "category" text NOT NULL DEFAULT 'uncategorized',
  "category_source" text NOT NULL DEFAULT 'uncategorized',
  "source_fingerprint" text NOT NULL,
  "global_row_fingerprint" text NOT NULL,
  "row_hash" text NOT NULL,
  "raw_source_payload" jsonb NOT NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "transactions_account_source_fingerprint_unique" UNIQUE("account_id", "source_fingerprint"),
  CONSTRAINT "transactions_account_global_row_fingerprint_unique" UNIQUE("account_id", "global_row_fingerprint"),
  CONSTRAINT "transactions_import_batch_row_hash_unique" UNIQUE("import_batch_id", "row_hash")
);

CREATE TABLE IF NOT EXISTS "transfer_matches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "outgoing_transaction_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "incoming_transaction_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "confirmed_at" timestamp with time zone,
  "confirmed_by" text,
  "dismissed" boolean NOT NULL DEFAULT false,
  "dismissed_at" timestamp with time zone,
  CONSTRAINT "transfer_matches_pair_unique" UNIQUE("outgoing_transaction_id", "incoming_transaction_id")
);

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

CREATE TABLE IF NOT EXISTS "month_closes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "month" text NOT NULL,
  "status" text NOT NULL DEFAULT 'closed',
  "note" text,
  "closed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "closed_by" text NOT NULL,
  "reopened_at" timestamp with time zone,
  CONSTRAINT "month_closes_owner_month_unique" UNIQUE("owner_user_id", "month")
);

CREATE TABLE IF NOT EXISTS "classification_datasets" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "source_path" text NOT NULL,
  "checksum" text NOT NULL,
  "imported_row_count" integer NOT NULL,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS "classification_memories" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL DEFAULT 'legacy-local-user',
  "normalized_text" text NOT NULL,
  "token_signature" text NOT NULL,
  "category" text NOT NULL,
  "source" text NOT NULL,
  "priority" integer NOT NULL,
  "support_count" integer NOT NULL DEFAULT 1,
  "superseded_at" timestamp with time zone,
  "last_matched_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "classification_memories_owner_token_signature_source_unique" UNIQUE("owner_user_id", "token_signature", "source")
);

CREATE INDEX IF NOT EXISTS "classification_memories_normalized_text_idx"
  ON "classification_memories" ("normalized_text");

COMMIT;
