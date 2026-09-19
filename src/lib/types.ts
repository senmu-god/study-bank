export type Difficulty = "easy" | "medium_easy" | "medium" | "hard";
/** 出题/组卷难度模式：自动按知识点难度 / 单档 / 混合(按四川专升本3:3:3:1) */
export type DifficultyMode = "auto" | Difficulty | "mixed";
export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "fill_blank"
  | "true_false"
  | "short_answer"
  | "design";

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
  design: "应用设计题",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "容易",
  medium_easy: "较易",
  medium: "中等",
  hard: "较难",
};

/** difficulty_score 与 difficulty 一一对应 */
export const DIFFICULTY_SCORES: Record<Difficulty, number> = {
  easy: 0.3,
  medium_easy: 0.5,
  medium: 0.7,
  hard: 0.9,
};

/** 颜色标签：绿=容易 浅绿=较易 橙=中等 红=较难 */
export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "bg-green-100 text-green-700 border-green-300",
  medium_easy: "bg-lime-100 text-lime-700 border-lime-300",
  medium: "bg-orange-100 text-orange-700 border-orange-300",
  hard: "bg-red-100 text-red-700 border-red-300",
};

export const DIFFICULTY_MODES: { value: DifficultyMode; label: string }[] = [
  { value: "auto", label: "自动匹配（按知识点难度）" },
  { value: "easy", label: "容易" },
  { value: "medium_easy", label: "较易" },
  { value: "medium", label: "中等" },
  { value: "hard", label: "较难" },
  { value: "mixed", label: "混合（3:3:3:1）" },
];

/** 把旧的三档难度(knowledge_points 历史值)规整到新四档 */
export function normalizeDifficulty(v: unknown): Difficulty {
  const s = String(v || "").toLowerCase();
  if (s === "easy" || s === "简单" || s === "容易") return "easy";
  if (s === "medium_easy" || s === "较易") return "medium_easy";
  if (s === "medium" || s === "中等") return "medium";
  if (s === "hard" || s === "困难" || s === "较难") return "hard";
  return "medium";
}
