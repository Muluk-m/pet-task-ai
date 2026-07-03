import { zValidator } from "@hono/zod-validator";
import {
  aiExtractionLogs,
  generatedContents,
  materials,
  tasks,
} from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import {
  aiExtractInputSchema,
  aiTaskExtractionSchema,
  generateImageSchema,
  generateReviewSchema,
} from "@pet-task-ai/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { ASSET_URL_PREFIX } from "../lib/assets";
import { getAiApiKey, getAiProvider } from "../lib/config";
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
    "真实日常风：像普通宠物主人的真实使用记录，口语化、有生活细节，避免广告腔",
  cute_tone:
    "可爱口吻：语气活泼俏皮，适当使用可爱的表情符号，以宠物视角或宠物昵称增加趣味",
  seeding:
    '种草风：突出产品卖点与推荐理由，营造"值得入手"的氛围，可用感叹与对比',
  short_praise: "简短好评：直接、简洁地夸赞产品，重点突出一两个优点",
};

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

export const aiRouter = new Hono<Env>()
  .post(
    "/extract-task",
    zValidator("json", aiExtractInputSchema),
    async (c) => {
      const { ruleText, images } = c.req.valid("json");
      const db = c.get("db");

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
          content = await chatComplete({
            baseUrl: provider.baseUrl,
            apiKey,
            model: provider.model,
            system: extractionSystemPrompt,
            user: buildUser(attempt === 0 ? undefined : lastError),
            jsonMode: true,
            temperature: 0.2,
          });
        } catch (error) {
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

        const result = aiTaskExtractionSchema.safeParse(
          sanitizeExtraction(parsed),
        );
        if (!result.success) {
          lastError = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");
          continue;
        }

        await db.insert(aiExtractionLogs).values({
          userId: c.get("userId"),
          inputText: text || `[截图识别 ${imageUrls.length} 张]`,
          outputJson: result.data,
        });

        return c.json({ extraction: result.data });
      }

      return c.json({ error: `AI 识别结果解析失败：${lastError}` }, 502);
    },
  )
  .post(
    "/generate-review",
    zValidator("json", generateReviewSchema),
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

      const contextParts: string[] = [];

      if (input.taskId) {
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
      }

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
      }

      const system = `你是宠物用品真实用户的文案代笔。根据给定的商品信息与素材，写一段发布用的文案。

${platformPrompts[input.platform]}
风格：${stylePrompts[input.style]}
字数要求：约 ${input.wordCount} 字（允许 ±15%）。

硬性规则：内容要像真实使用体验；禁止虚假宣传、夸大功效（如"治愈疾病"）、使用"最好""第一"等极限词、引导私下交易；不要提及返现、置换等活动内幕；只输出文案正文，不要任何解释。`;

      let content: string;
      try {
        content = await chatComplete({
          baseUrl: provider.baseUrl,
          apiKey,
          model: provider.model,
          system,
          user:
            contextParts.length > 0
              ? contextParts.join("\n\n")
              : "（无额外素材，请基于常见宠物用品使用体验创作）",
          temperature: 0.8,
        });
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "AI 请求失败" },
          502,
        );
      }

      const inserted = await db
        .insert(generatedContents)
        .values({
          userId,
          taskId: input.taskId ?? null,
          platform: input.platform,
          style: input.style,
          wordCount: input.wordCount,
          content: content.trim(),
        })
        .returning();

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
