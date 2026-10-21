-- Roll back the one-time legacy backup importer function.
-- Imported rows remain in study-bank and are not deleted by this rollback.
drop function if exists public.kp_import_kgm_backup(jsonb, jsonb);
