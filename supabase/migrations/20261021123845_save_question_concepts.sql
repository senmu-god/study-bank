-- Atomically save an edited question and its primary/secondary knowledge links.
create or replace function public.kp_save_question_concepts(
  p_question_id uuid,
  p_patch jsonb,
  p_primary_kp uuid,
  p_secondary_kps uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  kp_id uuid;
begin
  if not exists (select 1 from public.questions where id = p_question_id) then
    raise exception 'question_not_found';
  end if;
  if p_primary_kp is not null and not exists (select 1 from public.knowledge_points where id = p_primary_kp) then
    raise exception 'primary_knowledge_point_not_found';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_secondary_kps, '{}'::uuid[])) as x(kp_id)
    where not exists (select 1 from public.knowledge_points kp where kp.id = x.kp_id)
  ) then raise exception 'secondary_knowledge_point_not_found'; end if;

  update public.questions q set
    question_text = case when p_patch ? 'question_text' then p_patch->>'question_text' else q.question_text end,
    options = case when p_patch ? 'options' then nullif(p_patch->'options', 'null'::jsonb) else q.options end,
    correct_answer = case when p_patch ? 'correct_answer' then p_patch->>'correct_answer' else q.correct_answer end,
    explanation = case when p_patch ? 'explanation' then p_patch->>'explanation' else q.explanation end,
    difficulty = case when p_patch ? 'difficulty' then p_patch->>'difficulty' else q.difficulty end
  where q.id = p_question_id;

  -- Keep existing answer history attached to the question's corrected primary concept.
  update public.answer_records set kp_id = p_primary_kp where question_id = p_question_id;

  delete from public.question_concepts where question_id = p_question_id;
  if p_primary_kp is not null then
    insert into public.question_concepts (question_id,kp_id,role,source,confidence)
    values (p_question_id,p_primary_kp,'primary','manual',1.0);
  end if;
  for kp_id in select distinct x.kp_id from unnest(coalesce(p_secondary_kps, '{}'::uuid[])) as x(kp_id)
  loop
    if kp_id is null or kp_id = p_primary_kp then continue; end if;
    insert into public.question_concepts (question_id,kp_id,role,source,confidence)
    values (p_question_id,kp_id,'secondary','manual',1.0);
  end loop;
end;
$$;

revoke all on function public.kp_save_question_concepts(uuid,jsonb,uuid,uuid[]) from public;
revoke all on function public.kp_save_question_concepts(uuid,jsonb,uuid,uuid[]) from anon, authenticated;
grant execute on function public.kp_save_question_concepts(uuid,jsonb,uuid,uuid[]) to service_role;
