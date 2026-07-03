export type ChatUserContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

type ChatOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: ChatUserContent;
  jsonMode?: boolean;
  temperature?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export async function chatComplete(options: ChatOptions): Promise<string> {
  const response = await fetch(
    `${options.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        temperature: options.temperature ?? 0.7,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        ...(options.jsonMode
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `AI 网关请求失败 (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(data.error?.message ?? "AI 网关返回了空内容");
  }

  return content;
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 输出中未找到 JSON 对象");
  }

  return JSON.parse(withoutFence.slice(start, end + 1));
}

// 生图走 sub2api 的 gpt-image-2；images 端点挂在网关根路径（无 /v1）
const IMAGE_MODEL = "gpt-image-2";

type ImageGenOptions = {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  size: string;
  references?: Blob[];
};

type ImagesResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
};

/** 文生图 / 图生图（带参考图走 /images/edits），返回 PNG 字节 */
export async function generateImage(
  options: ImageGenOptions,
): Promise<Uint8Array> {
  const base = options.baseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
  const headers = { authorization: `Bearer ${options.apiKey}` };

  let response: Response;
  if (options.references && options.references.length > 0) {
    const form = new FormData();
    form.append("model", IMAGE_MODEL);
    form.append("prompt", options.prompt);
    form.append("size", options.size);
    form.append("quality", "medium");
    form.append("n", "1");
    options.references.forEach((blob, index) => {
      form.append("image", blob, `ref-${index}.png`);
    });
    response = await fetch(`${base}/images/edits`, {
      method: "POST",
      headers,
      body: form,
    });
  } else {
    response = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: options.prompt,
        size: options.size,
        quality: "medium",
        n: 1,
      }),
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `生图请求失败 (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as ImagesResponse;
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error(data.error?.message ?? "生图返回为空");
  }
  return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
}

/** data URL -> Blob（生图参考图用） */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?)(;|$)/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
