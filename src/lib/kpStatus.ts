/**
 * 知识点五态定义。
 * 与数据库 kp_state.status 的取值一一对应，不允许出现第六种状态。
 */

export type KpStatus = "new" | "learning" | "not_mastered" | "pending" | "mastered";

export interface StatusMeta {
  key: KpStatus;
  label: string;
  short: string;
  /** 深色舞台上的主色 */
  color: string;
  /** 浅色背景上的柔和底色 */
  soft: string;
  border: string;
  /** 文字色（浅色背景） */
  ink: string;
  desc: string;
  /** 状态分值，用于章节进度加权 */
  score: number;
}

export const KP_STATUS: Record<KpStatus, StatusMeta> = {
  new: {
    key: "new",
    label: "未学习",
    short: "未学习",
    color: "#7c8aa5",
    soft: "rgba(124,138,165,0.12)",
    border: "rgba(124,138,165,0.28)",
    ink: "#55617a",
    desc: "尚未开始学习。",
    score: 0,
  },
  learning: {
    key: "learning",
    label: "学习中",
    short: "学习中",
    color: "#4a9eff",
    soft: "rgba(74,158,255,0.12)",
    border: "rgba(74,158,255,0.3)",
    ink: "#1f6fd0",
    desc: "正在进行互动教学或知识补充。",
    score: 0.3,
  },
  not_mastered: {
    key: "not_mastered",
    label: "未掌握",
    short: "未掌握",
    color: "#f2688c",
    soft: "rgba(242,104,140,0.12)",
    border: "rgba(242,104,140,0.32)",
    ink: "#c22a55",
    desc: "已有证据表明存在知识漏洞。",
    score: 0,
  },
  pending: {
    key: "pending",
    label: "待确认",
    short: "待确认",
    color: "#f0b445",
    soft: "rgba(240,180,69,0.14)",
    border: "rgba(240,180,69,0.34)",
    ink: "#a4700c",
    desc: "需要专项测试或复测进一步确认。",
    score: 0.7,
  },
  mastered: {
    key: "mastered",
    label: "已掌握",
    short: "已掌握",
    color: "#2fe0c0",
    soft: "rgba(47,224,192,0.14)",
    border: "rgba(47,224,192,0.34)",
    ink: "#0d8f76",
    desc: "通过综合评估达到掌握标准。",
    score: 1,
  },
};

/** 图例与筛选器的固定顺序：从「已掌握」到「未学习」 */
export const KP_STATUS_ORDER: KpStatus[] = [
  "mastered",
  "pending",
  "not_mastered",
  "learning",
  "new",
];

export type StatusCounts = Record<KpStatus, number>;

export function emptyCounts(): StatusCounts {
  return { new: 0, learning: 0, not_mastered: 0, pending: 0, mastered: 0 };
}

export function countStatuses(list: { status: KpStatus }[]): StatusCounts {
  const c = emptyCounts();
  for (const k of list) c[k.status] = (c[k.status] || 0) + 1;
  return c;
}

/** 学习进度 =（已掌握 + 待确认）÷ 总数，待确认计入进度但不等于掌握 */
export function progressOf(counts: StatusCounts): number {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return ((counts.mastered + counts.pending) / total) * 100;
}

export function isKpStatus(v: unknown): v is KpStatus {
  return (
    v === "new" ||
    v === "learning" ||
    v === "not_mastered" ||
    v === "pending" ||
    v === "mastered"
  );
}

/** 难度四档 → 权重（与 difficulty_score 对齐） */
export const DIFFICULTY_WEIGHT: Record<string, number> = {
  easy: 0.3,
  medium_easy: 0.5,
  medium: 0.7,
  hard: 0.9,
};

export function difficultyWeight(d: unknown): number {
  const k = String(d || "medium");
  return DIFFICULTY_WEIGHT[k] ?? 0.7;
}
