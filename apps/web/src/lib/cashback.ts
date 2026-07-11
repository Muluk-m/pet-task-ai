import type { TaskWithSteps } from "../api/types";
import { parseDbDate } from "./format";

/** 待回款等待超过此天数即视为「催办」，用警示色标注 */
export const CASHBACK_WAIT_ALERT_DAYS = 7;

/**
 * 待回款任务：进行中，且唯一剩余的 pending 步骤是 cashback（其余步骤全部完成）。
 * 内容义务都已履行，只差客服确认返现。
 */
export function isWaitingCashback(task: TaskWithSteps): boolean {
  if (task.status !== "active") {
    return false;
  }
  const pending = task.steps.filter((step) => step.status === "pending");
  return (
    pending.length > 0 && pending.every((step) => step.type === "cashback")
  );
}

function startOfLocalDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/**
 * 待回款已等待的天数：起点为除 cashback 外最后一个完成步骤的 completedAt。
 * 非待回款任务、或找不到起点时返回 null。按本地日历日取整。
 */
export function cashbackWaitDays(task: TaskWithSteps): number | null {
  if (!isWaitingCashback(task)) {
    return null;
  }
  let latest: number | null = null;
  for (const step of task.steps) {
    if (
      step.type !== "cashback" &&
      step.status === "completed" &&
      step.completedAt
    ) {
      const at = parseDbDate(step.completedAt).getTime();
      if (latest === null || at > latest) {
        latest = at;
      }
    }
  }
  if (latest === null) {
    return null;
  }
  const days = Math.floor(
    (startOfLocalDay(new Date()) - startOfLocalDay(new Date(latest))) /
      86_400_000,
  );
  return Math.max(0, days);
}
