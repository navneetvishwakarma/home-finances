CREATE TABLE "transfer_matches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "outgoing_transaction_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "incoming_transaction_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "confirmed_at" timestamp with time zone,
  "confirmed_by" text,
  "dismissed" boolean DEFAULT false NOT NULL,
  "dismissed_at" timestamp with time zone
);

ALTER TABLE "transfer_matches"
  ADD CONSTRAINT "transfer_matches_pair_unique" UNIQUE ("outgoing_transaction_id", "incoming_transaction_id");
