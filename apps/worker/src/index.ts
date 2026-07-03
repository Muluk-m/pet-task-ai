import * as schema from "@pet-task-ai/db/schema";
import { pushSubscriptions, tasks } from "@pet-task-ai/db/schema";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
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

// 每日 Cron：给有临期/逾期任务的用户推送提醒（空 payload，SW 展示固定文案）
async function runDeadlineReminders(env: Bindings) {
  const db = drizzle(env.DB, { schema });

  // 以北京时间计算「今天 + 提前量」的日期阈值
  const beijingNow = new Date(Date.now() + 8 * 3600_000);
  const threshold = new Date(
    beijingNow.getTime() + ptConfig.push.reminderDaysAhead * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const subscriptions = await db.select().from(pushSubscriptions);
  if (subscriptions.length === 0) {
    return;
  }

  const byUser = new Map<number, typeof subscriptions>();
  for (const sub of subscriptions) {
    if (sub.userId == null) {
      continue;
    }
    const list = byUser.get(sub.userId) ?? [];
    list.push(sub);
    byUser.set(sub.userId, list);
  }

  for (const [userId, subs] of byUser) {
    const urgent = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "active"),
          isNotNull(tasks.deadline),
          lte(tasks.deadline, threshold),
        ),
      );

    if ((urgent[0]?.count ?? 0) === 0) {
      continue;
    }

    for (const sub of subs) {
      try {
        const result = await sendPushNotification(sub.endpoint, {
          publicKey: ptConfig.push.vapidPublicKey,
          privateKeyPkcs8Base64: env.VAPID_PRIVATE_KEY,
          subject: ptConfig.push.vapidSubject,
        });
        if (result === "gone") {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        }
      } catch (error) {
        console.error("push failed", sub.endpoint, error);
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
    ctx.waitUntil(runDeadlineReminders(env));
  },
};
