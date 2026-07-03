import { zValidator } from "@hono/zod-validator";
import { users } from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import { loginSchema } from "@pet-task-ai/shared";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyPassword,
  verifySessionToken,
} from "../lib/auth";

type Env = {
  Bindings: { AUTH_SECRET: string };
  Variables: { db: DrizzleD1Database<typeof schema> };
};

function isHttps(url: string): boolean {
  return new URL(url).protocol === "https:";
}

export const authRouter = new Hono<Env>()
  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { username, password } = c.req.valid("json");
    const db = c.get("db");

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: "用户名或密码错误" }, 401);
    }

    const token = await createSessionToken(user.id, c.env.AUTH_SECRET);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      maxAge: SESSION_MAX_AGE,
      secure: isHttps(c.req.url),
    });

    return c.json({ user: { id: user.id, username: user.username } });
  })
  .get("/me", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    const userId = token
      ? await verifySessionToken(token, c.env.AUTH_SECRET)
      : null;

    if (!userId) {
      return c.json({ error: "未登录" }, 401);
    }

    const db = c.get("db");
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return c.json({ error: "未登录" }, 401);
    }

    return c.json({ user: { id: user.id, username: user.username } });
  })
  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
