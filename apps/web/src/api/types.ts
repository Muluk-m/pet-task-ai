import type {
  MaterialType,
  ReviewPlatform,
  ReviewStyle,
  TaskStepType,
} from "@pet-task-ai/shared";

export type TaskStatus = "active" | "completed" | "archived";
export type StepStatus = "pending" | "completed";

export type TaskStep = {
  id: number;
  taskId: number;
  type: TaskStepType;
  title: string;
  requirement: string | null;
  status: StepStatus;
  resultUrl: string | null;
  resultText: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type Task = {
  id: number;
  title: string;
  merchantName: string | null;
  productName: string | null;
  ruleText: string | null;
  status: TaskStatus;
  cashbackAmount: number | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskWithSteps = Task & { steps: TaskStep[] };

export type Material = {
  id: number;
  type: MaterialType;
  title: string;
  content: string | null;
  assetUrl: string | null;
  assetMimeType: string | null;
  tags: string[];
  createdAt: string;
};

export type GeneratedContent = {
  id: number;
  taskId: number | null;
  platform: ReviewPlatform;
  style: ReviewStyle;
  wordCount: number | null;
  content: string;
  createdAt: string;
};
