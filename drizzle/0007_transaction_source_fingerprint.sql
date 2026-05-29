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
