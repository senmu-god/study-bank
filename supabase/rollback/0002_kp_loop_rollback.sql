-- ============================================================
-- 0002 回滚脚本
-- 作用：撤销 20261021123746_kp_loop.sql 的所有变更。
-- 影响：只删除 0002 新增的表/视图/索引/函数与新增列。
--       **不触碰原有 10 张表的任何数据行。**
-- 注意：kp_id 列一旦删除，按知识点聚合的历史冗余会丢失（可由 question 反查恢复）。
-- ============================================================

begin;

-- 1. 触发器与函数
do $$
declare t text;
begin
  foreach t in array array['kp_state','kp_detail','teaching_sessions','chapter_weights','kp_notes','app_settings']
  loop
    execute format('drop trigger if exists trg_touch_%s on public.%I', t, t);
  end loop;
end $$;
drop function if exists public.touch_updated_at();

-- 2. 视图
drop view if exists public.v_kp_tree;

-- 3. 新增表（按依赖倒序）
drop table if exists public.ai_question_drafts;
drop table if exists public.kp_notes;
drop table if exists public.ai_suggestions;
drop table if exists public.kp_moves;
drop table if exists public.chapter_weights;
drop table if exists public.kp_tasks;
drop table if exists public.kp_tests;
drop table if exists public.teaching_messages;
drop table if exists public.teaching_sessions;
drop table if exists public.kp_diagnoses;
drop table if exists public.kp_records;
drop table if exists public.kp_evidence;
drop table if exists public.question_concepts;
drop table if exists public.kp_edges;
drop table if exists public.kp_detail;
drop table if exists public.kp_state;

-- 4. 撤销 0.x 的既有表调整
drop index if exists public.uq_kp_section_content;

drop index if exists public.idx_ar_kp;
alter table public.answer_records drop column if exists kp_id;

-- 5. 外键恢复为原状（无 ON DELETE）
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.answer_records'::regclass
      and contype = 'f'
      and confrelid = 'public.questions'::regclass
  loop
    execute format('alter table public.answer_records drop constraint %I', c.conname);
  end loop;
  alter table public.answer_records
    add constraint answer_records_question_id_fkey
    foreign key (question_id) references public.questions(id);
end $$;

-- 6. 恢复默认权限（保持与 Supabase 初始一致）
grant all on all tables in schema public to anon, authenticated;

commit;
