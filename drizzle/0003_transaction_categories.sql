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
