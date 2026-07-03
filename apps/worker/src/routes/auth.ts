import { zValidator } from "@hono/zod-validator";
import { users } from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "@pet-task-ai/shared";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { deleteAssetByUrl, putAsset } from "../lib/assets";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from "../lib/auth";

type Env = {
  Bindings: { AUTH_SECRET: string; BUCKET: R2Bucket };
  Variables: { db: DrizzleD1Database<typeof schema> };
};

type AuthContext = Context<Env>;

function isHttps(url: string): boolean {
  return new URL(url).protocol === "https:";
}

function setSessionCookie(c: AuthContext, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE,
    secure: isHttps(c.req.url),
  });
}

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

/** /api/auth/* 不经过全局鉴权中间件，登录后的资料类接口在这里自行验证会话 */
async function requireUser(c: AuthContext) {
  const token = getCookie(c, SESSION_COOKIE);
  const userId = token
    ? await verifySessionToken(token, c.env.AUTH_SECRET)
    : null;
  if (!userId) {
    return null;
  }
  const [user] = await c
    .get("db")
    .select()
    .from(users)
    .where(eq(users.id, userId));
  return user ?? null;
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

    setSessionCookie(c, await createSessionToken(user.id, c.env.AUTH_SECRET));
    return c.json({ user: publicUser(user) });
  })
  .post("/register", zValidator("json", registerSchema), async (c) => {
    const { username, password } = c.req.valid("json");
    const db = c.get("db");

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (existing) {
      return c.json({ error: "用户名已被占用" }, 409);
    }

    const [user] = await db
      .insert(users)
      .values({ username, passwordHash: await hashPassword(password) })
      .returning();

    setSessionCookie(c, await createSessionToken(user.id, c.env.AUTH_SECRET));
    return c.json({ user: publicUser(user) }, 201);
  })
  .get("/me", async (c) => {
    const user = await requireUser(c);
    if (!user) {
      return c.json({ error: "未登录" }, 401);
    }
    return c.json({ user: publicUser(user) });
  })
  .patch("/profile", zValidator("json", updateProfileSchema), async (c) => {
    const user = await requireUser(c);
    if (!user) {
      return c.json({ error: "未登录" }, 401);
    }

    const { displayName } = c.req.valid("json");
    const [updated] = await c
      .get("db")
      .update(users)
      .set({ displayName })
      .where(eq(users.id, user.id))
      .returning();

    return c.json({ user: publicUser(updated) });
  })
  .post("/password", zValidator("json", changePasswordSchema), async (c) => {
    const user = await requireUser(c);
    if (!user) {
      return c.json({ error: "未登录" }, 401);
    }

    const { currentPassword, newPassword } = c.req.valid("json");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return c.json({ error: "当前密码不正确" }, 400);
    }

    await c
      .get("db")
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(users.id, user.id));

    return c.json({ ok: true });
  })
  .post("/avatar", async (c) => {
    const user = await requireUser(c);
    if (!user) {
      return c.json({ error: "未登录" }, 401);
    }

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "请选择头像图片" }, 400);
    }
    if (!file.type.startsWith("image/")) {
      return c.json({ error: "仅支持图片文件" }, 400);
    }
    if (file.size > 3_000_000) {
      return c.json({ error: "头像图片不能超过 3MB" }, 400);
    }

    const { url } = await putAsset(c.env.BUCKET, file, `avatars/${user.id}-`);

    const oldUrl = user.avatarUrl;
    const [updated] = await c
      .get("db")
      .update(users)
      .set({ avatarUrl: url })
      .where(eq(users.id, user.id))
      .returning();

    // 旧头像清理不阻塞响应
    c.executionCtx.waitUntil(deleteAssetByUrl(c.env.BUCKET, oldUrl));

    return c.json({ user: publicUser(updated) });
  })
  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
