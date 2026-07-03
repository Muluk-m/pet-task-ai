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
  RegisterInput,
  UpdateProfileInput,
  UpdateTaskInput,
} from "@pet-task-ai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GeneratedContent, Material, Task, TaskWithSteps } from "./types";

export type CurrentUser = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `请求失败 (${res.status})`;
    throw new Error(message);
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

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      postJson<{ user: CurrentUser }>("/api/auth/login", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data.user);
      queryClient.invalidateQueries();
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
      queryClient.invalidateQueries();
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
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({
      stepId,
      ...input
    }: CompleteStepInput & { stepId: number }) =>
      postJson<{ ok: boolean }>(
        `/api/tasks/${taskId}/steps/${stepId}/complete`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useUndoStep(taskId: number) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (stepId: number) =>
      postJson<{ ok: boolean }>(
        `/api/tasks/${taskId}/steps/${stepId}/undo`,
        {},
      ),
    onSuccess: invalidate,
  });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateImageInput) =>
      postJson<{ material: Material }>("/api/ai/generate-image", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["materials"] }),
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
      postJson<{ extraction: AiTaskExtraction }>("/api/ai/extract-task", input),
  });
}

export function useGenerateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateReviewInput) =>
      postJson<{ generated: GeneratedContent }>(
        "/api/ai/generate-review",
        input,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["generations"] }),
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
