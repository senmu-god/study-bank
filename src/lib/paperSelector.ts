import type { Question, QuestionType, Difficulty } from "./types";

export interface KpSelection {
  kpId: string;
  percentage: number;
}

export interface TypeRatio {
  single_choice: number;
  multiple_choice: number;
  fill_blank: number;
  true_false: number;
  short_answer: number;
}

const TYPE_ORDER: QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "fill_blank",
  "true_false",
  "short_answer",
];

/**
 * 组卷抽题算法：
 * 1. 每个知识点按百分比换算目标题数；
 * 2. 优先 usage_count 最少、last_used_at 最早的题；
 * 3. 题型比例按整体配额分配；
 * 4. 某知识点题不足时返回缺口提示。
 */
export function selectQuestionsForPaper(params: {
  totalQuestions: number;
  kpConfig: KpSelection[];
  typeRatios: TypeRatio;
  difficultyRange: "easy" | "medium" | "hard" | "mixed";
  questionsByKp: Record<string, Question[]>;
}): {
  selected: Question[];
  gaps: { kpId: string; target: number; actual: number }[];
} {
  const { totalQuestions, kpConfig, typeRatios, difficultyRange, questionsByKp } = params;

  // 题型配额（按百分比换算到总题数）
  const typeQuota: Record<QuestionType, number> = {
    single_choice: 0,
    multiple_choice: 0,
    fill_blank: 0,
    true_false: 0,
    short_answer: 0,
  };
  for (const t of TYPE_ORDER) {
    typeQuota[t] = Math.round((totalQuestions * (typeRatios[t] || 0)) / 100);
  }

  const selected: Question[] = [];
  const usedQuestionIds = new Set<string>();
  const gaps: { kpId: string; target: number; actual: number }[] = [];

  // 按知识点配置顺序处理
  for (const kp of kpConfig) {
    const target = Math.round((totalQuestions * kp.percentage) / 100);
    const pool = (questionsByKp[kp.kpId] || [])
      .filter((q) => !usedQuestionIds.has(q.id))
      .filter((q) => {
        if (difficultyRange === "mixed") return true;
        return q.difficulty === difficultyRange;
      })
      // 优先级：usage_count 升序 → last_used_at 升序（null 视为最早）
      .sort((a, b) => {
        if (a.usage_count !== b.usage_count) return a.usage_count - b.usage_count;
        const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        return ta - tb;
      });

    let picked = 0;
    // 先按题型配额挑
    for (const q of pool) {
      if (picked >= target) break;
      const usedOfType = selected.filter((s) => s.question_type === q.question_type).length;
      if (usedOfType < typeQuota[q.question_type]) {
        selected.push(q);
        usedQuestionIds.add(q.id);
        picked++;
      }
    }
    // 配额满了还没取够，剩余目标从池里随便补
    for (const q of pool) {
      if (picked >= target) break;
      if (!usedQuestionIds.has(q.id)) {
        selected.push(q);
        usedQuestionIds.add(q.id);
        picked++;
      }
    }
    if (picked < target) {
      gaps.push({ kpId: kp.kpId, target, actual: picked });
    }
  }

  return { selected, gaps };
}
