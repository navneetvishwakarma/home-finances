-- Dev-only destructive reset. Clears public app tables and leaves the schema ready for first use.
BEGIN;

DO $$
BEGIN
  IF to_regclass('auth.dev_cleanup_login_traces') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE auth.dev_cleanup_login_traces RESTART IDENTITY';
  END IF;
END $$;

TRUNCATE TABLE
  public."transfer_matches",
  public."statement_tallies",
  public."transactions",
  public."import_batches",
  public."pending_statement_imports",
  public."month_closes",
  public."classification_examples",
  public."classification_datasets",
  public."classification_memories",
  public."classification_rules",
  public."user_sessions",
  public."app_users",
  public."account_statement_templates",
  public."accounts"
RESTART IDENTITY;

COMMIT;
