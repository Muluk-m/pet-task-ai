import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskStep, TaskWithSteps } from "../api/types";
import { cashbackWaitDays, isWaitingCashback } from "./cashback";

function step(partial: Partial<TaskStep>): TaskStep {
  return {
    id: 1,
    taskId: 1,
    type: "delivery",
    title: "",
    requirement: null,
    platform: null,
    sortOrder: 0,
    status: "pending",
    resultUrl: null,
    resultText: null,
    retainUntil: null,
    completedAt: null,
    createdAt: "2026-07-01 10:00:00",
    ...partial,
  };
}

function task(
  partial: Partial<TaskWithSteps> & { steps: TaskStep[] },
): TaskWithSteps {
  return {
    id: 1,
    title: "任务",
    merchantName: null,
    productName: null,
    ruleText: null,
    status: "active",
    cashbackAmount: null,
    deadline: null,
    coverImageUrl: null,
    trackingNo: null,
    note: null,
    orderChannel: null,
    createdAt: "2026-07-01 10:00:00",
    updatedAt: "2026-07-01 10:00:00",
    completedAt: null,
    ...partial,
  };
}

describe("isWaitingCashback", () => {
  it("is true only when the sole remaining pending step is cashback", () => {
    expect(
      isWaitingCashback(
        task({
          steps: [
            step({ id: 1, type: "delivery", status: "completed" }),
            step({ id: 2, type: "cashback", status: "pending" }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is false when another content step is still pending", () => {
    expect(
      isWaitingCashback(
        task({
          steps: [
            step({ id: 1, type: "xiaohongshu_note", status: "pending" }),
            step({ id: 2, type: "cashback", status: "pending" }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("is false for non-active tasks", () => {
    expect(
      isWaitingCashback(
        task({
          status: "completed",
          steps: [step({ id: 1, type: "cashback", status: "completed" })],
        }),
      ),
    ).toBe(false);
  });
});

describe("cashbackWaitDays", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 本地时间 2026-07-11 12:00
    vi.setSystemTime(new Date(2026, 6, 11, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts calendar days since the last non-cashback completion", () => {
    // 好评步骤完成于 UTC 2026-07-04 正午（选正午：任意时区（±12h）解析后仍是同一日历日）→ 距今 7 天
    const days = cashbackWaitDays(
      task({
        steps: [
          step({
            id: 1,
            type: "ecommerce_review",
            status: "completed",
            completedAt: "2026-07-04 12:00:00",
          }),
          step({ id: 2, type: "cashback", status: "pending" }),
        ],
      }),
    );
    expect(days).toBe(7);
  });

  it("uses the latest completion when several steps are done", () => {
    const days = cashbackWaitDays(
      task({
        steps: [
          step({
            id: 1,
            type: "delivery",
            status: "completed",
            completedAt: "2026-07-01 12:00:00",
          }),
          step({
            id: 2,
            type: "xiaohongshu_note",
            status: "completed",
            completedAt: "2026-07-09 12:00:00",
          }),
          step({ id: 3, type: "cashback", status: "pending" }),
        ],
      }),
    );
    expect(days).toBe(2);
  });

  it("returns null for tasks that are not waiting on cashback", () => {
    const days = cashbackWaitDays(
      task({
        steps: [
          step({ id: 1, type: "xiaohongshu_note", status: "pending" }),
          step({ id: 2, type: "cashback", status: "pending" }),
        ],
      }),
    );
    expect(days).toBeNull();
  });
});
