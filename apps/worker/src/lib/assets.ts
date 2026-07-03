/** R2 资产的 key / URL / 清理约定，materials 与用户头像共用 */

// 历史原因：资产统一走 materials 的服务路由，改前缀需同时迁移已存 URL
export const ASSET_URL_PREFIX = "/api/materials/assets/";

export function createAssetKey(fileName: string, prefix = ""): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
  return `${prefix}${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}.${extension}`;
}

export async function putAsset(
  bucket: R2Bucket,
  file: File,
  keyPrefix = "",
): Promise<{ key: string; url: string }> {
  const key = createAssetKey(file.name, keyPrefix);
  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  return { key, url: `${ASSET_URL_PREFIX}${encodeURIComponent(key)}` };
}

export async function deleteAssetByUrl(
  bucket: R2Bucket,
  url: string | null | undefined,
): Promise<void> {
  if (url?.startsWith(ASSET_URL_PREFIX)) {
    await bucket.delete(decodeURIComponent(url.slice(ASSET_URL_PREFIX.length)));
  }
}
