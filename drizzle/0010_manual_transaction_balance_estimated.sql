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
