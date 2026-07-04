import { describe, expect, it } from "vitest";
import type { TaskStep, TaskWithSteps } from "../api/types";
import { taskNextAction } from "./HomePage";

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
    completedAt: null,
    createdAt: "2026-07-04 10:00:00",
    ...partial,
  };
}

function task(steps: TaskStep[]): TaskWithSteps {
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
    createdAt: "2026-07-04 10:00:00",
    updatedAt: "2026-07-04 10:00:00",
    completedAt: null,
    steps,
  };
}

describe("taskNextAction", () => {
  it("marks ecommerce review as a quick-action step", () => {
    const action = taskNextAction(
      task([
        step({ id: 1, type: "delivery", status: "completed" }),
        step({ id: 2, type: "ecommerce_review", status: "pending" }),
        step({ id: 3, type: "cashback", status: "pending" }),
      ]),
    );

    expect(action.firstPending?.type).toBe("ecommerce_review");
    expect(action.waitingReview).toBe(true);
    expect(action.waitingDelivery).toBe(false);
    expect(action.waitingCashback).toBe(false);
  });
});
