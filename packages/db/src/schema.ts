import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  merchantName: text("merchant_name"),
  productName: text("product_name"),
  ruleText: text("rule_text"),
  status: text("status", { enum: ["active", "completed", "archived"] })
    .notNull()
    .default("active"),
  cashbackAmount: real("cashback_amount"),
  deadline: text("deadline"),
  coverImageUrl: text("cover_image_url"),
  trackingNo: text("tracking_no"),
  note: text("note"),
  orderChannel: text("order_channel"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const taskSteps = sqliteTable("task_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: [
      "delivery",
      "xiaohongshu_note",
      "douyin_post",
      "ecommerce_review",
      "cashback",
    ],
  }).notNull(),
  title: text("title").notNull(),
  requirement: text("requirement"),
  platform: text("platform"),
  status: text("status", { enum: ["pending", "completed"] })
    .notNull()
    .default("pending"),
  sortOrder: integer("sort_order").notNull().default(0),
  resultUrl: text("result_url"),
  resultText: text("result_text"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const materials = sqliteTable("materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  type: text("type", {
    enum: ["copywriting", "pet_image", "merchant_review_image"],
  }).notNull(),
  title: text("title").notNull(),
  content: text("content"),
  assetUrl: text("asset_url"),
  assetMimeType: text("asset_mime_type"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const generatedContents = sqliteTable("generated_contents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  taskId: integer("task_id").references(() => tasks.id, {
    onDelete: "set null",
  }),
  contentMode: text("content_mode", {
    enum: ["review_text", "xiaohongshu_publish"],
  })
    .notNull()
    .default("review_text"),
  platform: text("platform").notNull(),
  style: text("style").notNull(),
  wordCount: integer("word_count"),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const imageGenerationJobs = sqliteTable("image_generation_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  externalRequestId: text("external_request_id").notNull(),
  provider: text("provider", { enum: ["openai-compat", "gemini"] }).notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  size: text("size").notNull(),
  quality: text("quality"),
  status: text("status", {
    enum: ["queued", "in_progress", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("queued"),
  errorMessage: text("error_message"),
  resultJson: text("result_json", { mode: "json" }).$type<unknown>(),
  savedMaterialIds: text("saved_material_ids", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  submittedAt: integer("submitted_at"),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const aiExtractionLogs = sqliteTable("ai_extraction_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  inputText: text("input_text").notNull(),
  outputJson: text("output_json", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tasksRelations = relations(tasks, ({ many }) => ({
  steps: many(taskSteps),
  generatedContents: many(generatedContents),
}));

export const taskStepsRelations = relations(taskSteps, ({ one }) => ({
  task: one(tasks, {
    fields: [taskSteps.taskId],
    references: [tasks.id],
  }),
}));
