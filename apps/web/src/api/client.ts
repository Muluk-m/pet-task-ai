import type {
  AddStepInput,
  AiExtractInput,
  AiTaskExtraction,
  ChangePasswordInput,
  CompleteStepInput,
  CreateTaskInput,
  GenerateImageInput,
  GenerateReviewInput,
  LoginInput,
  PushSubscribeInput,
  QueuedImageGenerateInput,
  RegisterInput,
  SaveGeneratedImageInput,
  UpdateProfileInput,
  UpdateTaskInput,
} from "@pet-task-ai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../components/toast";
import { getSelectedAiModel } from "../lib/ai-model";
import { toDbTimestamp } from "../lib/format";
import type {
  AiModelConfig,
  GeneratedContent,
  ImageGenerationJob,
  ImageQueueConfig,
  Material,
  Task,
  TaskStatus,
  TaskStep,
  TaskWithSteps,
} from "./types";

export const IMAGE_JOB_POLL_INTERVAL_MS = 2500;

export type CurrentUser = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === "string") {
      return err;
    }
    // zValidator 默认 400 的 error 是序列化的 ZodError，取第一条 issue 而不是 [object Object]
    if (err && typeof err === "object") {
      const issues = (
        err as { issues?: Array<{ message?: string; path?: unknown[] }> }
      ).issues;
      const first = issues?.[0];
      if (first?.message) {
        const path =
          Array.isArray(first.path) && first.path.length > 0
            ? `${first.path.join(".")}: `
            : "";
        return `${path}${first.message}`;
      }
    }
  }
  return `请求失败 (${status})`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(extractErrorMessage(data, res.status));
  }

  return data as T;
}

function postJson<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  return api<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    retry: false,
    queryFn: async (): Promise<CurrentUser | null> => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`请求失败 (${res.status})`);
      }
      const data = (await res.json()) as { user: CurrentUser };
      return data.user;
    },
  });
}

/**
 * 登录/注册后刷新当前用户的所有数据：["me"] 已由响应直接写入，无需重拉；
 * 其余用户数据 query 精确失效即可，避免无参 invalidateQueries() 连带重发 ["me"] 造成瀑布。
 */
function invalidateUserData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== "me",
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      postJson<{ user: CurrentUser }>("/api/auth/login", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data.user);
      invalidateUserData(queryClient);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      postJson<{ user: CurrentUser }>("/api/auth/register", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data.user);
      invalidateUserData(queryClient);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      postJson<{ user: CurrentUser }>("/api/auth/profile", input, "PATCH"),
    onSuccess: (data) => queryClient.setQueryData(["me"], data.user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      postJson<{ ok: boolean }>("/api/auth/password", input),
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<{ user: CurrentUser }>("/api/auth/avatar", {
        method: "POST",
        body: form,
      });
    },
    onSuccess: (data) => queryClient.setQueryData(["me"], data.user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postJson<{ ok: boolean }>("/api/auth/logout", {}),
    onSuccess: () => {
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
    },
  });
}

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ tasks: TaskWithSteps[] }>("/api/tasks"),
  });
}

export function useTask(taskId: number | null) {
  return useQuery({
    queryKey: ["tasks", taskId],
    enabled: taskId !== null,
    queryFn: () => api<{ task: TaskWithSteps }>(`/api/tasks/${taskId}`),
  });
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["tasks"] });
}

/** 乐观地把单个 step 改成目标状态，并按剩余 pending 步骤同步任务展示状态（最终仍以服务端 recomputeTaskStatus 为准） */
function applyStepMutation(
  task: TaskWithSteps,
  stepId: number,
  patch: Partial<TaskStep>,
): TaskWithSteps {
  const steps = task.steps.map((step) =>
    step.id === stepId ? { ...step, ...patch } : step,
  );
  const hasPending = steps.some((step) => step.status === "pending");
  const hasCompleted = steps.some((step) => step.status === "completed");
  // 归档任务不参与自动完成判定；其余按剩余 pending 推导 active/completed
  const status: TaskStatus =
    task.status === "archived"
      ? task.status
      : !hasPending && hasCompleted
        ? "completed"
        : "active";
  // completedAt 与 status 同步预测（服务端 recomputeTaskStatus 也会同步写/清），
  // 否则「本月返现」等依赖 completedAt 的统计在乐观窗口内会漏计/多计
  const completedAt =
    task.status === "archived"
      ? task.completedAt
      : status === "completed"
        ? (task.completedAt ?? toDbTimestamp())
        : null;
  return { ...task, steps, status, completedAt };
}

/**
 * 高频步骤操作的乐观更新：先本地改 ["tasks"] 列表与 ["tasks", id] 详情两处缓存，
 * onError 回滚快照，onSettled 再 invalidate 拉服务端真值（任务完成判定唯一入口在服务端）。
 */
function useStepMutation<TInput extends { stepId: number }>(
  taskId: number,
  mutationFn: (input: TInput) => Promise<{ ok: boolean }>,
  buildPatch: (input: TInput) => Partial<TaskStep>,
) {
  const queryClient = useQueryClient();
  const invalidateTasks = useInvalidateTasks();
  return useMutation({
    mutationFn,
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousList = queryClient.getQueryData<{ tasks: TaskWithSteps[] }>(
        ["tasks"],
      );
      const previousDetail = queryClient.getQueryData<{ task: TaskWithSteps }>([
        "tasks",
        taskId,
      ]);
      const patch = buildPatch(input);

      queryClient.setQueryData<{ tasks: TaskWithSteps[] }>(
        ["tasks"],
        (current) =>
          current
            ? {
                tasks: current.tasks.map((task) =>
                  task.id === taskId
                    ? applyStepMutation(task, input.stepId, patch)
                    : task,
                ),
              }
            : current,
      );
      queryClient.setQueryData<{ task: TaskWithSteps }>(
        ["tasks", taskId],
        (current) =>
          current
            ? { task: applyStepMutation(current.task, input.stepId, patch) }
            : current,
      );

      return { previousList, previousDetail };
    },
    onError: (error, _input, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(["tasks"], context.previousList);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(["tasks", taskId], context.previousDetail);
      }
      // 乐观 UI 已回滚，必须让用户知道操作没生效
      toast(
        error instanceof Error ? error.message : "操作失败，请重试",
        "error",
      );
    },
    onSettled: invalidateTasks,
  });
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      postJson<{ task: Task }>("/api/tasks", input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask(taskId: number) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: UpdateTaskInput) =>
      postJson<{ task: Task }>(`/api/tasks/${taskId}`, input, "PATCH"),
    onSuccess: invalidate,
  });
}

export function uploadTaskCover(taskId: number, formData: FormData) {
  return api<{ task: Task }>(`/api/tasks/${taskId}/cover`, {
    method: "POST",
    body: formData,
  });
}

export function useArchiveTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (taskId: number) =>
      postJson<{ task: Task }>(`/api/tasks/${taskId}/archive`, {}),
    onSuccess: invalidate,
  });
}

export function useUnarchiveTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (taskId: number) =>
      postJson<{ ok: boolean }>(`/api/tasks/${taskId}/unarchive`, {}),
    onSuccess: invalidate,
  });
}

export function useCompleteStep(taskId: number) {
  return useStepMutation<CompleteStepInput & { stepId: number }>(
    taskId,
    ({ stepId, ...input }) =>
      postJson<{ ok: boolean }>(
        `/api/tasks/${taskId}/steps/${stepId}/complete`,
        input,
      ),
    (input) => ({
      status: "completed",
      completedAt: toDbTimestamp(),
      resultUrl: input.resultUrl ?? null,
      resultText: input.resultText ?? null,
    }),
  );
}

export function useUndoStep(taskId: number) {
  return useStepMutation<{ stepId: number }>(
    taskId,
    ({ stepId }) =>
      postJson<{ ok: boolean }>(
        `/api/tasks/${taskId}/steps/${stepId}/undo`,
        {},
      ),
    () => ({
      status: "pending",
      completedAt: null,
      resultUrl: null,
      resultText: null,
      retainUntil: null,
    }),
  );
}

export function useAddStep(taskId: number) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: AddStepInput) =>
      postJson<{ step: unknown }>(`/api/tasks/${taskId}/steps`, input),
    onSuccess: invalidate,
  });
}

export function useReorderSteps(taskId: number) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (stepIds: number[]) =>
      postJson<{ ok: boolean }>(
        `/api/tasks/${taskId}/steps/order`,
        { stepIds },
        "PUT",
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteStep(taskId: number) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (stepId: number) =>
      api<{ ok: boolean }>(`/api/tasks/${taskId}/steps/${stepId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}

export function useGenerateImage() {
  // 生图只返回草稿 data URL，不落库；真正入库在用户确认后走 useUploadMaterial
  return useMutation({
    mutationFn: (input: GenerateImageInput) =>
      postJson<{ image: string }>("/api/ai/generate-image", input),
  });
}

export function useImageQueueConfig() {
  return useQuery({
    queryKey: ["image-queue-config"],
    queryFn: () => api<ImageQueueConfig>("/api/ai/image-queue-config"),
  });
}

export function useImageJobs() {
  return useQuery({
    queryKey: ["image-jobs"],
    queryFn: () => api<{ jobs: ImageGenerationJob[] }>("/api/ai/image-jobs"),
  });
}

export function useSubmitImageJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QueuedImageGenerateInput) =>
      postJson<{ job: ImageGenerationJob }>("/api/ai/image-jobs", input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["image-jobs"] }),
  });
}

export function useRefreshImageJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      postJson<{ job: ImageGenerationJob }>(
        `/api/ai/image-jobs/${id}/refresh`,
        {},
      ),
    onSuccess: (data) => {
      queryClient.setQueryData<{ jobs: ImageGenerationJob[] }>(
        ["image-jobs"],
        (current) => {
          if (!current) {
            return current;
          }
          return {
            jobs: current.jobs.map((job) =>
              job.id === data.job.id ? data.job : job,
            ),
          };
        },
      );
    },
  });
}

export function useCancelImageJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      postJson<{ job: ImageGenerationJob }>(
        `/api/ai/image-jobs/${id}/cancel`,
        {},
        "PUT",
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["image-jobs"] }),
  });
}

export function useDeleteImageJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<{ ok: boolean }>(`/api/ai/image-jobs/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["image-jobs"] }),
  });
}

export function useSaveGeneratedImage(jobId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGeneratedImageInput) =>
      postJson<{ material: Material }>(
        `/api/ai/image-jobs/${jobId}/save`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

export function useMaterials() {
  return useQuery({
    queryKey: ["materials"],
    queryFn: () => api<{ materials: Material[] }>("/api/materials"),
  });
}

export function useUploadMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      api<{ material: Material }>("/api/materials", {
        method: "POST",
        body: formData,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["materials"] }),
  });
}

export function useDeleteMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<{ ok: boolean }>(`/api/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["materials"] }),
  });
}

export function useExtractTask() {
  return useMutation({
    mutationFn: (input: AiExtractInput) =>
      postJson<{ extraction: AiTaskExtraction }>("/api/ai/extract-task", {
        ...input,
        aiModel: getSelectedAiModel(),
      }),
  });
}

export function useGenerateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateReviewInput) =>
      postJson<{ generated: GeneratedContent }>("/api/ai/generate-review", {
        ...input,
        aiModel: getSelectedAiModel(),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["generations"] }),
  });
}

export function useAiModelConfig() {
  return useQuery({
    queryKey: ["ai-model-config"],
    queryFn: () => api<AiModelConfig>("/api/ai/model-config"),
  });
}

export function useGenerations() {
  return useQuery({
    queryKey: ["generations"],
    queryFn: () =>
      api<{ generations: GeneratedContent[] }>("/api/ai/generations"),
  });
}

export function usePushSubscribe() {
  return useMutation({
    mutationFn: (input: PushSubscribeInput) =>
      postJson<{ ok: boolean }>("/api/push/subscribe", input),
  });
}

export function usePushUnsubscribe() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      postJson<{ ok: boolean }>("/api/push/unsubscribe", { endpoint }),
  });
}
