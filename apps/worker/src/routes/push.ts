import { zValidator } from "@hono/zod-validator";
import { pushSubscriptions } from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import { pushSubscribeSchema } from "@pet-task-ai/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";

type Env = {
  Variables: {
    db: DrizzleD1Database<typeof schema>;
    userId: number;
  };
};

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export const pushRouter = new Hono<Env>()
  .post("/subscribe", zValidator("json", pushSubscribeSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const userId = c.get("userId");

    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
        },
      });

    return c.json({ ok: true }, 201);
  })
  .post("/unsubscribe", zValidator("json", unsubscribeSchema), async (c) => {
    const { endpoint } = c.req.valid("json");
    const db = c.get("db");
    const userId = c.get("userId");

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, userId),
        ),
      );

    return c.json({ ok: true });
  });
