import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskWithSteps } from "../api/types";
import { TaskDetailPage } from "./TaskDetailPage";

const { useTask, mutation } = vi.hoisted(() => ({
  useTask: vi.fn(),
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock("../api/client", () => ({
  useTask: (...args: unknown[]) => useTask(...args),
  useAddStep: mutation,
  useArchiveTask: mutation,
  useCompleteStep: mutation,
  useDeleteStep: mutation,
  useReorderSteps: mutation,
  useUndoStep: mutation,
}));

const task: TaskWithSteps = {
  id: 42,
  title: "测试任务",
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
  createdAt: "2026-07-11 10:00:00",
  updatedAt: "2026-07-11 10:00:00",
  completedAt: null,
  steps: [
    {
      id: 1,
      taskId: 42,
      type: "delivery",
      title: "下单到货",
      requirement: null,
      platform: null,
      sortOrder: 0,
      status: "pending",
      resultUrl: null,
      resultText: null,
      completedAt: null,
      createdAt: "2026-07-11 10:00:00",
    },
  ],
};

describe("TaskDetailPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useTask.mockReset();
  });

  it("renders after a newly-created task finishes loading", () => {
    useTask.mockReturnValue({ data: undefined, isLoading: true });
    const view = render(
      <MemoryRouter initialEntries={["/tasks/42"]}>
        <Routes>
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("加载中...")).toBeTruthy();

    useTask.mockReturnValue({ data: { task }, isLoading: false });
    view.rerender(
      <MemoryRouter initialEntries={["/tasks/42"]}>
        <Routes>
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "测试任务" })).toBeTruthy();
  });
});
