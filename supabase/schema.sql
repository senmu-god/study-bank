-- ============================================================
-- 个人智能题库与组卷系统 - 数据库 Schema
-- 在 Supabase SQL Editor 中执行本文件即可创建全部表与索引
-- ============================================================

create extension if not exists "pgcrypto";

-- 1. 科目
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- 2. 章节
create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 3. 小节
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 4. 知识点
create table if not exists knowledge_points (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) on delete cascade,
  content text not null,
  difficulty text default 'medium',
  source_date date default current_date,
  tags text[],
  created_at timestamptz default now()
);

-- 5. 题目
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  knowledge_point_id uuid references knowledge_points(id) on delete cascade,
  question_type text not null,
  question_text text not null,
  options jsonb,
  correct_answer text not null,
  explanation text not null,
  difficulty text default 'medium',
  difficulty_score decimal(3,2) default 0.50,
  usage_count int default 0,
  last_used_at timestamptz,
  generated_at timestamptz default now()
);

-- 6. 考卷
create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  total_questions int default 24,
  knowledge_point_config jsonb,
  difficulty_level text,
  paper_type text default 'daily',
  created_at timestamptz default now()
);

-- 7. 考卷-题目关联
create table if not exists paper_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references papers(id) on delete cascade,
  question_id uuid references questions(id) on delete cascade,
  sort_order int default 0
);

-- 8. 答题记录
create table if not exists answer_records (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references papers(id) on delete cascade,
  question_id uuid references questions(id),
  user_answer text,
  is_correct boolean,
  time_spent_seconds int,
  ai_score_percent int,
  ai_comment text,
  answered_at timestamptz default now()
);

-- 9. 错题本
create table if not exists wrong_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete cascade,
  wrong_count int default 1,
  last_wrong_at timestamptz default now(),
  mastered boolean default false,
  next_review_at timestamptz,
  ease_factor decimal(3,2) default 2.50
);

-- ============================================================
-- 索引
-- ============================================================
create index if not exists idx_chapters_subject on chapters(subject_id);
create index if not exists idx_sections_chapter on sections(chapter_id);
create index if not exists idx_kp_section on knowledge_points(section_id);
create index if not exists idx_kp_source_date on knowledge_points(source_date);
create index if not exists idx_q_kp on questions(knowledge_point_id);
create index if not exists idx_pq_paper on paper_questions(paper_id);
create index if not exists idx_pq_question on paper_questions(question_id);
create index if not exists idx_ar_paper on answer_records(paper_id);
create index if not exists idx_ar_question on answer_records(question_id);
create index if not exists idx_wrong_question on wrong_answers(question_id);
create index if not exists idx_wrong_review on wrong_answers(next_review_at) where mastered = false;
