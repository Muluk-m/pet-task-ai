import type { ImageQueueProvider } from "@pet-task-ai/shared";
import type { AiModelOption, ImageQueueModel } from "../api/types";

export type AiModelOptionWithProvider = AiModelOption & { providerId: string };

export type AiModelConfigLike = {
  defaultModel?: string;
  providers?: Array<{
    id: string;
    models?: AiModelOption[];
  }>;
};

export type ImageQueueConfigLike = {
  defaultModel?: string;
  defaultProvider?: ImageQueueProvider;
  providers?: Array<{
    id: ImageQueueProvider;
    models?: ImageQueueModel[];
  }>;
  models?: ImageQueueModel[];
};

export function flattenAiModelOptions(
  config: AiModelConfigLike | null | undefined,
): AiModelOptionWithProvider[] {
  return (
    config?.providers?.flatMap((provider) =>
      (provider.models ?? []).map((model) => ({
        ...model,
        providerId: provider.id,
      })),
    ) ?? []
  );
}

export function flattenImageQueueModels(
  config: ImageQueueConfigLike | null | undefined,
): ImageQueueModel[] {
  return (
    config?.providers?.flatMap((provider) =>
      (provider.models ?? []).map((model) => ({ ...model })),
    ) ??
    config?.models ??
    []
  );
}
