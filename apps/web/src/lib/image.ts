/** 压缩图片为 JPEG data URL，控制上传体积（长边默认 1600px） */
export async function fileToCompressedDataUrl(
  file: File,
  maxDimension = 1600,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
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

  return canvas.toDataURL("image/jpeg", 0.82);
}

/** 把同源图片复制到剪贴板（统一转 PNG，Safari/Chrome 均支持） */
export async function copyImageToClipboard(url: string): Promise<void> {
  const blob = await fetch(url).then((res) => res.blob());
  if (blob.type === "image/png") {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("图片转换失败")),
      "image/png",
    );
  });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** 下载图片到本地/相册（资源均为同源，直接用下载链接，不经内存中转） */
export function downloadImage(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}
