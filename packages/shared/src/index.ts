import { z } from "zod";

export const taskStepTypeSchema = z.enum([
  "delivery",
  "xiaohongshu_note",
  "douyin_post",
  "ecommerce_review",
  "cashback",
]);

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  username: z
    .string()
    .min(2, "用户名至少 2 个字符")
    .max(32, "用户名最多 32 个字符")
    .regex(/^[\w-]+$/, "用户名只能包含字母、数字、下划线和连字符"),
  password: z.string().min(6, "密码至少 6 位").max(72),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z.string().min(6, "新密码至少 6 位").max(72),
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "名称不能为空")
    .max(24, "名称最多 24 个字符"),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const materialTypeSchema = z.enum([
  "copywriting",
  "pet_image",
  "merchant_review_image",
]);

export const reviewPlatformSchema = z.enum([
  "xiaohongshu",
  "douyin",
  "taobao",
  "jd",
  "generic",
]);

/** 下单渠道 = 好评所在平台：任务在哪个平台下单，好评就发在哪 */
export const orderChannelSchema = z.enum([
  "taobao",
  "jd",
  "pdd",
  "douyin",
  "xiaohongshu",
  "other",
]);

export const orderChannelNames: Record<
  z.infer<typeof orderChannelSchema>,
  string
> = {
  taobao: "淘宝",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  xiaohongshu: "小红书",
  other: "其他",
};

export const ecommerceReviewTitles: Record<
  z.infer<typeof orderChannelSchema>,
  string
> = {
  taobao: "提交淘宝好评",
  jd: "提交京东好评",
  pdd: "提交拼多多好评",
  douyin: "提交抖音好评",
  xiaohongshu: "提交小红书好评",
  other: "提交商品好评",
};

export const reviewStyleSchema = z.enum([
  "real_daily",
  "cute_tone",
  "seeding",
  "short_praise",
]);

export const contentGenerationModeSchema = z.enum([
  "review_text",
  "xiaohongshu_publish",
]);

export const xiaohongshuPublishPayloadSchema = z.object({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(2000),
  hashtags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

const aiModelRefSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]+:.+$/, "模型配置格式不正确")
  .max(160)
  .optional();

/**
 * 已下线模型的等价档替换（modelId → modelId）：存量偏好（localStorage / 请求参数）
 * 静默映射到同档新模型，避免失效 ref 回退到默认速度档、质量档用户被降级。
 * worker 端解析 ref 与 web 端设置页清理都必须用同一份映射。
 */
export const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gpt-5.5": "gpt-5.6-sol",
};

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

const cashbackAmountSchema = z
  .number()
  .nonnegative()
  .refine((value) => Number.isInteger(value * 10), {
    message: "返现金额最多保留 1 位小数",
  });

// 自由文本上限：防止超大 body 打满 D1 / 拖垮 AI 抽取，数值给足正常使用余量。
// export 供前端表单 maxLength 引用同一来源，避免两端限制漂移。
export const TITLE_MAX = 200;
export const NAME_MAX = 200;
export const RULE_TEXT_MAX = 10_000;
export const REQUIREMENT_MAX = 10_000;

export const createTaskSchema = z.object({
  title: z.string().min(1).max(TITLE_MAX),
  merchantName: z.string().max(NAME_MAX).optional(),
  productName: z.string().max(NAME_MAX).optional(),
  ruleText: z.string().max(RULE_TEXT_MAX).optional(),
  deadline: dateStringSchema.optional(),
  requiresXiaohongshu: z.boolean().default(false),
  requiresDouyin: z.boolean().default(false),
  requiresReview: z.boolean().default(false),
  requiresCashback: z.boolean().default(true),
  cashbackAmount: cashbackAmountSchema.optional(),
  xiaohongshuRequirement: z.string().max(REQUIREMENT_MAX).optional(),
  douyinRequirement: z.string().max(REQUIREMENT_MAX).optional(),
  reviewRequirement: z.string().max(REQUIREMENT_MAX).optional(),
  trackingNo: z.string().max(64).optional(),
  note: z.string().max(2000).optional(),
  orderChannel: orderChannelSchema.optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(TITLE_MAX).optional(),
  merchantName: z.string().max(NAME_MAX).nullable().optional(),
  productName: z.string().max(NAME_MAX).nullable().optional(),
  ruleText: z.string().max(RULE_TEXT_MAX).nullable().optional(),
  deadline: dateStringSchema.nullable().optional(),
  cashbackAmount: cashbackAmountSchema.nullable().optional(),
  trackingNo: z.string().max(64).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  orderChannel: orderChannelSchema.nullable().optional(),
});

export const completeStepSchema = z.object({
  resultUrl: z.string().url().optional(),
  resultText: z.string().optional(),
  // 笔记/视频保留天数：完成时按完成日 + 天数算出保留期截止日写入 retain_until
  retainDays: z.number().int().min(1).max(365).optional(),
});

export const reorderStepsSchema = z.object({
  stepIds: z.array(z.number().int().positive()).min(1),
});

export const addStepSchema = z.object({
  type: taskStepTypeSchema,
  title: z.string().min(1).max(TITLE_MAX).optional(),
  requirement: z.string().max(REQUIREMENT_MAX).optional(),
  platform: orderChannelSchema.optional(),
});

const imageDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,/, "图片格式不支持")
  .max(6_000_000, "单张图片过大，请压缩后重试");

export const aiExtractInputSchema = z
  .object({
    ruleText: z.string().max(RULE_TEXT_MAX).optional(),
    images: z.array(imageDataUrlSchema).max(3, "最多上传 3 张截图").optional(),
    aiModel: aiModelRefSchema,
  })
  .refine(
    (value) =>
      (value.ruleText?.trim().length ?? 0) >= 5 ||
      (value.images?.length ?? 0) > 0,
    { message: "请粘贴规则文字或上传截图" },
  );

export const generateImageSchema = z.object({
  prompt: z.string().trim().min(2, "请描述要生成的图片").max(2000),
  materialIds: z.array(z.number().int().positive()).max(3).default([]),
  referenceImages: z.array(imageDataUrlSchema).max(3).default([]),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024"),
});

export const imageQueueProviderSchema = z.string().trim().min(1).max(120);

export const imageJobStatusSchema = z.enum([
  "queued",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
]);

export const queuedImageGenerateSchema = generateImageSchema.extend({
  provider: imageQueueProviderSchema.default("openai-images"),
  model: z.string().trim().min(1).max(120).default("gpt-image-2"),
  quality: z.enum(["auto", "low", "medium", "high"]).default("medium"),
  n: z.number().int().min(1).max(4).default(1),
});

export const saveGeneratedImageSchema = z.object({
  index: z.number().int().min(0),
  type: z.enum(["pet_image", "merchant_review_image"]).default("pet_image"),
  title: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().min(1).max(24)).max(12).default([]),
});

export const aiTaskExtractionSchema = createTaskSchema.extend({
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
});

export const generateReviewSchema = z.object({
  mode: contentGenerationModeSchema.default("review_text"),
  taskId: z.number().int().positive().optional(),
  materialIds: z.array(z.number().int().positive()).default([]),
  platform: reviewPlatformSchema,
  style: reviewStyleSchema,
  wordCount: z.number().int().min(20).max(500),
  customRequirement: z.string().trim().max(1000).optional(),
  aiModel: aiModelRefSchema,
});

export const stepTypeTitles: Record<
  z.infer<typeof taskStepTypeSchema>,
  string
> = {
  delivery: "下单到货",
  xiaohongshu_note: "发布小红书笔记",
  douyin_post: "发布抖音帖子",
  ecommerce_review: "提交商品好评",
  cashback: "确认已返现",
};

export type TaskStepType = z.infer<typeof taskStepTypeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
export type MaterialType = z.infer<typeof materialTypeSchema>;
export type ReviewPlatform = z.infer<typeof reviewPlatformSchema>;
export type OrderChannel = z.infer<typeof orderChannelSchema>;
export type ReorderStepsInput = z.infer<typeof reorderStepsSchema>;
export type ReviewStyle = z.infer<typeof reviewStyleSchema>;
export type ContentGenerationMode = z.infer<typeof contentGenerationModeSchema>;
export type XiaohongshuPublishPayload = z.infer<
  typeof xiaohongshuPublishPayloadSchema
>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CompleteStepInput = z.infer<typeof completeStepSchema>;
export type AddStepInput = z.infer<typeof addStepSchema>;
export type AiExtractInput = z.infer<typeof aiExtractInputSchema>;
export type AiTaskExtraction = z.infer<typeof aiTaskExtractionSchema>;
export type GenerateReviewInput = z.infer<typeof generateReviewSchema>;
export type GenerateImageInput = z.input<typeof generateImageSchema>;
export type QueuedImageGenerateInput = z.input<
  typeof queuedImageGenerateSchema
>;
export type SaveGeneratedImageInput = z.infer<typeof saveGeneratedImageSchema>;
export type ImageJobStatus = z.infer<typeof imageJobStatusSchema>;
export type ImageQueueProvider = z.infer<typeof imageQueueProviderSchema>;
