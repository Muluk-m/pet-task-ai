import { zValidator } from "@hono/zod-validator";
import { taskSteps, tasks } from "@pet-task-ai/db/schema";
import type * as schema from "@pet-task-ai/db/schema";
import {
  addStepSchema,
  completeStepSchema,
  createTaskSchema,
  stepTypeTitles,
  updateTaskSchema,
} from "@pet-task-ai/shared";
import type { TaskStepType } from "@pet-task-ai/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";

type Db = DrizzleD1Database<typeof schema>;

type Env = {
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
};

const urlRequiredStepTypes = new Set<string>([
  "xiaohongshu_note",
  "douyin_post",
]);

async function recomputeTaskStatus(db: Db, taskId: number) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || task.status === "archived") {
    return;
  }

  const steps = await db
    .select({ status: taskSteps.status })
    .from(taskSteps)
    .where(eq(taskSteps.taskId, taskId));

  const pending = steps.filter((s) => s.status === "pending").length;
  const completed = steps.filter((s) => s.status === "completed").length;

  if (pending === 0 && completed > 0 && task.status !== "completed") {
    await db
      .update(tasks)
      .set({ status: "completed", completedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(tasks.id, taskId));
  } else if (pending > 0 && task.status === "completed") {
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
      with: { steps: true },
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
      steps.push({
        taskId: task.id,
        type: "ecommerce_review",
        title: stepTypeTitles.ecommerce_review,
        requirement: input.reviewRequirement,
      });
    }

    if (input.requiresCashback) {
      steps.push({
        taskId: task.id,
        type: "cashback",
        title: stepTypeTitles.cashback,
      });
    }

    await db.insert(taskSteps).values(steps);

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
      with: { steps: true },
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
    const inserted = await db
      .insert(taskSteps)
      .values({
        taskId,
        type: input.type,
        title: input.title ?? stepTypeTitles[input.type],
        requirement: input.requirement,
      })
      .returning();

    await recomputeTaskStatus(db, taskId);
    return c.json({ step: inserted[0] }, 201);
  })
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
        completedAt: null,
      })
      .where(eq(taskSteps.id, stepId));

    await recomputeTaskStatus(db, taskId);
    return c.json({ ok: true });
  });
