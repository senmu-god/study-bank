-- Transactional, additive restore for full study-bank JSON exports.
-- Existing rows are never overwritten: conflicts are skipped. Any FK or data
-- error aborts the entire RPC transaction.
create or replace function public.study_bank_restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  table_name text;
  rows_json jsonb;
  affected integer;
  total integer := 0;
  counts jsonb := '{}'::jsonb;
  table_list text[] := array[
    'subjects','chapters','sections','knowledge_points','questions','papers',
    'paper_questions','answer_records','wrong_answers','mock_exam_analyses',
    'kp_state','kp_detail','kp_edges','question_concepts','kp_evidence',
    'kp_records','kp_diagnoses','teaching_sessions','teaching_messages','kp_tests',
    'kp_tasks','chapter_weights','kp_moves','ai_suggestions','kp_notes',
    'ai_question_drafts','app_settings','kp_legacy_imports','kp_progress_snapshots'
  ];
begin
  if coalesce(p_backup->>'version', '') <> '2' or coalesce(jsonb_typeof(p_backup->'tables'), '') <> 'object' then
    raise exception 'backup_format_unsupported';
  end if;

  foreach table_name in array table_list loop
    rows_json := p_backup#>array['tables',table_name];
    if rows_json is null or rows_json = 'null'::jsonb then continue; end if;
    if jsonb_typeof(rows_json) <> 'array' then raise exception 'invalid_table_payload:%', table_name; end if;
    if jsonb_array_length(rows_json) = 0 then counts := counts || jsonb_build_object(table_name, 0); continue; end if;

    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'restore_table_missing:%', table_name;
    end if;
    execute format(
      'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
      table_name, table_name
    ) using rows_json;
    get diagnostics affected = row_count;
    counts := counts || jsonb_build_object(table_name, affected);
    total := total + affected;
  end loop;

  return jsonb_build_object('ok', true, 'inserted', total, 'per_table', counts, 'policy', 'merge-only; existing rows were preserved');
end;
$$;

revoke all on function public.study_bank_restore_backup(jsonb) from public;
revoke all on function public.study_bank_restore_backup(jsonb) from anon, authenticated;
grant execute on function public.study_bank_restore_backup(jsonb) to service_role;
