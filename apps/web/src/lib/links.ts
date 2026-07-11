/**
 * 从小红书/抖音分享的混合文案（中文 + emoji + 链接 + 引号包裹）里抽出第一个 http(s) 链接。
 * 字符类须排除全角引号/括号等中文包裹符——它们能通过 new URL 和 z.string().url()
 * 校验（IDNA 转码后仍算合法），一旦截进 URL 就是打不开的坏链接入库。
 */
const HTTP_LINK_PATTERN =
  /https?:\/\/[^\s，。；、"'<>“”‘’「」『』（）【】《》〈〉]+/;

export function extractHttpLink(text: string): string | null {
  return text.match(HTTP_LINK_PATTERN)?.[0] ?? null;
}
