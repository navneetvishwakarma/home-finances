ALTER TABLE "transactions" ALTER COLUMN "import_batch_id" DROP NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "source_type" text DEFAULT 'imported' NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "source_row_id" text;
ALTER TABLE "transactions" ADD COLUMN "original_description" text;
ALTER TABLE "transactions" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamp with time zone;

UPDATE "transactions"
SET
  "source_type" = 'imported',
  "source_row_id" = "row_hash",
  "original_description" = "description",
  "tags" = '[]'::jsonb
WHERE "source_type" = 'imported';
