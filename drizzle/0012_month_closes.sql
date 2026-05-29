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
