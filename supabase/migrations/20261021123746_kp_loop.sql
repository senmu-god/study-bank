-- ============================================================
-- 0002 · 知识漏洞管理闭环（合并第二阶段）
-- 原则：只增不改。现有 10 张表不删列、不改语义、不动数据。
-- 幂等：可重复执行。
-- 回滚：supabase/rollback/0002_kp_loop_rollback.sql
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0. 先修三个既有隐患（不改数据，只改约束/索引）
-- ------------------------------------------------------------

-- 0.1 答题记录外键改为 ON DELETE SET NULL
--     现状：answer_records.question_id 无 ON DELETE，一旦有答题记录，
--     删除题目/知识点会被外键阻塞。改为 SET NULL 以保留历史记录。
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
    foreign key (question_id) references public.questions(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- 0.2 答题记录冗余 kp_id：按知识点聚合时不必每次三表 join
alter table public.answer_records add column if not exists kp_id uuid
  references public.knowledge_points(id) on delete set null;
create index if not exists idx_ar_kp on public.answer_records(kp_id);

-- 0.3 知识点去重：同一小节内内容不允许重复（防止重复导入）
create unique index if not exists uq_kp_section_content
  on public.knowledge_points (section_id, md5(content));

-- ------------------------------------------------------------
-- 1. 知识点状态（五态）
-- ------------------------------------------------------------
create table if not exists public.kp_state (
  kp_id          uuid primary key references public.knowledge_points(id) on delete cascade,
  status         text not null default 'new'
                 check (status in ('new','learning','not_mastered','pending','mastered')),
  source         text not null default 'auto'
                 check (source in ('auto','manual','diagnosis','test')),
  locked_by_user boolean not null default false,
  last_studied_at timestamptz,
  updated_at     timestamptz default now()
);
create index if not exists idx_kp_state_status on public.kp_state(status);

-- ------------------------------------------------------------
-- 2. 知识点内容扩展（展示名 / 摘要 / 公式 / 条件 / 易错）
-- ------------------------------------------------------------
create table if not exists public.kp_detail (
  kp_id         uuid primary key references public.knowledge_points(id) on delete cascade,
  display_name  text,
  summary       text,
  formulas      jsonb not null default '[]'::jsonb,
  conditions    text[] not null default '{}',
  error_patterns text[] not null default '{}',
  legacy_id     text,
  updated_at    timestamptz default now()
);
create index if not exists idx_kp_detail_legacy on public.kp_detail(legacy_id);

-- ------------------------------------------------------------
-- 3. 知识点依赖图
-- ------------------------------------------------------------
create table if not exists public.kp_edges (
  id         uuid primary key default gen_random_uuid(),
  from_kp    uuid not null references public.knowledge_points(id) on delete cascade,
  to_kp      uuid not null references public.knowledge_points(id) on delete cascade,
  type       text not null default 'prereq' check (type in ('prereq','related')),
  weight     numeric(4,2) default 1.0,
  created_at timestamptz default now(),
  unique (from_kp, to_kp, type)
);
create index if not exists idx_kp_edges_from on public.kp_edges(from_kp);
create index if not exists idx_kp_edges_to on public.kp_edges(to_kp);

-- ------------------------------------------------------------
-- 4. 题目 ↔ 知识点多对多（旧字段 knowledge_point_id 继续作主关联）
-- ------------------------------------------------------------
create table if not exists public.question_concepts (
  question_id uuid not null references public.questions(id) on delete cascade,
  kp_id       uuid not null references public.knowledge_points(id) on delete cascade,
  role        text not null default 'secondary' check (role in ('primary','secondary')),
  source      text not null default 'ai' check (source in ('ai','manual','import')),
  confidence  numeric(3,2),
  created_at  timestamptz default now(),
  primary key (question_id, kp_id)
);
create index if not exists idx_qc_kp on public.question_concepts(kp_id);

-- ------------------------------------------------------------
-- 5. 证据（必须能追溯回具体答题记录）
-- ------------------------------------------------------------
create table if not exists public.kp_evidence (
  id               uuid primary key default gen_random_uuid(),
  kp_id            uuid not null references public.knowledge_points(id) on delete cascade,
  question_id      uuid references public.questions(id) on delete set null,
  answer_record_id uuid references public.answer_records(id) on delete set null,
  quote            text,
  error_type       text,
  reason           text,
  strength         text check (strength in ('weak','medium','strong')),
  source           text check (source in ('diagnosis','manual','test')),
  created_at       timestamptz default now()
);
create index if not exists idx_kp_ev_kp on public.kp_evidence(kp_id);
create index if not exists idx_kp_ev_ar on public.kp_evidence(answer_record_id);

-- ------------------------------------------------------------
-- 6. 学习流水
-- ------------------------------------------------------------
create table if not exists public.kp_records (
  id         uuid primary key default gen_random_uuid(),
  kp_id      uuid not null references public.knowledge_points(id) on delete cascade,
  type       text not null check (type in ('diagnosis','teaching','test','review','status','move')),
  title      text not null,
  detail     text,
  payload    jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_kp_rec_kp on public.kp_records(kp_id, created_at desc);

-- ------------------------------------------------------------
-- 7. 诊断结论
-- ------------------------------------------------------------
create table if not exists public.kp_diagnoses (
  id               uuid primary key default gen_random_uuid(),
  kp_id            uuid not null references public.knowledge_points(id) on delete cascade,
  error_rate       numeric(5,2),
  sample_size      int,
  conclusion       text,
  confidence       text check (confidence in ('low','medium','high')),
  suggested_status text check (suggested_status in ('not_mastered','pending','mastered')),
  model            text,
  evidence_ids     uuid[] not null default '{}',
  raw              jsonb,
  created_at       timestamptz default now()
);
create index if not exists idx_kp_diag_kp on public.kp_diagnoses(kp_id, created_at desc);

-- ------------------------------------------------------------
-- 8. 互动教学会话
-- ------------------------------------------------------------
create table if not exists public.teaching_sessions (
  id         uuid primary key default gen_random_uuid(),
  kp_id      uuid not null references public.knowledge_points(id) on delete cascade,
  status     text not null default 'active' check (status in ('active','done','abandoned')),
  step       int not null default 0,
  hint_level int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_teach_kp on public.teaching_sessions(kp_id, created_at desc);

create table if not exists public.teaching_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  role       text not null check (role in ('assistant','user')),
  content    text not null,
  hint_level int,
  created_at timestamptz default now()
);
create index if not exists idx_teach_msg on public.teaching_messages(session_id, created_at);

-- ------------------------------------------------------------
-- 9. 专项测试（复用 papers 组卷与判分链路）
-- ------------------------------------------------------------
create table if not exists public.kp_tests (
  id         uuid primary key default gen_random_uuid(),
  kp_id      uuid not null references public.knowledge_points(id) on delete cascade,
  paper_id   uuid references public.papers(id) on delete set null,
  kind       text not null default 'initial' check (kind in ('initial','retest')),
  score      numeric(5,2),
  passed     boolean,
  conclusion text,
  detail     jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_kp_tests_kp on public.kp_tests(kp_id, created_at desc);

-- ------------------------------------------------------------
-- 10. 每日任务
-- ------------------------------------------------------------
create table if not exists public.kp_tasks (
  id         uuid primary key default gen_random_uuid(),
  kp_id      uuid not null references public.knowledge_points(id) on delete cascade,
  task_date  date not null,
  type       text not null check (type in ('learn','test','retest','review')),
  priority   int not null default 50,
  source     text not null default 'auto' check (source in ('auto','manual')),
  status     text not null default 'pending'
             check (status in ('pending','done','skipped','deferred')),
  due_at     timestamptz,
  created_at timestamptz default now(),
  unique (kp_id, task_date, type)
);
create index if not exists idx_tasks_date on public.kp_tasks(task_date, status);

-- ------------------------------------------------------------
-- 11. 章节权重
-- ------------------------------------------------------------
create table if not exists public.chapter_weights (
  chapter_id uuid primary key references public.chapters(id) on delete cascade,
  core       numeric(4,2) not null default 0.50,
  centrality numeric(4,2) not null default 0.00,
  gap        numeric(4,2) not null default 0.00,
  weight     numeric(4,2) not null default 0.50,
  locked     boolean not null default false,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 12. 归属调整审计
-- ------------------------------------------------------------
create table if not exists public.kp_moves (
  id         uuid primary key default gen_random_uuid(),
  kp_id      uuid not null references public.knowledge_points(id) on delete cascade,
  from_section uuid references public.sections(id) on delete set null,
  to_section   uuid references public.sections(id) on delete set null,
  source     text not null default 'manual' check (source in ('manual','ai')),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 13. AI 建议记录（含"已拒绝"，避免同一建议重复打扰）
-- ------------------------------------------------------------
create table if not exists public.ai_suggestions (
  id         uuid primary key default gen_random_uuid(),
  kp_id      uuid references public.knowledge_points(id) on delete cascade,
  kind       text not null check (kind in ('move','weight','status','priority')),
  payload    jsonb not null default '{}'::jsonb,
  reason     text,
  state      text not null default 'pending'
             check (state in ('pending','accepted','rejected')),
  created_at timestamptz default now()
);
create index if not exists idx_sugg_kp on public.ai_suggestions(kp_id, kind, state);

-- ------------------------------------------------------------
-- 14. 笔记 / 知识库
-- ------------------------------------------------------------
create table if not exists public.kp_notes (
  id         uuid primary key default gen_random_uuid(),
  kp_id      uuid references public.knowledge_points(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  title      text,
  body       text not null,
  tags       text[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_notes_kp on public.kp_notes(kp_id);

-- ------------------------------------------------------------
-- 15. AI 补充题候选与质检
-- ------------------------------------------------------------
create table if not exists public.ai_question_drafts (
  id           uuid primary key default gen_random_uuid(),
  kp_id        uuid not null references public.knowledge_points(id) on delete cascade,
  question_type text not null,
  payload      jsonb not null,
  checks       jsonb not null default '{}'::jsonb,
  state        text not null default 'draft'
               check (state in ('draft','passed','rejected','written')),
  question_id  uuid references public.questions(id) on delete set null,
  model        text,
  created_at   timestamptz default now()
);
create index if not exists idx_drafts_state on public.ai_question_drafts(state, created_at desc);

-- ------------------------------------------------------------
-- 16. 全局设置（单行）
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  id             int primary key default 1 check (id = 1),
  daily_limit    int not null default 12,
  retest_days    int not null default 7,
  review_days    int not null default 3,
  ai_send_policy text not null default 'minimal' check (ai_send_policy in ('minimal','ask','full')),
  updated_at     timestamptz default now()
);

-- ------------------------------------------------------------
-- 17. 树视图：一次查询拿到 章/节/知识点/状态/题目数
-- ------------------------------------------------------------
create or replace view public.v_kp_tree as
select
  kp.id                                   as kp_id,
  coalesce(d.display_name, kp.content)     as name,
  kp.content                               as raw_content,
  kp.difficulty,
  kp.section_id,
  s.name                                   as section_name,
  s.sort_order                             as section_order,
  c.id                                     as chapter_id,
  c.name                                   as chapter_name,
  c.sort_order                             as chapter_order,
  coalesce(st.status, 'new')               as status,
  coalesce(st.locked_by_user, false)       as locked,
  coalesce(st.last_studied_at, null)       as last_studied_at,
  (select count(*) from public.questions q where q.knowledge_point_id = kp.id) as question_count
from public.knowledge_points kp
join public.sections s on s.id = kp.section_id
join public.chapters c on c.id = s.chapter_id
left join public.kp_state st on st.kp_id = kp.id
left join public.kp_detail d on d.kp_id = kp.id;

-- ------------------------------------------------------------
-- 18. 初始化数据（幂等）
-- ------------------------------------------------------------

-- 18.1 现有 276 个知识点全部初始化为"未学习"
insert into public.kp_state (kp_id, status, source)
select kp.id, 'new', 'auto'
from public.knowledge_points kp
where not exists (select 1 from public.kp_state st where st.kp_id = kp.id);

-- 18.2 每个章节一行权重（核心度先给默认值，后续由应用层计算）
insert into public.chapter_weights (chapter_id, core, centrality, gap, weight)
select c.id, 0.50, 0.00, 0.00, 0.50
from public.chapters c
where not exists (select 1 from public.chapter_weights w where w.chapter_id = c.id);

-- 18.3 全局设置单行
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 19. 安全：开启 RLS 并收回匿名权限
--     服务端使用 service_role（自带 BYPASSRLS），不受影响。
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'subjects','chapters','sections','knowledge_points','questions',
    'papers','paper_questions','answer_records','wrong_answers','mock_exam_analyses',
    'kp_state','kp_detail','kp_edges','question_concepts','kp_evidence','kp_records',
    'kp_diagnoses','teaching_sessions','teaching_messages','kp_tests','kp_tasks',
    'chapter_weights','kp_moves','ai_suggestions','kp_notes','ai_question_drafts','app_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on public.v_kp_tree from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ------------------------------------------------------------
-- 20. 触发器：updated_at 自动维护
-- ------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['kp_state','kp_detail','teaching_sessions','chapter_weights','kp_notes','app_settings']
  loop
    execute format('drop trigger if exists trg_touch_%s on public.%I', t, t);
    execute format('create trigger trg_touch_%s before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
