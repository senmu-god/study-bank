-- 回滚 0003：删除新增的两列（会丢失已有 AI 评分，执行前先备份）
alter table public.answer_records drop column if exists ai_score_percent;
alter table public.answer_records drop column if exists ai_comment;
