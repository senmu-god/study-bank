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
  design: number;
}

const TYPE_ORDER: QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "fill_blank",
  "true_false",
  "short_answer",
  "design",
];

/** 四川专升本难度比例：容易30 较易30 中等30 较难10 */
const DIFF_ORDER: Difficulty[] = ["easy", "medium_easy", "medium", "hard"];
const DIFF_WEIGHTS = [30, 30, 30, 10];

/**
 * 最大余额法（Largest Remainder Method）：
 * total 个名额按 weights 比例分配，确保总和严格等于 total。
 */
export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  // 按小数部分从大到小排序，依次给 1
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i]++;
    remainder--;
  }
  return result;
}

/**
 * 组卷抽题算法：
 * 1. 最大余额法分配每个知识点的题数（总和严格=totalQuestions）；
 * 2. 最大余额法分配题型配额（总和严格=totalQuestions）；
 * 3. 优先 usage_count 最少、last_used_at 最早的题；
 * 4. 硬性校验：最终题目数严格等于 totalQuestions。
 */
export function selectQuestionsForPaper(params: {
  totalQuestions: number;
  kpConfig: KpSelection[];
  typeRatios: TypeRatio;
  difficultyRange: "easy" | "medium_easy" | "medium" | "hard" | "mixed";
  questionsByKp: Record<string, Question[]>;
}): {
  selected: Question[];
  gaps: { kpId: string; target: number; actual: number }[];
} {
  const { totalQuestions, kpConfig, typeRatios, difficultyRange, questionsByKp } = params;

  // 知识点题数分配（最大余额法，总和严格=totalQuestions）
  const kpWeights = kpConfig.map((k) => k.percentage);
  const kpTargets = largestRemainder(totalQuestions, kpWeights);

  // 题型配额分配（最大余额法）
  const typeWeights = TYPE_ORDER.map((t) => typeRatios[t] || 0);
  const typeTargetsArr = largestRemainder(totalQuestions, typeWeights);
  const typeQuota: Record<QuestionType, number> = {
    single_choice: 0,
    multiple_choice: 0,
    fill_blank: 0,
    true_false: 0,
    short_answer: 0,
    design: 0,
  };
  TYPE_ORDER.forEach((t, i) => (typeQuota[t] = typeTargetsArr[i]));

  const selected: Question[] = [];
  const usedQuestionIds = new Set<string>();
  const gaps: { kpId: string; target: number; actual: number }[] = [];

  // 混合模式：按四川专升本 3:3:3:1 分配难度配额
  const diffQuotas =
    difficultyRange === "mixed"
      ? DIFF_ORDER.reduce(
          (acc, d, i) => ({ ...acc, [d]: largestRemainder(totalQuestions, DIFF_WEIGHTS)[i] }),
          {} as Record<Difficulty, number>
        )
      : null;
  const diffUsed: Record<Difficulty, number> = { easy: 0, medium_easy: 0, medium: 0, hard: 0 };

  const poolFilter = (q: Question) => {
    if (difficultyRange === "mixed") return true;
    return q.difficulty === difficultyRange;
  };
  const sortPool = (pool: Question[]) =>
    [...pool].sort((a, b) => {
      if (a.usage_count !== b.usage_count) return a.usage_count - b.usage_count;
      const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return ta - tb;
    });

  // 按知识点分配
  kpConfig.forEach((kp, idx) => {
    const target = kpTargets[idx];
    const pool = sortPool(
      (questionsByKp[kp.kpId] || []).filter((q) => !usedQuestionIds.has(q.id) && poolFilter(q))
    );

    let picked = 0;
    // 先按题型配额 + 难度配额挑
    for (const q of pool) {
      if (picked >= target) break;
      const usedOfType = selected.filter((s) => s.question_type === q.question_type).length;
      if (usedOfType >= typeQuota[q.question_type]) continue;
      // 混合模式：优先选难度配额尚未用完的题
      if (diffQuotas && diffUsed[q.difficulty] >= diffQuotas[q.difficulty]) continue;
      selected.push(q);
      usedQuestionIds.add(q.id);
      diffUsed[q.difficulty] = (diffUsed[q.difficulty] || 0) + 1;
      picked++;
    }
    // 配额满了还没取够，从池里补（不再卡难度配额）
    for (const q of pool) {
      if (picked >= target) break;
      if (!usedQuestionIds.has(q.id)) {
        selected.push(q);
        usedQuestionIds.add(q.id);
        diffUsed[q.difficulty] = (diffUsed[q.difficulty] || 0) + 1;
        picked++;
      }
    }
    if (picked < target) gaps.push({ kpId: kp.kpId, target, actual: picked });
  });

  // 硬性校验：如果少于 totalQuestions，从所有可用题中随机补
  if (selected.length < totalQuestions) {
    const allPool: Question[] = [];
    for (const kp of kpConfig) {
      for (const q of (questionsByKp[kp.kpId] || [])) {
        if (!usedQuestionIds.has(q.id) && poolFilter(q)) allPool.push(q);
      }
    }
    const shuffled = sortPool(allPool);
    for (const q of shuffled) {
      if (selected.length >= totalQuestions) break;
      selected.push(q);
      usedQuestionIds.add(q.id);
    }
  }

  // 硬性校验：如果多于 totalQuestions，随机剔除多余
  if (selected.length > totalQuestions) {
    selected.length = totalQuestions;
  }

  return { selected, gaps };
}
