import { z } from "zod";
import rawConfig from "../../../../pt.config.json";

const providerSchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1),
});

const configSchema = z.object({
  ai: z.object({
    activeProvider: z.string().min(1),
    providers: z.record(providerSchema),
  }),
  push: z.object({
    vapidPublicKey: z.string().min(1),
    vapidSubject: z.string().min(1),
    reminderDaysAhead: z.number().int().min(0),
  }),
});

export const ptConfig = configSchema.parse(rawConfig);

export type AiProvider = z.infer<typeof providerSchema>;

export function getAiProvider(): AiProvider {
  const provider = ptConfig.ai.providers[ptConfig.ai.activeProvider];
  if (!provider) {
    throw new Error(
      `pt.config.json 配置错误：未找到 AI provider "${ptConfig.ai.activeProvider}"`,
    );
  }
  return provider;
}

export function getAiApiKey(env: unknown): string | null {
  const provider = getAiProvider();
  const value = (env as Record<string, unknown>)[provider.apiKeyEnv];
  return typeof value === "string" && value.length > 0 ? value : null;
}
