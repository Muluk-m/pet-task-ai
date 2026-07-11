/**
 * 带超时的出站 fetch，超时窗口覆盖到响应 body 读完——
 * 上游「返回响应头后 body 挂起」同样会被 abort，而不是只保护到首字节。
 * 超时抛出带 label 的可识别错误，由调用方的重试/降级逻辑接住。
 */
export type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
};

export async function fetchTextWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label}超时（${timeoutMs / 1000}s 无响应）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
