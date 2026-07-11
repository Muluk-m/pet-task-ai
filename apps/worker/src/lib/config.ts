import { LEGACY_MODEL_ALIASES } from "@pet-task-ai/shared";
import { z } from "zod";
import rawConfig from "../../../../pt.config.json";

const providerSchema = z.object({
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().min(1),
  models: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
        supportsVision: z.boolean().default(false),
      }),
    )
    .min(1),
});

const imageQueueModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string().min(1)).optional(),
});

const imageQueueProviderSchema = z.object({
  models: z.array(imageQueueModelSchema).min(1),
});

const imageQueueChannelSchema = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  label: z.string().min(1),
  models: z.array(imageQueueModelSchema).min(1),
  defaults: z.record(z.unknown()).optional(),
});

const configSchema = z.object({
  ai: z.object({
    activeProvider: z.string().min(1),
    providers: z.record(providerSchema),
  }),
  imageQueue: z
    .object({
      baseUrl: z.string().url().optional(),
      activeChannel: z.string().min(1).optional(),
      channels: z.array(imageQueueChannelSchema).optional(),
      activeProvider: z.string().min(1).optional(),
      providers: z.record(imageQueueProviderSchema).optional(),
    })
    .optional(),
  push: z.object({
    vapidPublicKey: z.string().min(1),
    vapidSubject: z.string().min(1),
    reminderDaysAhead: z.number().int().min(0),
  }),
});

export const ptConfig = configSchema.parse(rawConfig);

export type AiProvider = z.infer<typeof providerSchema>;
export type AiModel = AiProvider["models"][number];
export type AiModelSelection = {
  providerId: string;
  provider: AiProvider;
  model: AiModel;
};
export type ImageQueueConfig = NonNullable<typeof ptConfig.imageQueue>;
export type ImageQueueChannel = z.infer<typeof imageQueueChannelSchema>;

export function getImageQueueChannels(
  config: ImageQueueConfig,
): ImageQueueChannel[] {
  if (config.channels?.length) {
    return config.channels;
  }
  return Object.entries(config.providers ?? {}).map(
    ([providerId, provider]) => ({
      id: providerId,
      kind: providerId,
      label: providerId,
      models: provider.models,
    }),
  );
}

export function getImageQueueModels(channels: ImageQueueChannel[]) {
  return channels.flatMap((channel) =>
    channel.models
      .map((model) => {
        const provider =
          channel.kind === "openai-compat" || channel.kind === "openai-queue"
            ? "openai-compat"
            : channel.kind === "gemini" || channel.kind === "gemini-queue"
              ? "gemini"
              : null;
        return provider
          ? {
              provider,
              channelId: channel.id,
              model: model.id,
              label: model.label,
              description: model.description ?? null,
              channelLabel: channel.label,
              capabilities: model.capabilities ?? [],
            }
          : null;
      })
      .filter((model) => model !== null),
  );
}

export function getDefaultImageQueueModel(config: ImageQueueConfig) {
  const channels = getImageQueueChannels(config);
  const activeChannel =
    channels.find(
      (channel) =>
        channel.id === (config.activeChannel ?? config.activeProvider),
    ) ?? channels[0];
  const model = activeChannel?.models[0];
  return model
    ? {
        provider:
          activeChannel.kind === "gemini" ||
          activeChannel.kind === "gemini-queue"
            ? "gemini"
            : "openai-compat",
        model: model.id,
      }
    : null;
}

export function getAiProvider(): AiProvider {
  const provider = ptConfig.ai.providers[ptConfig.ai.activeProvider];
  if (!provider) {
    throw new Error(
      `pt.config.json 配置错误：未找到 AI provider "${ptConfig.ai.activeProvider}"`,
    );
  }
  return provider;
}

export function getAiApiKey(
  env: unknown,
  provider = getAiProvider(),
): string | null {
  const value = (env as Record<string, unknown>)[provider.apiKeyEnv];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getDefaultAiModel(): AiModelSelection {
  const provider = getAiProvider();
  return {
    providerId: ptConfig.ai.activeProvider,
    provider,
    model: provider.models[0],
  };
}

export function getAiModelByRef(ref?: string | null): AiModelSelection | null {
  if (!ref) {
    return null;
  }
  const [providerId, modelId] = ref.split(":");
  if (!providerId || !modelId) {
    return null;
  }
  const provider = ptConfig.ai.providers[providerId];
  const resolvedId = provider?.models.some((item) => item.id === modelId)
    ? modelId
    : LEGACY_MODEL_ALIASES[modelId];
  const model = provider?.models.find((item) => item.id === resolvedId);
  return provider && model ? { providerId, provider, model } : null;
}

export function getAiModelFallbacks(
  preferred?: string | null,
  options?: { requiresVision?: boolean },
): AiModelSelection[] {
  const requiresVision = options?.requiresVision ?? false;
  const seen = new Set<string>();
  const candidates: AiModelSelection[] = [];
  const add = (selection: AiModelSelection | null) => {
    if (!selection) {
      return;
    }
    const key = `${selection.providerId}:${selection.model.id}`;
    if (seen.has(key) || (requiresVision && !selection.model.supportsVision)) {
      return;
    }
    seen.add(key);
    candidates.push(selection);
  };

  add(getAiModelByRef(preferred));
  add(getDefaultAiModel());
  for (const [providerId, provider] of Object.entries(ptConfig.ai.providers)) {
    for (const model of provider.models) {
      add({ providerId, provider, model });
    }
  }
  return candidates;
}

export function getPublicAiModelConfig() {
  return {
    defaultModel: `${ptConfig.ai.activeProvider}:${getAiProvider().models[0].id}`,
    providers: Object.entries(ptConfig.ai.providers).map(
      ([providerId, provider]) => ({
        id: providerId,
        models: provider.models.map((model) => ({
          id: model.id,
          ref: `${providerId}:${model.id}`,
          label: model.label,
          description: model.description ?? null,
          supportsVision: model.supportsVision,
        })),
      }),
    ),
  };
}

export function getImageQueueConfig(): ImageQueueConfig | null {
  const config = ptConfig.imageQueue;
  return config?.baseUrl ? (config as ImageQueueConfig) : null;
}
