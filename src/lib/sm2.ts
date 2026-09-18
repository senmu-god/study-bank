/**
 * SM-2 间隔重复算法（简化版）。
 * 复习间隔阶梯：答错后从 1 天开始，依次 3 / 7 / 15 / 30 天。
 */

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 15, 30];

export interface Sm2State {
  ease_factor: number;
  interval_step: number; // 当前在第几个复习间隔
  wrong_count: number;
}

export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * 答错时：重置间隔到第 1 天，衰减 ease_factor（不低于 1.3）。
 */
export function onWrong(state: { ease_factor: number; interval_step: number }) {
  const ease_factor = Math.max(1.3, state.ease_factor - 0.2);
  const interval_step = 0; // 下一次复习 1 天后
  return {
    ease_factor,
    interval_step,
    next_review_at: daysFromNow(REVIEW_INTERVALS_DAYS[0]),
  };
}

/**
 * 复习答对时：进入下一个间隔阶梯，ease_factor 按 SM-2 公式微调。
 */
export function onCorrectReview(state: { ease_factor: number; interval_step: number }) {
  // quality = 4（答对），delta = 0.1 - (5-4)*(0.08 + (5-4)*0.02) = 0
  const ease_factor = Math.max(1.3, state.ease_factor);
  const nextStep = Math.min(state.interval_step + 1, REVIEW_INTERVALS_DAYS.length - 1);
  return {
    ease_factor,
    interval_step: nextStep,
    next_review_at: daysFromNow(REVIEW_INTERVALS_DAYS[nextStep]),
  };
}
