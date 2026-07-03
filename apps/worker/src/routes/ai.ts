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
  generateReviewSchema,
} from "@pet-task-ai/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { getAiApiKey, getAiProvider } from "../lib/config";
import { chatComplete, extractJson } from "../lib/openai";
import type { ChatUserContent } from "../lib/openai";

type Env = {
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
- requiresXiaohongshu / requiresDouyin / requiresReview / requiresCashback: 布尔值，规则中是否要求发小红书笔记 / 抖音帖子(视频) / 电商平台好评 / 有返现环节（提到返现金额即为 true）
- xiaohongshuRequirement / douyinRequirement / reviewRequirement: 对应平台的具体要求摘要（字数、图数、话题标签、时长等），未要求该平台则省略
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
