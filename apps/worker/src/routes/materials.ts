import { materials } from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import { materialTypeSchema } from "@pet-task-ai/shared";
import { and, desc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { deleteAssetByUrl, putAsset } from "../lib/assets";

type Env = {
  Bindings: {
    BUCKET: R2Bucket;
  };
  Variables: {
    db: DrizzleD1Database<typeof schema>;
    userId: number;
  };
};

const imageMaterialTypes = new Set(["pet_image", "merchant_review_image"]);

export const materialsRouter = new Hono<Env>()
  .get("/", async (c) => {
    const db = c.get("db");
    const rows = await db
      .select()
      .from(materials)
      .where(eq(materials.userId, c.get("userId")))
      .orderBy(desc(materials.createdAt));

    return c.json({ materials: rows });
  })
  .post("/", async (c) => {
    const db = c.get("db");
    const form = await c.req.formData();
    const typeResult = materialTypeSchema.safeParse(form.get("type"));

    if (!typeResult.success) {
      return c.json({ error: "Invalid material type" }, 400);
    }

    const title = getRequiredText(form, "title");
    if (!title) {
      return c.json({ error: "Title is required" }, 400);
    }

    const type = typeResult.data;
    const content = getOptionalText(form, "content");
    const tags = parseTags(getOptionalText(form, "tags"));
    const file = form.get("file");
    let assetUrl: string | null = null;
    let assetMimeType: string | null = null;

    if (file instanceof File && file.size > 0) {
      if (!imageMaterialTypes.has(type)) {
        return c.json(
          { error: "Only image material types can include a file" },
          400,
        );
      }

      if (!file.type.startsWith("image/")) {
        return c.json({ error: "Only image files are supported" }, 400);
      }

      assetUrl = (await putAsset(c.env.BUCKET, file)).url;
      assetMimeType = file.type;
    }

    const inserted = await db
      .insert(materials)
      .values({
        userId: c.get("userId"),
        type,
        title,
        content,
        assetUrl,
        assetMimeType,
        tags,
      })
      .returning();

    return c.json({ material: inserted[0] }, 201);
  })
  .get("/assets/:key", async (c) => {
    // 边缘缓存：自定义域名上生效，workers.dev 上 cache 操作为 no-op
    const cache = await caches.open("assets");
    const cached = await cache.match(c.req.raw);
    if (cached) {
      return cached;
    }

    const key = decodeURIComponent(c.req.param("key"));
    const object = await c.env.BUCKET.get(key);

    if (!object) {
      return c.notFound();
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");

    const response = new Response(object.body, { headers });
    c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()));
    return response;
  })
  .delete("/:id", async (c) => {
    const db = c.get("db");
    const id = Number(c.req.param("id"));
    const existing = await db
      .select()
      .from(materials)
      .where(and(eq(materials.id, id), eq(materials.userId, c.get("userId"))));

    if (existing.length === 0) {
      return c.notFound();
    }

    await deleteAssetByUrl(c.env.BUCKET, existing[0].assetUrl);

    await db.delete(materials).where(eq(materials.id, id));
    return c.json({ ok: true });
  });

function getRequiredText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getOptionalText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseTags(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
