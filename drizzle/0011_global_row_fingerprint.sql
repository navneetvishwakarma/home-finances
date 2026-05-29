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
