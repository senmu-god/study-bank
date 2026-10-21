-- Removes only the restore RPC. Rows restored through it remain in the database.
drop function if exists public.study_bank_restore_backup(jsonb);
