ALTER TABLE "transactions"
  ALTER COLUMN "amount_minor_units" TYPE bigint,
  ALTER COLUMN "running_balance_minor_units" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "statement_tallies"
  ALTER COLUMN "total_incoming_minor_units" TYPE bigint,
  ALTER COLUMN "total_outgoing_minor_units" TYPE bigint,
  ALTER COLUMN "net_movement_minor_units" TYPE bigint,
  ALTER COLUMN "opening_balance_minor_units" TYPE bigint,
  ALTER COLUMN "closing_balance_minor_units" TYPE bigint,
  ALTER COLUMN "calculated_closing_balance_minor_units" TYPE bigint,
  ALTER COLUMN "difference_minor_units" TYPE bigint;
