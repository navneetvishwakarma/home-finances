-- Dev-only destructive reset for one owner. Replace the SET LOCAL value before running.
BEGIN;

SET LOCAL app.cleanup_owner_user_id = 'replace-with-owner-user-id';

DO $$
DECLARE
  target_owner_user_id text := current_setting('app.cleanup_owner_user_id', true);
BEGIN
  IF target_owner_user_id IS NULL
    OR target_owner_user_id = ''
    OR target_owner_user_id = 'replace-with-owner-user-id'
  THEN
    RAISE EXCEPTION 'Set app.cleanup_owner_user_id before running this script.';
  END IF;

  DELETE FROM public."transfer_matches" transfer_match
  WHERE EXISTS (
    SELECT 1
    FROM public."transactions" transaction
    JOIN public."accounts" account ON account."id" = transaction."account_id"
    WHERE transaction."id" = transfer_match."outgoing_transaction_id"
      AND account."owner_user_id" = target_owner_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public."transactions" transaction
    JOIN public."accounts" account ON account."id" = transaction."account_id"
    WHERE transaction."id" = transfer_match."incoming_transaction_id"
      AND account."owner_user_id" = target_owner_user_id
  );

  DELETE FROM public."statement_tallies" statement_tally
  WHERE EXISTS (
    SELECT 1
    FROM public."accounts" account
    WHERE account."id" = statement_tally."account_id"
      AND account."owner_user_id" = target_owner_user_id
  );

  DELETE FROM public."transactions" transaction
  USING public."accounts" account
  WHERE account."id" = transaction."account_id"
    AND account."owner_user_id" = target_owner_user_id;

  DELETE FROM public."import_batches" import_batch
  USING public."accounts" account
  WHERE account."id" = import_batch."account_id"
    AND account."owner_user_id" = target_owner_user_id;

  DELETE FROM public."pending_statement_imports"
  WHERE "owner_user_id" = target_owner_user_id;

  DELETE FROM public."account_statement_templates"
  WHERE "owner_user_id" = target_owner_user_id;

  DELETE FROM public."month_closes"
  WHERE "owner_user_id" = target_owner_user_id;

  DELETE FROM public."classification_memories"
  WHERE "owner_user_id" = target_owner_user_id;

  DELETE FROM public."accounts"
  WHERE "owner_user_id" = target_owner_user_id;
END $$;

COMMIT;
