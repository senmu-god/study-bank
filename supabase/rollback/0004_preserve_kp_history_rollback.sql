-- Roll back 20261021123821_preserve_kp_history.sql.
-- This restores the original cascade behavior and can delete attached history.
-- Run only when that behavior is explicitly desired.

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('kp_evidence', 'kp_evidence_kp_id_fkey'),
      ('kp_records', 'kp_records_kp_id_fkey'),
      ('kp_diagnoses', 'kp_diagnoses_kp_id_fkey'),
      ('teaching_sessions', 'teaching_sessions_kp_id_fkey'),
      ('kp_tests', 'kp_tests_kp_id_fkey'),
      ('kp_tasks', 'kp_tasks_kp_id_fkey'),
      ('kp_moves', 'kp_moves_kp_id_fkey'),
      ('ai_suggestions', 'ai_suggestions_kp_id_fkey'),
      ('kp_notes', 'kp_notes_kp_id_fkey'),
      ('ai_question_drafts', 'ai_question_drafts_kp_id_fkey')
    ) as refs(table_name, constraint_name)
  loop
    execute format('alter table public.%I drop constraint if exists %I', item.table_name, item.constraint_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (kp_id) references public.knowledge_points(id) on delete cascade',
      item.table_name,
      item.constraint_name
    );
  end loop;
end;
$$;
