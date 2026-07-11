/// <reference lib="webworker" />

// 图片压缩 worker：用 OffscreenCanvas 把大图缩放 + 重编码为 JPEG，避免阻塞主线程。
// 主线程通过 id 关联请求与响应；任一步骤失败回传 error 让主线程降级到同步实现。

import {
  type CompressRequest,
  type CompressResponse,
  scaledSize,
} from "./image-protocol";

self.addEventListener(
  "message",
  async (event: MessageEvent<CompressRequest>) => {
    const { id, blob, maxDimension, quality } = event.data;
    try {
      const bitmap = await createImageBitmap(blob);
      const { width, height } = scaledSize(
        bitmap.width,
        bitmap.height,
        maxDimension,
      );

      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("OffscreenCanvas 2d context 不可用");
      }
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const result = await canvas.convertToBlob({
        type: "image/jpeg",
        quality,
      });
      const response: CompressResponse = { id, blob: result };
      self.postMessage(response);
    } catch (error) {
      const response: CompressResponse = {
        id,
        error: error instanceof Error ? error.message : "图片处理失败",
      };
      self.postMessage(response);
    }
  },
);
