import { zValidator } from "@hono/zod-validator";
import { taskSteps, tasks } from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import {
  addStepSchema,
  completeStepSchema,
  createTaskSchema,
  ecommerceReviewTitles,
  reorderStepsSchema,
  stepTypeTitles,
  updateTaskSchema,
} from "@pet-task-ai/shared";
import type { TaskStepType } from "@pet-task-ai/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";

type Db = DrizzleD1Database<typeof schema>;

type Env = {
  Bindings: {
    BUCKET: R2Bucket;
  };
  Variables: {
    db: Db;
    userId: number;
  };
};

type NewTaskStep = {
  taskId: number;
  type: TaskStepType;
  title: string;
  requirement?: string;
  platform?: string;
  sortOrder?: number;
};

const stepsInOrder = {
  orderBy: [asc(taskSteps.sortOrder), asc(taskSteps.id)],
};

const urlRequiredStepTypes = new Set<string>([
  "xiaohongshu_note",
  "douyin_post",
]);

// 任务完成判定唯一入口：pending 为 0 且有已完成步骤 → completed；有 pending → 回退 active；
// archived 不重算。一次 LEFT JOIN 聚合拿回 task 状态与步骤计数，最多一次条件 UPDATE。
async function recomputeTaskStatus(db: Db, taskId: number) {
  const [row] = await db
    .select({
      status: tasks.status,
      pending: sql<number>`sum(case when ${taskSteps.status} = 'pending' then 1 else 0 end)`,
      completed: sql<number>`sum(case when ${taskSteps.status} = 'completed' then 1 else 0 end)`,
    })
    .from(tasks)
    .leftJoin(taskSteps, eq(taskSteps.taskId, tasks.id))
    .where(eq(tasks.id, taskId))
    .groupBy(tasks.id);

  if (!row || row.status === "archived") {
    return;
  }

  const pending = row.pending ?? 0;
  const completed = row.completed ?? 0;

  if (pending === 0 && completed > 0 && row.status !== "completed") {
    await db
      .update(tasks)
      .set({ status: "completed", completedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(tasks.id, taskId));
  } else if (pending > 0 && row.status === "completed") {
    await db
      .update(tasks)
      .set({ status: "active", completedAt: null })
      .where(eq(tasks.id, taskId));
  }
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * 保留期截止日（YYYY-MM-DD）：以完成日的北京日历日为基准 + 保留天数。
 * 与 cron 的 deadlineThreshold、前端本地日历日同口径（产品面向北京时区用户）——
 * 若用 UTC 日历日，北京 00:00-08:00 完成的步骤到期日会比用户认知早一天。
 */
function retainUntilDate(days: number, now = Date.now()): string {
  return new Date(now + 8 * 3600_000 + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function getOwnedTask(db: Db, taskId: number, userId: number) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  return task ?? null;
}

export const tasksRouter = new Hono<Env>()
  .get("/", async (c) => {
    const db = c.get("db");
    const rows = await db.query.tasks.findMany({
      where: eq(tasks.userId, c.get("userId")),
      with: { steps: stepsInOrder },
      orderBy: [desc(tasks.createdAt)],
    });
    return c.json({ tasks: rows });
  })
  .post("/", zValidator("json", createTaskSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");

    const inserted = await db
      .insert(tasks)
      .values({
        userId: c.get("userId"),
        title: input.title,
        merchantName: input.merchantName,
        productName: input.productName,
        ruleText: input.ruleText,
        deadline: input.deadline,
        cashbackAmount: input.cashbackAmount,
        trackingNo: input.trackingNo,
        note: input.note,
        orderChannel: input.orderChannel,
      })
      .returning();

    const task = inserted[0];
    const steps: NewTaskStep[] = [
      { taskId: task.id, type: "delivery", title: stepTypeTitles.delivery },
    ];

    if (input.requiresXiaohongshu) {
      steps.push({
        taskId: task.id,
        type: "xiaohongshu_note",
        title: stepTypeTitles.xiaohongshu_note,
        requirement: input.xiaohongshuRequirement,
      });
    }

    if (input.requiresDouyin) {
      steps.push({
        taskId: task.id,
        type: "douyin_post",
        title: stepTypeTitles.douyin_post,
        requirement: input.douyinRequirement,
      });
    }

    if (input.requiresReview) {
      // 好评平台跟随下单渠道
      const platform = input.orderChannel ?? "other";
      steps.push({
        taskId: task.id,
        type: "ecommerce_review",
        title: ecommerceReviewTitles[platform],
        requirement: input.reviewRequirement,
        platform,
      });
    }

    if (input.requiresCashback) {
      steps.push({
        taskId: task.id,
        type: "cashback",
        title: stepTypeTitles.cashback,
      });
    }

    await db
      .insert(taskSteps)
      .values(steps.map((step, index) => ({ ...step, sortOrder: index })));

    return c.json({ task }, 201);
  })
  .get("/:taskId", async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    if (!taskId) {
      return c.json({ error: "Invalid task id" }, 400);
    }

    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, c.get("userId"))),
      with: { steps: stepsInOrder },
    });

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json({ task });
  })
  .patch("/:taskId", zValidator("json", updateTaskSchema), async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    if (!taskId) {
      return c.json({ error: "Invalid task id" }, 400);
    }

    const input = c.req.valid("json");
    const updated = await db
      .update(tasks)
      .set({ ...input, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, c.get("userId"))))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json({ task: updated[0] });
  })
  .post("/:taskId/cover", async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    if (!taskId) {
      return c.json({ error: "Invalid task id" }, 400);
    }

    const task = await getOwnedTask(db, taskId, c.get("userId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "请选择图片文件" }, 400);
    }
    if (!file.type.startsWith("image/")) {
      return c.json({ error: "仅支持图片文件" }, 400);
    }

    const extension = file.type.split("/")[1] ?? "jpg";
    const key = `task-cover-${crypto.randomUUID()}.${extension}`;
    await c.env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    // 替换封面时清理旧文件
    if (task.coverImageUrl?.startsWith("/api/materials/assets/")) {
      const oldKey = decodeURIComponent(
        task.coverImageUrl.replace("/api/materials/assets/", ""),
      );
      await c.env.BUCKET.delete(oldKey);
    }

    const updated = await db
      .update(tasks)
      .set({
        coverImageUrl: `/api/materials/assets/${encodeURIComponent(key)}`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return c.json({ task: updated[0] });
  })
  .post("/:taskId/archive", async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    if (!taskId) {
      return c.json({ error: "Invalid task id" }, 400);
    }

    const updated = await db
      .update(tasks)
      .set({ status: "archived", updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, c.get("userId"))))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json({ task: updated[0] });
  })
  .post("/:taskId/unarchive", async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    if (!taskId) {
      return c.json({ error: "Invalid task id" }, 400);
    }

    const updated = await db
      .update(tasks)
      .set({
        status: "active",
        completedAt: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, c.get("userId")),
          eq(tasks.status, "archived"),
        ),
      )
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Task not found or not archived" }, 404);
    }

    await recomputeTaskStatus(db, taskId);
    return c.json({ ok: true });
  })
  .post("/:taskId/steps", zValidator("json", addStepSchema), async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    if (!taskId) {
      return c.json({ error: "Invalid task id" }, 400);
    }

    const task = await getOwnedTask(db, taskId, c.get("userId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }
    if (task.status === "archived") {
      return c.json({ error: "Cannot add steps to an archived task" }, 400);
    }

    const input = c.req.valid("json");
    const [{ maxOrder }] = await db
      .select({
        maxOrder: sql<number>`coalesce(max(${taskSteps.sortOrder}), -1)`,
      })
      .from(taskSteps)
      .where(eq(taskSteps.taskId, taskId));
    const inserted = await db
      .insert(taskSteps)
      .values({
        taskId,
        type: input.type,
        title:
          input.title ??
          (input.type === "ecommerce_review"
            ? ecommerceReviewTitles[input.platform ?? "other"]
            : stepTypeTitles[input.type]),
        requirement: input.requirement,
        platform: input.platform,
        sortOrder: maxOrder + 1,
      })
      .returning();

    await recomputeTaskStatus(db, taskId);
    return c.json({ step: inserted[0] }, 201);
  })
  .put(
    "/:taskId/steps/order",
    zValidator("json", reorderStepsSchema),
    async (c) => {
      const db = c.get("db");
      const taskId = parseId(c.req.param("taskId"));
      if (!taskId) {
        return c.json({ error: "Invalid task id" }, 400);
      }

      const task = await getOwnedTask(db, taskId, c.get("userId"));
      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      const { stepIds } = c.req.valid("json");
      const owned = await db
        .select({ id: taskSteps.id })
        .from(taskSteps)
        .where(eq(taskSteps.taskId, taskId));
      const ownedIds = new Set(owned.map((row) => row.id));
      if (
        stepIds.length !== ownedIds.size ||
        !stepIds.every((id) => ownedIds.has(id))
      ) {
        return c.json({ error: "步骤列表与任务不匹配" }, 400);
      }

      const updates = stepIds.map((stepId, index) =>
        db
          .update(taskSteps)
          .set({ sortOrder: index })
          .where(eq(taskSteps.id, stepId)),
      );
      await db.batch([updates[0], ...updates.slice(1)]);

      return c.json({ ok: true });
    },
  )
  .delete("/:taskId/steps/:stepId", async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    const stepId = parseId(c.req.param("stepId"));
    if (!taskId || !stepId) {
      return c.json({ error: "Invalid id" }, 400);
    }

    const task = await getOwnedTask(db, taskId, c.get("userId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const [step] = await db
      .select()
      .from(taskSteps)
      .where(and(eq(taskSteps.id, stepId), eq(taskSteps.taskId, taskId)));

    if (!step) {
      return c.json({ error: "Step not found" }, 404);
    }
    if (step.status === "completed") {
      return c.json({ error: "请先撤销完成后再删除该步骤" }, 400);
    }

    await db.delete(taskSteps).where(eq(taskSteps.id, stepId));
    await recomputeTaskStatus(db, taskId);
    return c.json({ ok: true });
  })
  .post(
    "/:taskId/steps/:stepId/complete",
    zValidator("json", completeStepSchema),
    async (c) => {
      const db = c.get("db");
      const taskId = parseId(c.req.param("taskId"));
      const stepId = parseId(c.req.param("stepId"));
      if (!taskId || !stepId) {
        return c.json({ error: "Invalid id" }, 400);
      }

      const task = await getOwnedTask(db, taskId, c.get("userId"));
      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      const [step] = await db
        .select()
        .from(taskSteps)
        .where(and(eq(taskSteps.id, stepId), eq(taskSteps.taskId, taskId)));

      if (!step) {
        return c.json({ error: "Step not found" }, 404);
      }

      const input = c.req.valid("json");
      if (urlRequiredStepTypes.has(step.type) && !input.resultUrl) {
        return c.json({ error: "该步骤需要提交笔记/帖子链接" }, 400);
      }

      await db
        .update(taskSteps)
        .set({
          status: "completed",
          resultUrl: input.resultUrl ?? null,
          resultText: input.resultText ?? null,
          retainUntil: input.retainDays
            ? retainUntilDate(input.retainDays)
            : null,
          completedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(taskSteps.id, stepId));

      await recomputeTaskStatus(db, taskId);
      return c.json({ ok: true });
    },
  )
  .post("/:taskId/steps/:stepId/undo", async (c) => {
    const db = c.get("db");
    const taskId = parseId(c.req.param("taskId"));
    const stepId = parseId(c.req.param("stepId"));
    if (!taskId || !stepId) {
      return c.json({ error: "Invalid id" }, 400);
    }

    const task = await getOwnedTask(db, taskId, c.get("userId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const [step] = await db
      .select()
      .from(taskSteps)
      .where(and(eq(taskSteps.id, stepId), eq(taskSteps.taskId, taskId)));

    if (!step) {
      return c.json({ error: "Step not found" }, 404);
    }

    await db
      .update(taskSteps)
      .set({
        status: "pending",
        resultUrl: null,
        resultText: null,
        retainUntil: null,
        completedAt: null,
      })
      .where(eq(taskSteps.id, stepId));

    await recomputeTaskStatus(db, taskId);
    return c.json({ ok: true });
  });
