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
