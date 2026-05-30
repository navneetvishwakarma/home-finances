-- Dev-only destructive reset. Preserves public.accounts, public.app_users, public.user_sessions, and Supabase auth schema tables.
BEGIN;

TRUNCATE TABLE
  public."transfer_matches",
  public."statement_tallies",
  public."transactions",
  public."import_batches",
  public."month_closes",
  public."classification_examples",
  public."classification_datasets",
  public."classification_rules"
RESTART IDENTITY;

COMMIT;
