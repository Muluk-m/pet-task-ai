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
