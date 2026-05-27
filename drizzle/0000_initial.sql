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
