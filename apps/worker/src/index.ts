import * as schema from "@pet-task-ai/db/schema";
import { pushSubscriptions, taskSteps, tasks } from "@pet-task-ai/db/schema";
import { and, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth";
import { ptConfig } from "./lib/config";
import { sendPushNotification } from "./lib/webpush";
import { aiRouter } from "./routes/ai";
import { authRouter } from "./routes/auth";
import { materialsRouter } from "./routes/materials";
import { pushRouter } from "./routes/push";
import { tasksRouter } from "./routes/tasks";

export type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  AUTH_SECRET: string;
  OPENAI_API_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

export type Env = {
  Bindings: Bindings;
  Variables: {
    db: DrizzleD1Database<typeof schema>;
    userId: number;
  };
};

const app = new Hono<Env>();

app.use("*", logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => {
  return c.json({ ok: true, service: "pet-task-ai" });
});

app.use("/api/*", async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});

// 鉴权：除 health / auth 外的所有 API 都需要登录态
app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    path === "/api/health" ||
    path.startsWith("/api/auth/") ||
    // R2 资产：key 是随机 UUID（capability URL），免登录以支持
    // /cdn-cgi/image 回源子请求（不携带 cookie）与共享边缘缓存
    path.startsWith("/api/materials/assets/")
  ) {
    await next();
    return;
  }

  const token = getCookie(c, SESSION_COOKIE);
  const userId = token
    ? await verifySessionToken(token, c.env.AUTH_SECRET)
    : null;

  if (!userId) {
    return c.json({ error: "未登录" }, 401);
  }

  c.set("userId", userId);
  await next();
});

const routes = app
  .route("/api/auth", authRouter)
  .route("/api/tasks", tasksRouter)
  .route("/api/materials", materialsRouter)
  .route("/api/ai", aiRouter)
  .route("/api/push", pushRouter);

app.get("*", async (c) => c.env.ASSETS.fetch(c.req.raw));

/** 北京时间「今天 + 提前量」的日期阈值（YYYY-MM-DD），deadline <= 此值即为临期/逾期 */
export function deadlineThreshold(daysAhead: number, now = Date.now()): string {
  const beijingNow = new Date(now + 8 * 3600_000);
  return new Date(beijingNow.getTime() + daysAhead * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

type ReminderDb = DrizzleD1Database<typeof schema>;

/** 查出到阈值前有临期/逾期 active 任务的去重用户 id 集合（一条 SQL） */
export async function selectUrgentUserIds(
  db: ReminderDb,
  threshold: string,
): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ userId: tasks.userId })
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "active"),
        isNotNull(tasks.deadline),
        lte(tasks.deadline, threshold),
      ),
    );

  const ids = new Set<number>();
  for (const row of rows) {
    if (row.userId != null) {
      ids.add(row.userId);
    }
  }
  return ids;
}

/**
 * 查出保留期在 [fromDate, toDate]（含边界）内到期的已完成步骤的去重用户 id 集合。
 * 用区间而非单日等值匹配：retainDays=1 时到期日是「明天」，能匹配它的那次 cron
 * 在完成前就已跑过，单日匹配会结构性漏发；区间匹配让到期前一天与到期当天各提醒一次。
 * 归档任务不提醒（归档≈放弃活动，与临期提醒的 active 口径一致）；已完成任务
 * 仍提醒——拿完返现后笔记保留义务还在。
 */
export async function selectRetentionUserIds(
  db: ReminderDb,
  fromDate: string,
  toDate: string,
): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ userId: tasks.userId })
    .from(taskSteps)
    .innerJoin(tasks, eq(taskSteps.taskId, tasks.id))
    .where(
      and(
        eq(taskSteps.status, "completed"),
        gte(taskSteps.retainUntil, fromDate),
        lte(taskSteps.retainUntil, toDate),
        ne(tasks.status, "archived"),
      ),
    );

  const ids = new Set<number>();
  for (const row of rows) {
    if (row.userId != null) {
      ids.add(row.userId);
    }
  }
  return ids;
}

const PUSH_BATCH_SIZE = 20;

// 每日 Cron：给有临期/逾期任务的用户推送提醒（空 payload，SW 展示固定文案）
async function runDeadlineReminders(env: Bindings) {
  const db = drizzle(env.DB, { schema });

  const threshold = deadlineThreshold(ptConfig.push.reminderDaysAhead);
  // 保留期到期提醒：今天或明天（北京日历日）到期的已完成步骤，与临期用户合并去重后同一批推送
  const [urgentUserIds, retentionUserIds] = await Promise.all([
    selectUrgentUserIds(db, threshold),
    selectRetentionUserIds(db, deadlineThreshold(0), deadlineThreshold(1)),
  ]);
  const targetUserIds = new Set([...urgentUserIds, ...retentionUserIds]);
  if (targetUserIds.size === 0) {
    return;
  }

  // 按目标用户精确查订阅；D1 单语句绑定参数上限 100，分块以防用户数增长
  const urgentIds = [...targetUserIds];
  const subscriptions: (typeof pushSubscriptions.$inferSelect)[] = [];
  for (let i = 0; i < urgentIds.length; i += 90) {
    subscriptions.push(
      ...(await db
        .select()
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, urgentIds.slice(i, i + 90)))),
    );
  }
  if (subscriptions.length === 0) {
    return;
  }

  const sendOne = async (sub: (typeof subscriptions)[number]) => {
    const result = await sendPushNotification(sub.endpoint, {
      publicKey: ptConfig.push.vapidPublicKey,
      privateKeyPkcs8Base64: env.VAPID_PRIVATE_KEY,
      subject: ptConfig.push.vapidSubject,
    });
    // 410/404 表示订阅已失效，清理掉
    if (result === "gone") {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, sub.id));
    }
  };

  // 分批并发，避免一次性打开过多连接
  for (let i = 0; i < subscriptions.length; i += PUSH_BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + PUSH_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(sendOne));
    for (const [index, outcome] of results.entries()) {
      if (outcome.status === "rejected") {
        console.error("push failed", batch[index].endpoint, outcome.reason);
      }
    }
  }
}

export type AppType = typeof routes;

// 测试通过 app.request 直接调用；生产入口是下方的 default export
export { app };

export default {
  fetch: app.fetch,
  scheduled: async (
    _controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ) => {
    // 单条 push 失败已由 allSettled 隔离；整体失败要重新抛出，
    // 让 Cloudflare 面板记为 failed invocation 保留告警信号
    ctx.waitUntil(
      runDeadlineReminders(env).catch((error) => {
        console.error("deadline reminders cron failed", error);
        throw error;
      }),
    );
  },
};
