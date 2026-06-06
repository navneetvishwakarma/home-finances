CREATE TABLE IF NOT EXISTS "classification_memories" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL DEFAULT 'legacy-local-user',
  "normalized_text" text NOT NULL,
  "token_signature" text NOT NULL,
  "category" text NOT NULL,
  "source" text NOT NULL,
  "priority" integer NOT NULL,
  "support_count" integer NOT NULL DEFAULT 1,
  "superseded_at" timestamp with time zone,
  "last_matched_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "classification_memories_owner_token_signature_source_unique" UNIQUE("owner_user_id", "token_signature", "source")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classification_memories_normalized_text_idx"
  ON "classification_memories" ("normalized_text");
