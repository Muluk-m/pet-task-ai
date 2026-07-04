import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";

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
});

afterEach(() => {
  vi.unstubAllGlobals();
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

function postJson(path: string, body: unknown, method = "POST") {
  return request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockQueueFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/channels")) {
      return Response.json({
        channels: [
          {
            id: "openai-images",
            kind: "openai-queue",
            label: "OpenAI",
            models: [
              {
                id: "gpt-image-2",
                label: "GPT Image 2",
                capabilities: ["generate", "edit", "mask", "quality"],
              },
            ],
          },
          {
            id: "gemini-flash-image",
            kind: "gemini-queue",
            label: "Gemini",
            models: [
              {
                id: "gemini-3.1-flash-image",
                label: "Gemini 3.1 Flash Image",
                capabilities: ["generate", "edit"],
              },
            ],
          },
          {
            id: "agnes-images",
            kind: "openai-queue",
            label: "Agnes AI",
            models: [
              {
                id: "agnes-image-2.1-flash",
                label: "Agnes Image 2.1 Flash",
                capabilities: ["generate", "edit"],
              },
            ],
          },
        ],
      });
    }
    if (url.endsWith("/submit")) {
      return Response.json({
        request_id: "queue-request-1",
        status: "queued",
        submitted_at: 1000,
      });
    }
    if (url.endsWith("/status")) {
      return Response.json({
        request_id: "queue-request-1",
        status: "completed",
        submitted_at: 1000,
        started_at: 1100,
        completed_at: 2000,
        result: {
          images: [{ index: 0, mime: "image/png", width: 1024, height: 1024 }],
        },
      });
    }
    if (url.endsWith("/image/0")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      });
    }
    return Response.json({ error: "unexpected_url", url }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AI image queue API", () => {
  it("exposes image models from upstream channels", async () => {
    mockQueueFetch();
    const res = await request("/api/ai/image-queue-config");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      enabled: boolean;
      defaultProvider: string;
      defaultModel: string;
      providers: Array<{
        id: string;
        models: Array<{ id: string; model: string; label: string }>;
      }>;
    };

    expect(data.enabled).toBe(true);
    expect(data.defaultProvider).toBe("openai-images");
    expect(data.defaultModel).toBe("gpt-image-2");
    expect(data.providers).toContainEqual({
      id: "openai-images",
      label: "OpenAI",
      models: [
        expect.objectContaining({
          id: "gpt-image-2",
          model: "gpt-image-2",
          label: "GPT Image 2",
        }),
      ],
    });
    expect(data.providers).toContainEqual({
      id: "agnes-images",
      label: "Agnes AI",
      models: [
        expect.objectContaining({
          id: "agnes-image-2.1-flash",
          model: "agnes-image-2.1-flash",
          label: "Agnes Image 2.1 Flash",
        }),
      ],
    });
  });

  it("submits and lists queued image jobs", async () => {
    const fetchMock = mockQueueFetch();
    const res = await postJson("/api/ai/image-jobs", {
      prompt: "真实摄影感产品图",
      provider: "openai-images",
      model: "gpt-image-2",
      size: "1024x1024",
    });

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://image.nainma.online/v1/queue/openai-images/gpt-image-2/submit",
      expect.objectContaining({ method: "POST" }),
    );
    const { job } = (await res.json()) as { job: { status: string } };
    expect(job.status).toBe("queued");

    const list = await request("/api/ai/image-jobs");
    expect(list.status).toBe(200);
    const { jobs } = (await list.json()) as { jobs: Array<{ id: number }> };
    expect(jobs.length).toBeGreaterThan(0);
  });

  it("refreshes a queued image job to completed", async () => {
    mockQueueFetch();
    const created = await postJson("/api/ai/image-jobs", {
      prompt: "方形产品图",
      provider: "openai-images",
      model: "gpt-image-2",
      size: "1024x1024",
    });
    const { job } = (await created.json()) as { job: { id: number } };

    const refreshed = await postJson(
      `/api/ai/image-jobs/${job.id}/refresh`,
      {},
    );
    expect(refreshed.status).toBe(200);
    const data = (await refreshed.json()) as {
      job: { status: string; resultJson: { images: unknown[] } | null };
    };
    expect(data.job.status).toBe("completed");
    expect(data.job.resultJson?.images.length).toBe(1);
  });

  it("saves a completed generated image as material", async () => {
    mockQueueFetch();
    const created = await postJson("/api/ai/image-jobs", {
      prompt: "素材图",
      provider: "openai-images",
      model: "gpt-image-2",
      size: "1024x1024",
    });
    const { job } = (await created.json()) as { job: { id: number } };
    await postJson(`/api/ai/image-jobs/${job.id}/refresh`, {});

    const saved = await postJson(`/api/ai/image-jobs/${job.id}/save`, {
      index: 0,
      type: "pet_image",
      title: "AI 生成素材",
      tags: ["AI生成"],
    });
    expect(saved.status).toBe(201);
    const data = (await saved.json()) as {
      material: { assetUrl: string; assetMimeType: string };
    };
    expect(data.material.assetUrl).toContain("/api/materials/assets/");
    expect(data.material.assetMimeType).toBe("image/png");
  });

  it("deletes a completed image job", async () => {
    mockQueueFetch();
    const created = await postJson("/api/ai/image-jobs", {
      prompt: "可删除素材图",
      provider: "openai-images",
      model: "gpt-image-2",
      size: "1024x1024",
    });
    const { job } = (await created.json()) as { job: { id: number } };
    await postJson(`/api/ai/image-jobs/${job.id}/refresh`, {});

    const deleted = await request(`/api/ai/image-jobs/${job.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);

    const list = await request("/api/ai/image-jobs");
    const { jobs } = (await list.json()) as {
      jobs: Array<{ id: number }>;
    };
    expect(jobs.some((item) => item.id === job.id)).toBe(false);
  });
});
