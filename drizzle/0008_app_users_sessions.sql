CREATE TABLE "app_users" (
  "id" uuid PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'user' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_users_email_unique" UNIQUE("email")
);

CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);

ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
