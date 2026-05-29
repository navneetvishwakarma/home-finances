ALTER TABLE "accounts" ADD COLUMN "owner_user_id" text;
UPDATE "accounts" SET "owner_user_id" = 'legacy-local-user' WHERE "owner_user_id" IS NULL;
ALTER TABLE "accounts" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "owner_user_id" SET DEFAULT 'legacy-local-user';
ALTER TABLE "accounts" ADD COLUMN "statement_holder_name" text;
ALTER TABLE "accounts" ADD COLUMN "institution_name" text;
ALTER TABLE "accounts" ADD COLUMN "linked_account_ref" text;
