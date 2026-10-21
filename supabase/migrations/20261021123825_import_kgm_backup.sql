-- One-time import of a "知识就是力量" JSON backup into the study-bank model.
-- The caller supplies an explicit old-id -> study-bank UUID mapping.
-- All writes occur in one database transaction (one RPC call).

create table if not exists public.kp_legacy_imports (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_app text not null,
  imported_at timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb
);
alter table public.kp_legacy_imports enable row level security;
revoke all on public.kp_legacy_imports from anon, authenticated;

create or replace function public.kp_import_kgm_backup(p_data jsonb, p_mapping jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  relation_item text;
  target_id uuid;
  related_id uuid;
  mapped_status text;
  event_type text;
  event_at timestamptz;
  inserted_count integer;
  concepts_count integer := 0;
  evidence_count integer := 0;
  records_count integer := 0;
  notes_count integer := 0;
  skipped_concepts integer := 0;
  skipped_evidence integer := 0;
  skipped_records integer := 0;
  skipped_questions integer := 0;
  v_source_key text;
  prior_result jsonb;
begin
  if jsonb_typeof(p_data->'knowledge') <> 'array' then
    raise exception 'backup must contain a knowledge array';
  end if;
  if jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'mapping must be a JSON object';
  end if;

  v_source_key := md5(p_data::text);
  select i.result into prior_result from public.kp_legacy_imports i where i.source_key = v_source_key;
  if prior_result is not null then
    return prior_result || jsonb_build_object('already_imported', true);
  end if;

  -- Merge details without replacing any non-empty content already in study-bank.
  for item in select value from jsonb_array_elements(p_data->'knowledge')
  loop
    target_id := nullif(p_mapping->>(item->>'id'), '')::uuid;
    if target_id is null then
      skipped_concepts := skipped_concepts + 1;
      continue;
    end if;

    insert into public.kp_detail (
      kp_id, summary, formulas, conditions, error_patterns, legacy_id, updated_at
    ) values (
      target_id,
      coalesce(nullif(item->>'summary', ''), ''),
      coalesce(item->'formulas', '[]'::jsonb),
      array(select jsonb_array_elements_text(coalesce(item->'conditions', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(item->'errorPatterns', '[]'::jsonb))),
      item->>'id', now()
    )
    on conflict (kp_id) do update set
      summary = case when coalesce(public.kp_detail.summary, '') = '' then excluded.summary else public.kp_detail.summary end,
      formulas = case when coalesce(public.kp_detail.formulas, '[]'::jsonb) = '[]'::jsonb then excluded.formulas else public.kp_detail.formulas end,
      conditions = case when cardinality(public.kp_detail.conditions) = 0 then excluded.conditions else public.kp_detail.conditions end,
      error_patterns = case when cardinality(public.kp_detail.error_patterns) = 0 then excluded.error_patterns else public.kp_detail.error_patterns end,
      legacy_id = coalesce(public.kp_detail.legacy_id, excluded.legacy_id),
      updated_at = now();

    mapped_status := case item->>'status'
      when 'unanalyzed' then 'new'
      when 'remedying' then 'learning'
      when 'retest' then 'pending'
      when 'not_mastered' then 'not_mastered'
      when 'pending' then 'pending'
      when 'mastered' then 'mastered'
      else 'new'
    end;
    event_at := null;
    begin
      event_at := nullif(item->>'lastStudied', '')::timestamptz;
    exception when others then
      event_at := null;
    end;

    insert into public.kp_state (kp_id, status, source, locked_by_user, last_studied_at, updated_at)
    values (target_id, mapped_status, 'manual', true, event_at, now())
    on conflict (kp_id) do nothing;
    get diagnostics inserted_count = row_count;
    concepts_count := concepts_count + 1;

    -- Preserve prerequisite and related links only when both endpoints were explicitly mapped.
    for relation_item in
      select jsonb_array_elements_text(coalesce(item->'prerequisites', '[]'::jsonb))
    loop
      related_id := nullif(p_mapping->>relation_item, '')::uuid;
      if related_id is not null and related_id <> target_id then
        insert into public.kp_edges(from_kp, to_kp, type)
        values (related_id, target_id, 'prereq') on conflict do nothing;
      end if;
    end loop;
    for relation_item in
      select jsonb_array_elements_text(coalesce(item->'related', '[]'::jsonb))
    loop
      related_id := nullif(p_mapping->>relation_item, '')::uuid;
      if related_id is not null and related_id <> target_id then
        insert into public.kp_edges(from_kp, to_kp, type)
        values (target_id, related_id, 'related') on conflict do nothing;
      end if;
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_data->'evidence', '[]'::jsonb))
  loop
    target_id := nullif(p_mapping->>(item->>'kpId'), '')::uuid;
    if target_id is null then
      skipped_evidence := skipped_evidence + 1;
      continue;
    end if;
    event_at := now();
    begin
      event_at := coalesce(nullif(item->>'at', '')::timestamptz, now());
    exception when others then
      event_at := now();
    end;
    insert into public.kp_evidence (
      kp_id, question_id, answer_record_id, quote, error_type, reason, strength, source, created_at
    ) values (
      target_id,
      null,
      null,
      left(coalesce(item->>'quote', ''), 500),
      left(coalesce(item->>'errorType', ''), 200),
      left(concat_ws(E'\n', nullif(item->>'reason', ''), case when coalesce(item->>'questionId', '') <> '' then '旧系统题目 ID: ' || item->>'questionId' end), 2000),
      case when item->>'strength' in ('weak','medium','strong') then item->>'strength' else 'weak' end,
      case when item->>'source' in ('diagnosis','manual','test') then item->>'source' else 'manual' end,
      event_at
    );
    evidence_count := evidence_count + 1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_data->'records', '[]'::jsonb))
  loop
    target_id := nullif(p_mapping->>(item->>'kpId'), '')::uuid;
    if target_id is null then
      skipped_records := skipped_records + 1;
      continue;
    end if;
    event_type := case when item->>'type' in ('diagnosis','teaching','test','review','status','move') then item->>'type' else null end;
    if event_type is null then
      skipped_records := skipped_records + 1;
      continue;
    end if;
    event_at := now();
    begin
      event_at := coalesce(nullif(item->>'at', '')::timestamptz, now());
    exception when others then
      event_at := now();
    end;
    insert into public.kp_records (kp_id, type, title, detail, payload, created_at)
    values (
      target_id,
      event_type,
      left(coalesce(item->>'title', '旧系统学习记录'), 300),
      left(coalesce(item->>'detail', ''), 4000),
      jsonb_build_object('source', 'kgm-backup', 'legacy_id', item->>'id'),
      event_at
    );
    records_count := records_count + 1;
  end loop;

  -- Legacy KGM questions lack the answer and scoring fields required by study-bank exams.
  -- Keep their text as linked reference notes; do not silently turn them into exam questions.
  for item in select value from jsonb_array_elements(coalesce(p_data->'questions', '[]'::jsonb))
  loop
    related_id := null;
    for relation_item in
      select jsonb_array_elements_text(coalesce(item->'kpIds', '[]'::jsonb))
    loop
      target_id := nullif(p_mapping->>relation_item, '')::uuid;
      if target_id is null then continue; end if;
      insert into public.kp_notes (kp_id, title, body, tags, created_at, updated_at)
      values (
        target_id,
        left(coalesce(nullif(item->>'title', ''), nullif(item->>'code', ''), '旧系统题目资料'), 200),
        left(concat_ws(E'\n\n',
          '旧系统题目内容（导入为资料，不进入考试题库）:',
          coalesce(item->>'content', ''),
          case when coalesce(item->>'source', '') <> '' then '来源: ' || item->>'source' end,
          case when coalesce(item->>'state', '') <> '' then '旧状态: ' || item->>'state' end,
          case when coalesce(item->>'errorType', '') <> '' then '错误类型: ' || item->>'errorType' end,
          case when coalesce(item->>'hasSolution', 'false') = 'true' then '旧系统标记：已有解答资料。' end
        ), 20000),
        array['legacy-kgm','待整理为题库试题'], now(), now()
      );
      notes_count := notes_count + 1;
      related_id := target_id;
    end loop;
    if related_id is null then skipped_questions := skipped_questions + 1; end if;
  end loop;

  prior_result := jsonb_build_object(
    'already_imported', false,
    'mapped_concepts', concepts_count,
    'skipped_concepts', skipped_concepts,
    'imported_evidence', evidence_count,
    'skipped_evidence', skipped_evidence,
    'imported_records', records_count,
    'skipped_records', skipped_records,
    'legacy_questions_as_notes', notes_count,
    'skipped_questions', skipped_questions,
    'state_policy', 'Existing study-bank states were preserved; new imported states are user-locked.'
  );
  insert into public.kp_legacy_imports (source_key, source_app, result)
  values (v_source_key, coalesce(p_data#>>'{meta,app}', 'unknown'), prior_result);
  return prior_result;
end;
$$;

revoke all on function public.kp_import_kgm_backup(jsonb, jsonb) from public;
revoke all on function public.kp_import_kgm_backup(jsonb, jsonb) from anon, authenticated;
grant execute on function public.kp_import_kgm_backup(jsonb, jsonb) to service_role;
