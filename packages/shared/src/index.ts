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

export const ecommercePlatformSchema = z.enum(["taobao", "jd", "other"]);

export const ecommerceReviewTitles: Record<
  z.infer<typeof ecommercePlatformSchema>,
  string
> = {
  taobao: "提交淘宝好评",
  jd: "提交京东好评",
  other: "提交商品好评",
};

export const reviewStyleSchema = z.enum([
  "real_daily",
  "cute_tone",
  "seeding",
  "short_praise",
]);

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

export const createTaskSchema = z.object({
  title: z.string().min(1),
  merchantName: z.string().optional(),
  productName: z.string().optional(),
  ruleText: z.string().optional(),
  deadline: dateStringSchema.optional(),
  requiresXiaohongshu: z.boolean().default(false),
  requiresDouyin: z.boolean().default(false),
  requiresReview: z.boolean().default(false),
  requiresCashback: z.boolean().default(true),
  cashbackAmount: z.number().nonnegative().optional(),
  xiaohongshuRequirement: z.string().optional(),
  douyinRequirement: z.string().optional(),
  reviewRequirement: z.string().optional(),
  reviewPlatform: ecommercePlatformSchema.optional(),
  trackingNo: z.string().max(64).optional(),
  note: z.string().max(2000).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  merchantName: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  ruleText: z.string().nullable().optional(),
  deadline: dateStringSchema.nullable().optional(),
  cashbackAmount: z.number().nonnegative().nullable().optional(),
  trackingNo: z.string().max(64).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export const completeStepSchema = z.object({
  resultUrl: z.string().url().optional(),
  resultText: z.string().optional(),
});

export const addStepSchema = z.object({
  type: taskStepTypeSchema,
  title: z.string().min(1).optional(),
  requirement: z.string().optional(),
  platform: ecommercePlatformSchema.optional(),
});

const imageDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,/, "图片格式不支持")
  .max(6_000_000, "单张图片过大，请压缩后重试");

export const aiExtractInputSchema = z
  .object({
    ruleText: z.string().optional(),
    images: z.array(imageDataUrlSchema).max(3, "最多上传 3 张截图").optional(),
  })
  .refine(
    (value) =>
      (value.ruleText?.trim().length ?? 0) >= 5 ||
      (value.images?.length ?? 0) > 0,
    { message: "请粘贴规则文字或上传截图" },
  );

export const aiTaskExtractionSchema = createTaskSchema.extend({
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
});

export const generateReviewSchema = z.object({
  taskId: z.number().int().positive().optional(),
  materialIds: z.array(z.number().int().positive()).default([]),
  platform: reviewPlatformSchema,
  style: reviewStyleSchema,
  wordCount: z.number().int().min(20).max(500),
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
export type EcommercePlatform = z.infer<typeof ecommercePlatformSchema>;
export type ReviewStyle = z.infer<typeof reviewStyleSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CompleteStepInput = z.infer<typeof completeStepSchema>;
export type AddStepInput = z.infer<typeof addStepSchema>;
export type AiExtractInput = z.infer<typeof aiExtractInputSchema>;
export type AiTaskExtraction = z.infer<typeof aiTaskExtractionSchema>;
export type GenerateReviewInput = z.infer<typeof generateReviewSchema>;
