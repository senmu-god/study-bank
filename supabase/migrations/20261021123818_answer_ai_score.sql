-- ============================================================
-- 0003 · 补上 schema.sql 里写了、线上库却没建的两列
--
-- 背景：answer_records 在线上库只有 id/paper_id/question_id/user_answer/
-- is_correct/time_spent_seconds/image_url/ocr_text/answered_at/kp_id，
-- 缺 ai_score_percent 与 ai_comment。简答题由 AI 判分，
-- 分数只用来算 is_correct，具体得分与评语一直没落库，
-- 导致诊断时看不到「简答题拿了 40 分」这类关键证据。
--
-- 幂等：可重复执行。
-- 回滚：supabase/rollback/0003_answer_ai_score_rollback.sql
-- ============================================================

alter table public.answer_records add column if not exists ai_score_percent int;
alter table public.answer_records add column if not exists ai_comment text;

comment on column public.answer_records.ai_score_percent is '简答/设计题的 AI 评分（0-100），客观题为空';
comment on column public.answer_records.ai_comment is 'AI 阅卷评语';
