-- Dev-only destructive reset. Clears public app tables and leaves the schema ready for first use.
BEGIN;

TRUNCATE TABLE
  public."transfer_matches",
  public."statement_tallies",
  public."transactions",
  public."import_batches",
  public."month_closes",
  public."classification_examples",
  public."classification_datasets",
  public."classification_rules",
  public."user_sessions",
  public."app_users",
  public."accounts"
RESTART IDENTITY;

COMMIT;
