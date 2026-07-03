async function drawToCanvas(
  source: Blob,
  maxDimension: number,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("当前浏览器不支持图片处理");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("图片转换失败")),
      type,
      quality,
    );
  });
}

/** 压缩图片为 JPEG data URL，控制上传体积（长边默认 1600px） */
export async function fileToCompressedDataUrl(
  file: File,
  maxDimension = 1600,
): Promise<string> {
  const canvas = await drawToCanvas(file, maxDimension);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/** 上传前压缩图片文件：长边限制 + JPEG 重编码；小文件原样返回 */
export async function compressImageFile(
  file: File,
  maxDimension = 1600,
): Promise<File> {
  if (file.size < 200_000) {
    return file;
  }
  const canvas = await drawToCanvas(file, maxDimension);
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
    type: "image/jpeg",
  });
}

/**
 * 把同源图片复制到剪贴板（统一转 PNG）。
 * ClipboardItem 直接接收 Promise，保证 write 在用户手势的同步窗口内发起，
 * 否则 Safari/Chrome 会因手势过期报 NotAllowedError（permission denied）。
 */
export function copyImageToClipboard(url: string): Promise<void> {
  const pngBlob = (async () => {
    const blob = await fetch(url).then((res) => res.blob());
    if (blob.type === "image/png") {
      return blob;
    }
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvasToBlob(canvas, "image/png");
  })();
  return navigator.clipboard.write([
    new ClipboardItem({ "image/png": pngBlob }),
  ]);
}

/** 复制纯文本到剪贴板（页面侧再包 toast，与 copyImageToClipboard 分层一致） */
export function copyText(value: string): Promise<void> {
  return navigator.clipboard.writeText(value);
}

/**
 * 缩略图 URL：自定义域名上走 Cloudflare 图片转换（/cdn-cgi/image 按需缩放 +
 * format=auto + 边缘缓存）；localhost 与 workers.dev 不支持转换，原样返回。
 */
export function thumbnailUrl(assetUrl: string, width: number): string {
  const host = location.hostname;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".workers.dev") ||
    !assetUrl.startsWith("/")
  ) {
    return assetUrl;
  }
  return `/cdn-cgi/image/width=${width},quality=78,format=auto${assetUrl}`;
}

/** 下载图片到本地/相册（资源均为同源，直接用下载链接，不经内存中转） */
export function downloadImage(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}
