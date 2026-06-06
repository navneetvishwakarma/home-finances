CREATE TABLE IF NOT EXISTS "account_statement_templates" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "source_profile_id" text NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "account_statement_templates_account_source_unique" UNIQUE("owner_user_id", "source_profile_id", "account_id")
);
