CREATE TABLE IF NOT EXISTS "classification_datasets" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "source_path" text NOT NULL,
  "checksum" text NOT NULL,
  "imported_row_count" integer NOT NULL,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classification_examples" (
  "id" uuid PRIMARY KEY NOT NULL,
  "dataset_id" uuid NOT NULL REFERENCES "classification_datasets"("id"),
  "original_text" text NOT NULL,
  "normalized_text" text NOT NULL,
  "category" text NOT NULL,
  "source_row_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "classification_examples_dataset_row_unique" UNIQUE("dataset_id", "source_row_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classification_rules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "pattern" text NOT NULL,
  "category" text NOT NULL,
  "priority" integer NOT NULL,
  "source" text NOT NULL,
  "support_count" integer NOT NULL DEFAULT 1,
  "last_matched_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "classification_rules_pattern_source_unique" UNIQUE("pattern", "source")
);
--> statement-breakpoint
UPDATE "transactions"
SET "category_source" = 'system_rule'
WHERE "category_source" = 'rule';
