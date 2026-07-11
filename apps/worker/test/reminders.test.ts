import { env } from "cloudflare:test";
import * as schema from "@pet-task-ai/db/schema";
import { taskSteps, tasks, users } from "@pet-task-ai/db/schema";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, describe, expect, it } from "vitest";
import {
  deadlineThreshold,
  selectRetentionUserIds,
  selectUrgentUserIds,
} from "../src/index";

const db = drizzle(env.DB, { schema });

// 阈值当天：临期/逾期判定的边界（YYYY-MM-DD）
const THRESHOLD = "2099-06-15";

async function makeUser(username: string): Promise<number> {
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash: "x" })
    .returning({ id: users.id });
  return row.id;
}

describe("deadlineThreshold", () => {
  it("gives the Beijing date plus the days-ahead offset", () => {
    // 2026-07-11T20:00:00Z = 北京 2026-07-12 04:00；+3 天 = 2026-07-15
    const utc = Date.parse("2026-07-11T20:00:00Z");
    expect(deadlineThreshold(3, utc)).toBe("2026-07-15");
    expect(deadlineThreshold(0, utc)).toBe("2026-07-12");
  });
});

describe("selectUrgentUserIds", () => {
  let overdueUser: number;
  let dueTodayUser: number;
  let futureUser: number;
  let noDeadlineUser: number;
  let completedUser: number;
  let archivedUser: number;

  beforeAll(async () => {
    overdueUser = await makeUser("urgent-overdue");
    dueTodayUser = await makeUser("urgent-due-today");
    futureUser = await makeUser("urgent-future");
    noDeadlineUser = await makeUser("urgent-no-deadline");
    completedUser = await makeUser("urgent-completed");
    archivedUser = await makeUser("urgent-archived");

    await db.insert(tasks).values([
      // 逾期：deadline < 阈值 → 命中
      {
        userId: overdueUser,
        title: "逾期",
        status: "active",
        deadline: "2099-01-01",
      },
      // 临期当天：deadline == 阈值 → 命中（lte）
      {
        userId: dueTodayUser,
        title: "临期",
        status: "active",
        deadline: THRESHOLD,
      },
      // 未来：deadline > 阈值 → 不命中
      {
        userId: futureUser,
        title: "未来",
        status: "active",
        deadline: "2099-12-31",
      },
      // 无 deadline → 不命中
      {
        userId: noDeadlineUser,
        title: "无期限",
        status: "active",
        deadline: null,
      },
      // 已完成：即便逾期也不提醒
      {
        userId: completedUser,
        title: "已完成",
        status: "completed",
        deadline: "2099-01-01",
      },
      // 已归档：不提醒
      {
        userId: archivedUser,
        title: "已归档",
        status: "archived",
        deadline: "2099-01-01",
      },
      // 同一用户多条命中任务：应去重
      {
        userId: overdueUser,
        title: "逾期2",
        status: "active",
        deadline: "2099-02-02",
      },
    ]);
  });

  it("selects only users with active, on-or-before-threshold deadlines, deduped", async () => {
    const ids = await selectUrgentUserIds(db, THRESHOLD);

    expect(ids.has(overdueUser)).toBe(true);
    expect(ids.has(dueTodayUser)).toBe(true);

    expect(ids.has(futureUser)).toBe(false);
    expect(ids.has(noDeadlineUser)).toBe(false);
    expect(ids.has(completedUser)).toBe(false);
    expect(ids.has(archivedUser)).toBe(false);
  });
});

describe("selectRetentionUserIds", () => {
  // cron 每天用 [今天, 明天]（北京日历日）的区间匹配——
  // 单日等值匹配会让 retainDays=1 的步骤结构性漏发（能匹配它的 cron 已跑过）
  const FROM_DATE = "2099-06-15";
  const TO_DATE = "2099-06-16";

  let dueTodayUser: number;
  let dueTomorrowUser: number;
  let pendingUser: number;
  let earlierUser: number;
  let laterUser: number;
  let noRetainUser: number;
  let archivedUser: number;
  let dedupeUser: number;

  async function makeTaskWithStep(
    userId: number,
    step: { status: "pending" | "completed"; retainUntil: string | null },
    taskStatus: "active" | "completed" | "archived" = "completed",
  ) {
    const [task] = await db
      .insert(tasks)
      .values({ userId, title: "保留期任务", status: taskStatus })
      .returning({ id: tasks.id });
    await db.insert(taskSteps).values({
      taskId: task.id,
      type: "xiaohongshu_note",
      title: "发布小红书笔记",
      status: step.status,
      retainUntil: step.retainUntil,
    });
  }

  beforeAll(async () => {
    dueTodayUser = await makeUser("retain-due-today");
    dueTomorrowUser = await makeUser("retain-due-tomorrow");
    pendingUser = await makeUser("retain-pending");
    earlierUser = await makeUser("retain-earlier");
    laterUser = await makeUser("retain-later");
    noRetainUser = await makeUser("retain-none");
    archivedUser = await makeUser("retain-archived");
    dedupeUser = await makeUser("retain-dedupe");

    // 今天到期且已完成 → 命中（区间下界）
    await makeTaskWithStep(dueTodayUser, {
      status: "completed",
      retainUntil: FROM_DATE,
    });
    // 明天到期且已完成 → 命中（区间上界）
    await makeTaskWithStep(dueTomorrowUser, {
      status: "completed",
      retainUntil: TO_DATE,
    });
    // 到期但步骤仍待完成 → 不命中（还没发布，谈不上保留）
    await makeTaskWithStep(pendingUser, {
      status: "pending",
      retainUntil: FROM_DATE,
    });
    // 保留期已过（早于区间）→ 不命中，避免每天重复提醒
    await makeTaskWithStep(earlierUser, {
      status: "completed",
      retainUntil: "2099-06-14",
    });
    // 保留期尚未临近（晚于区间）→ 不命中
    await makeTaskWithStep(laterUser, {
      status: "completed",
      retainUntil: "2099-06-17",
    });
    // 完成但无保留期 → 不命中
    await makeTaskWithStep(noRetainUser, {
      status: "completed",
      retainUntil: null,
    });
    // 任务已归档（≈放弃活动）→ 不提醒；已完成任务仍提醒（上面 completed 各例）
    await makeTaskWithStep(
      archivedUser,
      { status: "completed", retainUntil: FROM_DATE },
      "archived",
    );
    // 同一用户多条到期步骤 → 应去重
    await makeTaskWithStep(dedupeUser, {
      status: "completed",
      retainUntil: FROM_DATE,
    });
    await makeTaskWithStep(dedupeUser, {
      status: "completed",
      retainUntil: TO_DATE,
    });
  });

  it("selects users with completed steps retaining within [from, to], excluding archived, deduped", async () => {
    const ids = await selectRetentionUserIds(db, FROM_DATE, TO_DATE);

    expect(ids.has(dueTodayUser)).toBe(true);
    expect(ids.has(dueTomorrowUser)).toBe(true);
    expect(ids.has(dedupeUser)).toBe(true);

    expect(ids.has(pendingUser)).toBe(false);
    expect(ids.has(earlierUser)).toBe(false);
    expect(ids.has(laterUser)).toBe(false);
    expect(ids.has(noRetainUser)).toBe(false);
    expect(ids.has(archivedUser)).toBe(false);
  });
});
