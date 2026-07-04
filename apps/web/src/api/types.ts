import type {
  ContentGenerationMode,
  ImageJobStatus,
  ImageQueueProvider,
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
  platform: string | null;
  sortOrder: number;
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
  coverImageUrl: string | null;
  trackingNo: string | null;
  note: string | null;
  orderChannel: string | null;
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
  contentMode: ContentGenerationMode;
  platform: ReviewPlatform;
  style: ReviewStyle;
  wordCount: number | null;
  content: string;
  createdAt: string;
};

export type AiModelOption = {
  id: string;
  ref: string;
  label: string;
  description: string | null;
  supportsVision: boolean;
};

export type AiProviderOption = {
  id: string;
  models: AiModelOption[];
};

export type AiModelConfig = {
  defaultModel: string;
  providers: AiProviderOption[];
};

export type ImageQueueModel = {
  provider: ImageQueueProvider;
  model: string;
  label: string;
  description: string | null;
  channelLabel?: string;
  capabilities?: string[];
};

export type ImageQueueProviderOption = {
  id: ImageQueueProvider;
  models: ImageQueueModel[];
};

export type ImageQueueConfig = {
  enabled: boolean;
  defaultProvider: ImageQueueProvider;
  defaultModel: string;
  providers: ImageQueueProviderOption[];
  models: ImageQueueModel[];
};

export type ImageJobResultImage = {
  index: number;
  mime: string;
  revised_prompt?: string;
  width?: number;
  height?: number;
};

export type ImageJobResult = {
  images?: ImageJobResultImage[];
  actual_params?: { size?: string; quality?: string };
  raw_image_urls?: string[];
};

export type ImageGenerationJob = {
  id: number;
  userId: number | null;
  externalRequestId: string;
  provider: ImageQueueProvider;
  model: string;
  prompt: string;
  size: string;
  quality: string | null;
  status: ImageJobStatus;
  errorMessage: string | null;
  resultJson: ImageJobResult | null;
  savedMaterialIds: number[];
  submittedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: string;
  updatedAt: string;
};
