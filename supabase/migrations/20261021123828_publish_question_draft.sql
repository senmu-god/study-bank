-- Publish an individually reviewed AI question draft to the existing question bank.
-- The RPC keeps the question insert and draft state change atomic.
create or replace function public.kp_publish_question_draft(p_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_row public.ai_question_drafts%rowtype;
  q jsonb;
  new_question_id uuid;
begin
  select * into draft_row
  from public.ai_question_drafts
  where id = p_draft_id
  for update;

  if not found then raise exception 'draft_not_found'; end if;
  if draft_row.state <> 'draft' then raise exception 'draft_not_pending_review'; end if;
  if coalesce((draft_row.checks->>'structure')::boolean, false) is not true
    or coalesce((draft_row.checks->>'answer')::boolean, false) is not true
    or coalesce((draft_row.checks->>'explanation')::boolean, false) is not true
    or coalesce((draft_row.checks->>'noStaleReferences')::boolean, false) is not true
  then raise exception 'draft_quality_checks_failed'; end if;

  q := draft_row.payload;
  if coalesce(q->>'question_text', '') = '' or coalesce(q->>'correct_answer', '') = ''
    or coalesce(q->>'explanation', '') = '' or coalesce(q->>'question_type', '') = ''
  then raise exception 'draft_payload_incomplete'; end if;
  if q->>'question_type' not in ('single_choice','multiple_choice','fill_blank','true_false','short_answer','design') then
    raise exception 'draft_question_type_invalid';
  end if;

  insert into public.questions (
    knowledge_point_id, question_type, question_text, options, correct_answer,
    explanation, difficulty, difficulty_score
  ) values (
    draft_row.kp_id,
    q->>'question_type',
    q->>'question_text',
    case when jsonb_typeof(q->'options') = 'array' then case when jsonb_array_length(q->'options') > 0 then q->'options' else null end else null end,
    q->>'correct_answer',
    q->>'explanation',
    coalesce(q->>'difficulty', 'medium'),
    coalesce((q->>'difficulty_score')::numeric, 0.5)
  ) returning id into new_question_id;

  insert into public.question_concepts (question_id, kp_id, role, source, confidence)
  values (new_question_id, draft_row.kp_id, 'primary', 'ai', 1.0)
  on conflict (question_id, kp_id) do nothing;

  update public.ai_question_drafts
  set state = 'written', question_id = new_question_id
  where id = p_draft_id;
  return new_question_id;
end;
$$;

revoke all on function public.kp_publish_question_draft(uuid) from public;
revoke all on function public.kp_publish_question_draft(uuid) from anon, authenticated;
grant execute on function public.kp_publish_question_draft(uuid) to service_role;
