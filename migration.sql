-- ============================================
-- 题库系统数据库补全脚本（幂等，可重复执行）
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 1. answer_records 增加图片/OCR 字段（拍照答题用）
ALTER TABLE answer_records ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE answer_records ADD COLUMN IF NOT EXISTS ocr_text TEXT;

-- 2. paper_questions 增加每题分值字段（计算机150分制用）
ALTER TABLE paper_questions ADD COLUMN IF NOT EXISTS points INT DEFAULT 1;

-- 3. 错题本增加间隔复习步数（SM-2算法用）
ALTER TABLE wrong_answers ADD COLUMN IF NOT EXISTS interval_step INT DEFAULT 0;

-- 4. 模考分析记录表
CREATE TABLE IF NOT EXISTS mock_exam_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
  total_score INT DEFAULT 0,
  correct_rate INT DEFAULT 0,
  time_spent INT DEFAULT 0,
  weak_points JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 启用 UUID 扩展（如果还没启用）
CREATE EXTENSION IF NOT EXISTS pgcrypto;
