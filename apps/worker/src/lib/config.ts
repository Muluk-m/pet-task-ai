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
  provider: z.enum(["openai-compat", "gemini"]),
  model: z.string().min(1),
  label: z.string().min(1),
});

const configSchema = z.object({
  ai: z.object({
    activeProvider: z.string().min(1),
    providers: z.record(providerSchema),
  }),
  imageQueue: z
    .object({
      baseUrl: z.string().url().optional(),
      defaultProvider: z.enum(["openai-compat", "gemini"]),
      defaultModel: z.string().min(1),
      models: z.array(imageQueueModelSchema).min(1),
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
  const model = provider?.models.find((item) => item.id === modelId);
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
