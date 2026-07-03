import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index";

type TaskResponse = {
  task: {
    id: number;
    title: string;
    status: string;
    deadline: string | null;
    steps?: Array<{
      id: number;
      type: string;
      status: string;
      resultUrl: string | null;
      requirement: string | null;
    }>;
  };
};

let cookie = "";

beforeAll(async () => {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "tester", password: "test-password" }),
    },
    env,
  );
  expect(res.status).toBe(200);
  cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(cookie).toContain("pt_session=");
});

function request(path: string, init: RequestInit = {}) {
  return app.request(
    path,
    {
      ...init,
      headers: { ...(init.headers as Record<string, string>), cookie },
    },
    env,
  );
}

function postJson(path: string, body: unknown) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createFullTask() {
  const res = await postJson("/api/tasks", {
    title: "全价冻干狗粮 1.5kg",
    merchantName: "萌宠优选",
    deadline: "2099-12-31",
    cashbackAmount: 18,
    requiresXiaohongshu: true,
    requiresDouyin: false,
    requiresReview: true,
    requiresCashback: true,
    xiaohongshuRequirement: "至少 30 字 + 3 张图",
  });
  expect(res.status).toBe(201);
  const { task } = (await res.json()) as TaskResponse;
  return task;
}

async function getTask(taskId: number) {
  const res = await request(`/api/tasks/${taskId}`);
  expect(res.status).toBe(200);
  const { task } = (await res.json()) as Required<TaskResponse>;
  return task;
}

describe("auth", () => {
  it("rejects unauthenticated API access", async () => {
    const res = await app.request("/api/tasks", {}, env);
    expect(res.status).toBe(401);
  });

  it("rejects wrong credentials", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "tester", password: "wrong" }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("tasks API", () => {
  it("creates a task with a delivery step plus checked options", async () => {
    const created = await createFullTask();
    const task = await getTask(created.id);

    expect(task.status).toBe("active");
    expect(task.deadline).toBe("2099-12-31");
    expect(task.steps?.map((s) => s.type).sort()).toEqual(
      ["cashback", "delivery", "ecommerce_review", "xiaohongshu_note"].sort(),
    );
    const xhs = task.steps?.find((s) => s.type === "xiaohongshu_note");
    expect(xhs?.requirement).toBe("至少 30 字 + 3 张图");
  });

  it("rejects completing a note step without a valid url", async () => {
    const created = await createFullTask();
    const task = await getTask(created.id);
    const xhs = task.steps?.find((s) => s.type === "xiaohongshu_note");

    const res = await postJson(
      `/api/tasks/${task.id}/steps/${xhs?.id}/complete`,
      {},
    );
    expect(res.status).toBe(400);

    const invalid = await postJson(
      `/api/tasks/${task.id}/steps/${xhs?.id}/complete`,
      { resultUrl: "随便写的文字" },
    );
    expect(invalid.status).toBe(400);
  });

  it("auto-completes the task when the last pending step is done", async () => {
    const created = await createFullTask();
    let task = await getTask(created.id);

    for (const step of task.steps ?? []) {
      const body =
        step.type === "xiaohongshu_note"
          ? { resultUrl: "https://www.xiaohongshu.com/explore/abc" }
          : {};
      const res = await postJson(
        `/api/tasks/${task.id}/steps/${step.id}/complete`,
        body,
      );
      expect(res.status).toBe(200);
    }

    task = await getTask(created.id);
    expect(task.status).toBe("completed");
    expect(task.steps?.every((s) => s.status === "completed")).toBe(true);
  });

  it("reverts the task to active when a completed step is undone", async () => {
    const created = await createFullTask();
    let task = await getTask(created.id);

    for (const step of task.steps ?? []) {
      await postJson(`/api/tasks/${task.id}/steps/${step.id}/complete`, {
        resultUrl: "https://example.com/post",
      });
    }
    task = await getTask(created.id);
    expect(task.status).toBe("completed");

    const first = task.steps?.[0];
    const res = await postJson(
      `/api/tasks/${task.id}/steps/${first?.id}/undo`,
      {},
    );
    expect(res.status).toBe(200);

    task = await getTask(created.id);
    expect(task.status).toBe("active");
    expect(task.steps?.find((s) => s.id === first?.id)?.status).toBe("pending");
  });

  it("refuses deleting a completed step and allows deleting a pending one", async () => {
    const created = await createFullTask();
    let task = await getTask(created.id);
    const review = task.steps?.find((s) => s.type === "ecommerce_review");

    await postJson(`/api/tasks/${task.id}/steps/${review?.id}/complete`, {});

    const refused = await request(`/api/tasks/${task.id}/steps/${review?.id}`, {
      method: "DELETE",
    });
    expect(refused.status).toBe(400);

    const cashback = task.steps?.find((s) => s.type === "cashback");
    const deleted = await request(
      `/api/tasks/${task.id}/steps/${cashback?.id}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);

    task = await getTask(created.id);
    expect(task.steps?.some((s) => s.type === "cashback")).toBe(false);
  });

  it("archives and restores a task", async () => {
    const created = await createFullTask();

    const archived = await postJson(`/api/tasks/${created.id}/archive`, {});
    expect(archived.status).toBe(200);
    expect((await getTask(created.id)).status).toBe("archived");

    const restored = await postJson(`/api/tasks/${created.id}/unarchive`, {});
    expect(restored.status).toBe(200);
    expect((await getTask(created.id)).status).toBe("active");
  });

  it("creates a platform-specific review step title", async () => {
    const res = await postJson("/api/tasks", {
      title: "淘宝好评任务",
      requiresReview: true,
      orderChannel: "taobao",
      requiresCashback: false,
    });
    expect(res.status).toBe(201);
    const { task: created } = (await res.json()) as TaskResponse;

    const task = await getTask(created.id);
    const review = task.steps?.find((s) => s.type === "ecommerce_review");
    expect(review).toBeDefined();
    expect(
      (review as unknown as { title: string; platform: string | null }).title,
    ).toBe("提交淘宝好评");
    expect((review as unknown as { platform: string | null }).platform).toBe(
      "taobao",
    );
  });

  it("derives the review platform from the order channel", async () => {
    const res = await postJson("/api/tasks", {
      title: "拼多多置换",
      requiresReview: true,
      orderChannel: "pdd",
      requiresCashback: false,
    });
    expect(res.status).toBe(201);
    const { task: created } = (await res.json()) as TaskResponse;

    const task = await getTask(created.id);
    const review = task.steps?.find((s) => s.type === "ecommerce_review");
    expect(
      (review as unknown as { title: string; platform: string | null }).title,
    ).toBe("提交拼多多好评");
    expect((review as unknown as { platform: string | null }).platform).toBe(
      "pdd",
    );
  });

  it("reorders steps and rejects mismatched step lists", async () => {
    const created = await createFullTask();
    const task = await getTask(created.id);
    const ids = (task.steps ?? []).map((s) => s.id);
    expect(ids.length).toBeGreaterThan(2);

    const reversed = [...ids].reverse();
    const res = await request(`/api/tasks/${created.id}/steps/order`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: reversed }),
    });
    expect(res.status).toBe(200);

    const after = await getTask(created.id);
    expect((after.steps ?? []).map((s) => s.id)).toEqual(reversed);

    const bad = await request(`/api/tasks/${created.id}/steps/order`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: [999999, ...reversed.slice(1)] }),
    });
    expect(bad.status).toBe(400);
  });

  it("uploads a task cover image to R2", async () => {
    const created = await createFullTask();

    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "cover.jpg", {
        type: "image/jpeg",
      }),
    );

    const res = await request(`/api/tasks/${created.id}/cover`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(200);
    const { task } = (await res.json()) as {
      task: { coverImageUrl: string | null };
    };
    expect(task.coverImageUrl).toMatch(/^\/api\/materials\/assets\//);
  });

  it("updates editable fields via PATCH", async () => {
    const created = await createFullTask();

    const res = await request(`/api/tasks/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "改名了", cashbackAmount: 25.5 }),
    });
    expect(res.status).toBe(200);

    const task = await getTask(created.id);
    expect(task.title).toBe("改名了");
  });

  it("stores and clears tracking number and note", async () => {
    const created = await createFullTask();

    const res = await request(`/api/tasks/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        trackingNo: "SF1234567890",
        note: "取件码 8-8-8888，驿站在小区北门",
      }),
    });
    expect(res.status).toBe(200);
    const { task } = (await res.json()) as {
      task: { trackingNo: string | null; note: string | null };
    };
    expect(task.trackingNo).toBe("SF1234567890");
    expect(task.note).toContain("取件码");

    const cleared = await request(`/api/tasks/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingNo: null, note: null }),
    });
    expect(cleared.status).toBe(200);
    const clearedTask = (await cleared.json()) as {
      task: { trackingNo: string | null };
    };
    expect(clearedTask.task.trackingNo).toBeNull();
  });
});
