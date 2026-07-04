import { zValidator } from "@hono/zod-validator";
import {
  aiExtractionLogs,
  generatedContents,
  imageGenerationJobs,
  materials,
  tasks,
} from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import {
  aiExtractInputSchema,
  aiTaskExtractionSchema,
  generateImageSchema,
  generateReviewSchema,
  imageJobStatusSchema,
  queuedImageGenerateSchema,
  saveGeneratedImageSchema,
  xiaohongshuPublishPayloadSchema,
} from "@pet-task-ai/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { ASSET_URL_PREFIX, putAsset } from "../lib/assets";
import { getAiApiKey, getAiProvider, getImageQueueConfig } from "../lib/config";
import {
  chatComplete,
  dataUrlToBlob,
  extractJson,
  generateImage,
} from "../lib/openai";
import type { ChatUserContent } from "../lib/openai";

/** Uint8Array → base64（分块避免超出调用栈上限），用于把生图结果以 data URL 返回前端预览 */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type Env = {
  Bindings: {
    BUCKET: R2Bucket;
  };
  Variables: {
    db: DrizzleD1Database<typeof schema>;
    userId: number;
  };
};

type QueueSubmitResponse = {
  request_id: string;
  status: "queued";
  submitted_at: number;
};

type QueueStatusResponse = {
  request_id: string;
  status: string;
  submitted_at: number;
  started_at?: number;
  completed_at?: number;
  error?: { message: string; type?: string };
  result?: unknown;
};

const extractionSystemPrompt = `你是一个宠物商品置换活动的任务录入助手。用户会提供商家发布的活动规则——可能是文字，也可能是聊天/公告截图（或两者都有）。请仔细阅读全部文字与图片内容，提取结构化信息，仅输出一个 JSON 对象（json 格式），不要输出其他内容。

字段说明：
- title: 简短任务标题，优先用商品名（含规格），如"全价冻干狗粮 1.5kg"
- merchantName: 商家/店铺名，未提及则省略
- productName: 商品名，未提及则省略
- ruleText: 商家活动规则原文。请把与任务/返现规则相关的文字完整转录整理进来——当输入是截图时，务必把图片里的规则文字识别转录出来（保留关键条款、平台要求、返现方式与截止时间等），不要只写摘要
- requiresXiaohongshu / requiresDouyin / requiresReview / requiresCashback: 布尔值，规则中是否要求发小红书笔记 / 抖音帖子(视频) / 电商平台好评 / 有返现环节（提到返现金额即为 true）
- xiaohongshuRequirement / douyinRequirement / reviewRequirement: 对应平台的具体要求摘要（字数、图数、话题标签、时长等），未要求该平台则省略
- orderChannel: 下单渠道，"taobao"（淘宝/天猫）、"jd"（京东）、"pdd"（拼多多）、"douyin"（抖音）、"xiaohongshu"（小红书）或 "other"（其他/未明确）；好评默认发在下单渠道上
- cashbackAmount: 返现金额数字（单位元），未提及则省略
- deadline: 截止日期，格式 YYYY-MM-DD（只要日期不要时间），未提及则省略
- confidence: 0~1 之间的数字，表示你对提取结果整体的置信度
- notes: 字符串数组，列出存疑或需要用户注意的点（如"未明确返现金额"），没有则为空数组

规则中未提及的布尔字段填 false。不要编造信息。`;

const stylePrompts: Record<string, string> = {
  real_daily:
    "真实日常风：像普通用户的真实使用记录，口语化、有生活细节，避免广告腔",
  cute_tone:
    "可爱口吻：语气活泼俏皮，适当使用可爱的表情符号；只有在素材或用户要求明确涉及宠物时，才使用宠物视角或宠物昵称",
  seeding:
    '种草风：突出产品卖点与推荐理由，营造"值得入手"的氛围，可用感叹与对比',
  short_praise: "简短好评：直接、简洁地夸赞产品，重点突出一两个优点",
};

const REVIEW_GENERATION_MODEL = "gpt-5.4-mini";

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function logAiTiming(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
) {
  console.info("[ai-timing]", {
    event,
    ...fields,
  });
}

const platformPrompts: Record<string, string> = {
  xiaohongshu:
    "平台：小红书笔记。可以使用 emoji、分行排版，结尾可带 2-4 个话题标签（#开头）",
  douyin: "平台：抖音视频文案。口播感强，节奏快，适合配视频朗读",
  taobao:
    "平台：淘宝/天猫商品评价。像真实淘宝买家的评价，口语化、实在，可提及包装、发货速度、客服态度，不要话题标签与站外链接",
  jd: "平台：京东商品评价。像真实京东买家的评价，语气实在，可提及京东物流速度、包装完好、正品放心，不要话题标签与站外链接",
  generic: "平台：电商平台商品评价。像真实买家评价，不要出现站外链接与话题标签",
};

function sanitizeExtraction(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    return raw;
  }

  const value = { ...(raw as Record<string, unknown>) };

  if (typeof value.deadline === "string") {
    const match = value.deadline.match(/\d{4}-\d{2}-\d{2}/);
    if (match) {
      value.deadline = match[0];
    } else {
      value.deadline = undefined;
    }
  }

  if (typeof value.cashbackAmount === "string") {
    const parsed = Number.parseFloat(value.cashbackAmount);
    value.cashbackAmount = Number.isFinite(parsed) ? parsed : undefined;
  }

  for (const key of Object.keys(value)) {
    if (value[key] === null) {
      value[key] = undefined;
    }
  }

  return value;
}

function normalizeStructuredPayload(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    return raw;
  }

  const value = { ...(raw as Record<string, unknown>) };
  for (const key of Object.keys(value)) {
    if (value[key] === null) {
      value[key] = undefined;
    }
  }
  return value;
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function queueBaseUrl(): string | null {
  return getImageQueueConfig()?.baseUrl?.replace(/\/$/, "") ?? null;
}

async function queueJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `队列服务请求失败 (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

function normalizeQueueStatus(value: string) {
  const parsed = imageJobStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "failed";
}

async function materialToDataUrl(
  bucket: R2Bucket,
  row: typeof materials.$inferSelect,
): Promise<string | null> {
  if (!row.assetUrl?.startsWith(ASSET_URL_PREFIX)) {
    return null;
  }
  const key = decodeURIComponent(row.assetUrl.slice(ASSET_URL_PREFIX.length));
  const object = await bucket.get(key);
  if (!object) {
    return null;
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  return `data:${row.assetMimeType ?? "image/png"};base64,${base64FromBytes(bytes)}`;
}

async function refreshJobStatus(
  db: DrizzleD1Database<typeof schema>,
  baseUrl: string,
  job: typeof imageGenerationJobs.$inferSelect,
) {
  const status = await queueJson<QueueStatusResponse>(
    `${baseUrl}/v1/queue/requests/${job.externalRequestId}/status`,
  );
  const nextStatus = normalizeQueueStatus(status.status);

  const updated = await db
    .update(imageGenerationJobs)
    .set({
      status: nextStatus,
      errorMessage: status.error?.message ?? null,
      resultJson: status.result ?? null,
      submittedAt: status.submitted_at ?? job.submittedAt,
      startedAt: status.started_at ?? null,
      completedAt: status.completed_at ?? null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(imageGenerationJobs.id, job.id))
    .returning();

  return updated[0];
}

export const aiRouter = new Hono<Env>()
  .post(
    "/extract-task",
    zValidator("json", aiExtractInputSchema),
    async (c) => {
      const startedAt = performance.now();
      const { ruleText, images } = c.req.valid("json");
      const db = c.get("db");
      const userId = c.get("userId");

      const provider = getAiProvider();
      const apiKey = getAiApiKey(c.env);
      if (!apiKey) {
        return c.json(
          { error: `未配置 AI key（环境变量 ${provider.apiKeyEnv}）` },
          500,
        );
      }

      const text = ruleText?.trim() ?? "";
      const imageUrls = images ?? [];
      logAiTiming("extract_task_start", {
        userId,
        model: provider.model,
        textLength: text.length,
        imageCount: imageUrls.length,
      });

      function buildUser(retryHint?: string): ChatUserContent {
        const hint = retryHint
          ? `\n\n（上一次输出不符合要求：${retryHint}，请严格按字段说明重新输出 JSON）`
          : "";
        if (imageUrls.length === 0) {
          return text + hint;
        }
        const parts: Exclude<ChatUserContent, string> = [];
        if (text) {
          parts.push({ type: "text", text });
        }
        for (const url of imageUrls) {
          parts.push({ type: "image_url", image_url: { url } });
        }
        parts.push({
          type: "text",
          text: `请从以上商家规则（截图/文字）中提取任务信息。${hint}`,
        });
        return parts;
      }

      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        let content: string;
        try {
          const upstreamStartedAt = performance.now();
          content = await chatComplete({
            baseUrl: provider.baseUrl,
            apiKey,
            model: provider.model,
            system: extractionSystemPrompt,
            user: buildUser(attempt === 0 ? undefined : lastError),
            jsonMode: true,
            temperature: 0.2,
          });
          logAiTiming("extract_task_upstream", {
            userId,
            model: provider.model,
            attempt: attempt + 1,
            durationMs: elapsedMs(upstreamStartedAt),
            outputLength: content.length,
          });
        } catch (error) {
          logAiTiming("extract_task_error", {
            userId,
            model: provider.model,
            attempt: attempt + 1,
            totalMs: elapsedMs(startedAt),
            error: error instanceof Error ? error.message.slice(0, 180) : null,
          });
          return c.json(
            { error: error instanceof Error ? error.message : "AI 请求失败" },
            502,
          );
        }

        let parsed: unknown;
        try {
          parsed = extractJson(content);
        } catch {
          lastError = "输出不是合法 JSON";
          continue;
        }

        const parseStartedAt = performance.now();
        const result = aiTaskExtractionSchema.safeParse(
          sanitizeExtraction(parsed),
        );
        const parseMs = elapsedMs(parseStartedAt);
        if (!result.success) {
          lastError = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");
          continue;
        }

        const insertStartedAt = performance.now();
        await db.insert(aiExtractionLogs).values({
          userId,
          inputText: text || `[截图识别 ${imageUrls.length} 张]`,
          outputJson: result.data,
        });
        logAiTiming("extract_task_success", {
          userId,
          model: provider.model,
          attempt: attempt + 1,
          parseMs,
          insertMs: elapsedMs(insertStartedAt),
          totalMs: elapsedMs(startedAt),
        });

        return c.json({ extraction: result.data });
      }

      logAiTiming("extract_task_parse_failed", {
        userId,
        model: provider.model,
        totalMs: elapsedMs(startedAt),
        error: lastError.slice(0, 180),
      });
      return c.json({ error: `AI 识别结果解析失败：${lastError}` }, 502);
    },
  )
  .post(
    "/generate-review",
    zValidator("json", generateReviewSchema),
    async (c) => {
      const startedAt = performance.now();
      const input = c.req.valid("json");
      const db = c.get("db");
      const userId = c.get("userId");

      const provider = getAiProvider();
      const apiKey = getAiApiKey(c.env);
      if (!apiKey) {
        return c.json(
          { error: `未配置 AI key（环境变量 ${provider.apiKeyEnv}）` },
          500,
        );
      }

      const contextParts: string[] = [];

      if (input.taskId) {
        const taskStartedAt = performance.now();
        const task = await db.query.tasks.findFirst({
          where: and(eq(tasks.id, input.taskId), eq(tasks.userId, userId)),
          with: { steps: true },
        });
        if (!task) {
          return c.json({ error: "Task not found" }, 404);
        }
        contextParts.push(
          `商品：${task.productName ?? task.title}${task.merchantName ? `（商家：${task.merchantName}）` : ""}`,
        );
        if (task.ruleText) {
          contextParts.push(`商家活动规则：\n${task.ruleText}`);
        }
        const requirements = task.steps
          .filter((step) => step.requirement)
          .map((step) => `- ${step.title}：${step.requirement}`);
        if (requirements.length > 0) {
          contextParts.push(`各平台要求：\n${requirements.join("\n")}`);
        }
        logAiTiming("generate_review_task_context", {
          userId,
          taskId: input.taskId,
          durationMs: elapsedMs(taskStartedAt),
          requirementCount: requirements.length,
        });
      }

      if (input.materialIds.length > 0) {
        const materialsStartedAt = performance.now();
        const rows = await db
          .select()
          .from(materials)
          .where(
            and(
              inArray(materials.id, input.materialIds),
              eq(materials.userId, userId),
            ),
          );

        const copies = rows
          .filter((m) => m.type === "copywriting" && m.content)
          .map((m) => `- ${m.content}`);
        if (copies.length > 0) {
          contextParts.push(
            `参考文案素材（借鉴表达，不要照抄）：\n${copies.join("\n")}`,
          );
        }

        const images = rows
          .filter((m) => m.type !== "copywriting")
          .map(
            (m) =>
              `- ${m.title}${m.tags.length > 0 ? `（${m.tags.join("、")}）` : ""}`,
          );
        if (images.length > 0) {
          contextParts.push(
            `将随文案一起发布的图片素材（可在文中自然呼应画面内容）：\n${images.join("\n")}`,
          );
        }
        logAiTiming("generate_review_material_context", {
          userId,
          materialCount: input.materialIds.length,
          durationMs: elapsedMs(materialsStartedAt),
          copyCount: copies.length,
          imageCount: images.length,
        });
      }

      if (input.customRequirement) {
        contextParts.push(`用户自定义要求：\n${input.customRequirement}`);
      }

      const baseSystem = `你是真实用户内容的文案代笔。根据给定的商品信息、素材与用户要求，写一段发布用的文案。

${platformPrompts[input.platform]}
风格：${stylePrompts[input.style]}
字数要求：约 ${input.wordCount} 字（允许 ±15%）。

硬性规则：内容要像真实使用体验；不得默认写猫、狗或宠物，除非商品/素材/用户要求明确涉及；用户自定义要求优先级高于风格预设，但不能违反合规规则；禁止虚假宣传、夸大功效（如"治愈疾病"）、使用"最好""第一"等极限词、引导私下交易；不要提及返现、置换等活动内幕。`;

      const user =
        contextParts.length > 0
          ? contextParts.join("\n\n")
          : "（无额外素材，请基于用户选择的平台与风格创作一段通用、真实、不夸张的内容）";

      logAiTiming("generate_review_start", {
        userId,
        mode: input.mode,
        platform: input.platform,
        style: input.style,
        wordCount: input.wordCount,
        taskId: input.taskId ?? null,
        materialCount: input.materialIds.length,
        model: REVIEW_GENERATION_MODEL,
        contextLength: user.length,
      });

      let content: string;
      try {
        if (input.mode === "xiaohongshu_publish") {
          const structuredSystem = `${baseSystem}

输出必须是 JSON 对象，不要 Markdown，不要额外解释。字段：
- title: 小红书标题，中文 8-24 字，真实自然，不标题党
- body: 小红书正文，可分行，可自然包含 emoji，总字数接近要求
- hashtags: 2-8 个话题标签，不带 # 符号`;

          let parsed: unknown;
          let lastError = "";
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const upstreamStartedAt = performance.now();
            const raw = await chatComplete({
              baseUrl: provider.baseUrl,
              apiKey,
              model: REVIEW_GENERATION_MODEL,
              system: structuredSystem,
              user,
              jsonMode: true,
              temperature: 0.75,
            });
            logAiTiming("generate_review_upstream", {
              userId,
              mode: input.mode,
              model: REVIEW_GENERATION_MODEL,
              attempt: attempt + 1,
              durationMs: elapsedMs(upstreamStartedAt),
              outputLength: raw.length,
            });
            try {
              const parseStartedAt = performance.now();
              parsed = xiaohongshuPublishPayloadSchema.parse(
                normalizeStructuredPayload(extractJson(raw)),
              );
              logAiTiming("generate_review_parse", {
                userId,
                mode: input.mode,
                attempt: attempt + 1,
                durationMs: elapsedMs(parseStartedAt),
              });
              break;
            } catch (error) {
              lastError =
                error instanceof Error ? error.message : String(error);
            }
          }
          if (!parsed) {
            logAiTiming("generate_review_parse_failed", {
              userId,
              mode: input.mode,
              totalMs: elapsedMs(startedAt),
              error: lastError.slice(0, 180),
            });
            return c.json(
              { error: `小红书发布内容解析失败：${lastError}` },
              502,
            );
          }
          content = JSON.stringify(parsed);
        } else {
          const upstreamStartedAt = performance.now();
          content = await chatComplete({
            baseUrl: provider.baseUrl,
            apiKey,
            model: REVIEW_GENERATION_MODEL,
            system: `${baseSystem}\n\n只输出文案正文，不要任何解释。`,
            user,
            temperature: 0.8,
          });
          logAiTiming("generate_review_upstream", {
            userId,
            mode: input.mode,
            model: REVIEW_GENERATION_MODEL,
            attempt: 1,
            durationMs: elapsedMs(upstreamStartedAt),
            outputLength: content.length,
          });
        }
      } catch (error) {
        logAiTiming("generate_review_error", {
          userId,
          mode: input.mode,
          model: REVIEW_GENERATION_MODEL,
          totalMs: elapsedMs(startedAt),
          error: error instanceof Error ? error.message.slice(0, 180) : null,
        });
        return c.json(
          { error: error instanceof Error ? error.message : "AI 请求失败" },
          502,
        );
      }

      const insertStartedAt = performance.now();
      const inserted = await db
        .insert(generatedContents)
        .values({
          userId,
          taskId: input.taskId ?? null,
          contentMode: input.mode,
          platform: input.platform,
          style: input.style,
          wordCount: input.wordCount,
          content: content.trim(),
        })
        .returning();
      logAiTiming("generate_review_success", {
        userId,
        mode: input.mode,
        model: REVIEW_GENERATION_MODEL,
        outputLength: content.length,
        insertMs: elapsedMs(insertStartedAt),
        totalMs: elapsedMs(startedAt),
      });

      return c.json({ generated: inserted[0] });
    },
  )
  .post(
    "/generate-image",
    zValidator("json", generateImageSchema),
    async (c) => {
      const input = c.req.valid("json");
      const db = c.get("db");
      const userId = c.get("userId");

      const provider = getAiProvider();
      const apiKey = getAiApiKey(c.env);
      if (!apiKey) {
        return c.json(
          { error: `未配置 AI key（环境变量 ${provider.apiKeyEnv}）` },
          500,
        );
      }

      // 参考图：现有图片素材（从 R2 取回）+ 现场上传的压缩 data URL
      const references: Blob[] = [];
      if (input.materialIds.length > 0) {
        const rows = await db
          .select()
          .from(materials)
          .where(
            and(
              inArray(materials.id, input.materialIds),
              eq(materials.userId, userId),
            ),
          );
        for (const row of rows) {
          if (!row.assetUrl?.startsWith(ASSET_URL_PREFIX)) {
            continue;
          }
          const key = decodeURIComponent(
            row.assetUrl.slice(ASSET_URL_PREFIX.length),
          );
          const object = await c.env.BUCKET.get(key);
          if (object) {
            references.push(
              new Blob([await object.arrayBuffer()], {
                type: row.assetMimeType ?? "image/png",
              }),
            );
          }
        }
      }
      for (const dataUrl of input.referenceImages) {
        references.push(dataUrlToBlob(dataUrl));
      }

      let bytes: Uint8Array;
      try {
        bytes = await generateImage({
          baseUrl: provider.baseUrl,
          apiKey,
          prompt: input.prompt,
          size: input.size,
          references,
        });
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "生图失败" },
          502,
        );
      }

      // 生成结果先以 data URL 返回，由用户在前端确认（可改标题/类型）后再入库；
      // 未确认不写 R2、不落 materials，避免草稿污染素材库
      return c.json({
        image: `data:image/png;base64,${base64FromBytes(bytes)}`,
      });
    },
  )
  .get("/image-queue-config", (c) => {
    const config = getImageQueueConfig();
    return c.json({
      enabled: Boolean(config),
      defaultProvider: config?.defaultProvider ?? "openai-compat",
      defaultModel: config?.defaultModel ?? "gpt-image-2",
      models: config?.models ?? [],
    });
  })
  .get("/image-jobs", async (c) => {
    const rows = await c
      .get("db")
      .select()
      .from(imageGenerationJobs)
      .where(eq(imageGenerationJobs.userId, c.get("userId")))
      .orderBy(desc(imageGenerationJobs.createdAt))
      .limit(50);
    return c.json({ jobs: rows });
  })
  .post(
    "/image-jobs",
    zValidator("json", queuedImageGenerateSchema),
    async (c) => {
      const config = getImageQueueConfig();
      if (!config) {
        return c.json({ error: "未配置图片队列服务" }, 503);
      }
      const rawBaseUrl = config.baseUrl;
      if (!rawBaseUrl) {
        return c.json({ error: "未配置图片队列服务" }, 503);
      }
      const baseUrl = rawBaseUrl.replace(/\/$/, "");

      const input = c.req.valid("json");
      const allowed = config.models.some(
        (item) =>
          item.provider === input.provider && item.model === input.model,
      );
      if (!allowed) {
        return c.json({ error: "不支持的生图模型" }, 400);
      }

      const db = c.get("db");
      const userId = c.get("userId");
      const inputImages = [...input.referenceImages];

      if (input.materialIds.length > 0) {
        const rows = await db
          .select()
          .from(materials)
          .where(
            and(
              inArray(materials.id, input.materialIds),
              eq(materials.userId, userId),
            ),
          );
        for (const row of rows) {
          const dataUrl = await materialToDataUrl(c.env.BUCKET, row);
          if (dataUrl) {
            inputImages.push(dataUrl);
          }
        }
      }

      let submitted: QueueSubmitResponse;
      try {
        submitted = await queueJson<QueueSubmitResponse>(
          `${baseUrl}/v1/queue/${input.provider}/${encodeURIComponent(input.model)}/submit`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              prompt: input.prompt,
              size: input.size,
              quality: input.quality,
              n: input.n,
              input_images: inputImages,
              client_request_id: crypto.randomUUID(),
              device_id: `pet-task-user-${userId}`,
            }),
          },
        );
      } catch (error) {
        return c.json(
          {
            error: error instanceof Error ? error.message : "提交生图任务失败",
          },
          502,
        );
      }

      const inserted = await db
        .insert(imageGenerationJobs)
        .values({
          userId,
          externalRequestId: submitted.request_id,
          provider: input.provider,
          model: input.model,
          prompt: input.prompt,
          size: input.size,
          quality: input.quality,
          status: submitted.status,
          submittedAt: submitted.submitted_at,
        })
        .returning();

      return c.json({ job: inserted[0] }, 201);
    },
  )
  .post("/image-jobs/:id/refresh", async (c) => {
    const baseUrl = queueBaseUrl();
    if (!baseUrl) {
      return c.json({ error: "未配置图片队列服务" }, 503);
    }

    const id = parsePositiveInt(c.req.param("id"));
    if (!id) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const db = c.get("db");
    const [job] = await db
      .select()
      .from(imageGenerationJobs)
      .where(
        and(
          eq(imageGenerationJobs.id, id),
          eq(imageGenerationJobs.userId, c.get("userId")),
        ),
      );
    if (!job) {
      return c.notFound();
    }

    try {
      const updated = await refreshJobStatus(db, baseUrl, job);
      return c.json({ job: updated });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "刷新生图状态失败" },
        502,
      );
    }
  })
  .put("/image-jobs/:id/cancel", async (c) => {
    const baseUrl = queueBaseUrl();
    if (!baseUrl) {
      return c.json({ error: "未配置图片队列服务" }, 503);
    }

    const id = parsePositiveInt(c.req.param("id"));
    if (!id) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const db = c.get("db");
    const [job] = await db
      .select()
      .from(imageGenerationJobs)
      .where(
        and(
          eq(imageGenerationJobs.id, id),
          eq(imageGenerationJobs.userId, c.get("userId")),
        ),
      );
    if (!job) {
      return c.notFound();
    }

    try {
      await queueJson(
        `${baseUrl}/v1/queue/requests/${job.externalRequestId}/cancel`,
        { method: "PUT" },
      );
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "取消生图任务失败" },
        502,
      );
    }

    const updated = await db
      .update(imageGenerationJobs)
      .set({
        status: "cancelled",
        completedAt: Date.now(),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(imageGenerationJobs.id, job.id))
      .returning();

    return c.json({ job: updated[0] });
  })
  .delete("/image-jobs/:id", async (c) => {
    const id = parsePositiveInt(c.req.param("id"));
    if (!id) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const db = c.get("db");
    const [job] = await db
      .select()
      .from(imageGenerationJobs)
      .where(
        and(
          eq(imageGenerationJobs.id, id),
          eq(imageGenerationJobs.userId, c.get("userId")),
        ),
      );
    if (!job) {
      return c.notFound();
    }
    if (job.status === "queued" || job.status === "in_progress") {
      return c.json({ error: "进行中的任务请先取消" }, 409);
    }

    await db.delete(imageGenerationJobs).where(eq(imageGenerationJobs.id, id));
    return c.json({ ok: true });
  })
  .get("/image-jobs/:id/image/:index", async (c) => {
    const baseUrl = queueBaseUrl();
    if (!baseUrl) {
      return c.json({ error: "未配置图片队列服务" }, 503);
    }

    const id = parsePositiveInt(c.req.param("id"));
    const index = Number(c.req.param("index"));
    if (!id || !Number.isInteger(index) || index < 0) {
      return c.json({ error: "Invalid image ref" }, 400);
    }

    const [job] = await c
      .get("db")
      .select()
      .from(imageGenerationJobs)
      .where(
        and(
          eq(imageGenerationJobs.id, id),
          eq(imageGenerationJobs.userId, c.get("userId")),
        ),
      );
    if (!job || job.status !== "completed") {
      return c.notFound();
    }

    const response = await fetch(
      `${baseUrl}/v1/queue/requests/${job.externalRequestId}/image/${index}`,
    );
    if (!response.ok) {
      return c.json({ error: `图片读取失败 (${response.status})` }, 502);
    }

    return new Response(response.body, {
      headers: {
        "content-type": response.headers.get("content-type") ?? "image/png",
        "cache-control": "private, max-age=300",
      },
    });
  })
  .post(
    "/image-jobs/:id/save",
    zValidator("json", saveGeneratedImageSchema),
    async (c) => {
      const baseUrl = queueBaseUrl();
      if (!baseUrl) {
        return c.json({ error: "未配置图片队列服务" }, 503);
      }

      const id = parsePositiveInt(c.req.param("id"));
      if (!id) {
        return c.json({ error: "Invalid job id" }, 400);
      }

      const input = c.req.valid("json");
      const db = c.get("db");
      const [job] = await db
        .select()
        .from(imageGenerationJobs)
        .where(
          and(
            eq(imageGenerationJobs.id, id),
            eq(imageGenerationJobs.userId, c.get("userId")),
          ),
        );
      if (!job || job.status !== "completed") {
        return c.notFound();
      }

      const image = await fetch(
        `${baseUrl}/v1/queue/requests/${job.externalRequestId}/image/${input.index}`,
      );
      if (!image.ok) {
        return c.json({ error: `图片读取失败 (${image.status})` }, 502);
      }

      const mime = image.headers.get("content-type") ?? "image/png";
      const file = new File([await image.arrayBuffer()], "generated.png", {
        type: mime,
      });
      const asset = await putAsset(c.env.BUCKET, file, "generated/");
      const inserted = await db
        .insert(materials)
        .values({
          userId: c.get("userId"),
          type: input.type,
          title: input.title,
          assetUrl: asset.url,
          assetMimeType: mime,
          tags: input.tags,
        })
        .returning();

      await db
        .update(imageGenerationJobs)
        .set({
          savedMaterialIds: [...job.savedMaterialIds, inserted[0].id],
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(imageGenerationJobs.id, job.id));

      return c.json({ material: inserted[0] }, 201);
    },
  )
  .get("/generations", async (c) => {
    const db = c.get("db");
    const rows = await db
      .select()
      .from(generatedContents)
      .where(eq(generatedContents.userId, c.get("userId")))
      .orderBy(desc(generatedContents.createdAt))
      .limit(50);

    return c.json({ generations: rows });
  });
