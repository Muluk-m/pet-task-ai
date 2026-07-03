import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskStep, TaskWithSteps } from "../api/types";
import { StatusPill, StepRail, deadlineBadgeText, taskProgress } from "./bits";

function step(partial: Partial<TaskStep>): TaskStep {
  return {
    id: 1,
    taskId: 1,
    type: "xiaohongshu_note",
    title: "",
    requirement: null,
    status: "pending",
    resultUrl: null,
    resultText: null,
    completedAt: null,
    createdAt: "2025-05-20 10:00:00",
    ...partial,
  };
}

describe("StepRail", () => {
  it("renders the four content step labels", () => {
    render(
      <StepRail
        steps={[
          step({ id: 1, type: "xiaohongshu_note", status: "completed" }),
          step({ id: 2, type: "cashback" }),
        ]}
      />,
    );
    expect(screen.getByText("小红书")).toBeDefined();
    expect(screen.getByText("抖音")).toBeDefined();
    expect(screen.getByText("好评")).toBeDefined();
    expect(screen.getByText("返现")).toBeDefined();
  });
});

describe("StatusPill", () => {
  it("renders the status label", () => {
    render(<StatusPill status="active" />);
    expect(screen.getByText("进行中")).toBeDefined();
  });
});

describe("taskProgress", () => {
  it("computes percent from completed steps", () => {
    const task = {
      steps: [
        { status: "completed" },
        { status: "completed" },
        { status: "pending" },
        { status: "pending" },
      ],
    } as TaskWithSteps;
    expect(taskProgress(task)).toEqual({ done: 2, total: 4, percent: 50 });
  });

  it("returns 0 percent for a task without steps", () => {
    const task = { steps: [] } as unknown as TaskWithSteps;
    expect(taskProgress(task).percent).toBe(0);
  });
});

describe("deadlineBadgeText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 20, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps deadlines to badge text", () => {
    expect(deadlineBadgeText(null)).toBeNull();
    expect(deadlineBadgeText("2025-05-19")).toBe("已逾期");
    expect(deadlineBadgeText("2025-05-20")).toBe("今天截止");
    expect(deadlineBadgeText("2025-05-21")).toBe("明天截止");
    expect(deadlineBadgeText("2025-05-23")).toBe("3天后截止");
  });
});
