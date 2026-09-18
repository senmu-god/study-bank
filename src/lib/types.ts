export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "fill_blank"
  | "true_false"
  | "short_answer";

export interface Option {
  label: string;
  text: string;
}

export interface Question {
  id: string;
  knowledge_point_id: string;
  question_type: QuestionType;
  question_text: string;
  options: Option[] | null;
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
  difficulty_score: number;
  usage_count: number;
  last_used_at: string | null;
  generated_at: string;
}

export interface KnowledgePoint {
  id: string;
  section_id: string;
  content: string;
  difficulty: Difficulty;
  source_date: string;
  tags: string[] | null;
  created_at: string;
}

export interface SectionNode {
  id: string;
  name: string;
  sort_order: number;
  kps: KnowledgePoint[];
}

export interface ChapterNode {
  id: string;
  name: string;
  sort_order: number;
  sections: SectionNode[];
}

export interface SubjectNode {
  id: string;
  name: string;
  description: string | null;
  chapters: ChapterNode[];
}

export interface ParsedImportItem {
  subject: string;
  chapter: string;
  section: string;
  content: string;
  difficulty: Difficulty;
  tags: string[];
}

export interface GenTask {
  kpId: string;
  subject: string;
  chapter: string;
  section: string;
  kpContent: string;
  questionType: QuestionType;
  difficulty: Difficulty;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  fill_blank: "填空题",
  true_false: "判断题",
  short_answer: "简答题",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};
