ALTER TABLE "accounts" ADD COLUMN "provider_type" text NOT NULL DEFAULT 'bank';
ALTER TABLE "accounts" ADD COLUMN "provider_abbreviation" text;
ALTER TABLE "accounts" ADD COLUMN "account_ref_last4" text;
ALTER TABLE "accounts" ADD COLUMN "display_name_source" text NOT NULL DEFAULT 'user';
ALTER TABLE "accounts" ADD COLUMN "metadata_confidence" text NOT NULL DEFAULT 'defaulted';
ALTER TABLE "accounts" ADD COLUMN "metadata_warnings" jsonb NOT NULL DEFAULT '[]'::jsonb;
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
