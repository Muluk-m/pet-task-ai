// 图片压缩 worker 与主线程共享的消息协议与缩放规则。
// postMessage 边界没有跨文件编译期检查，协议必须单一定义，两侧 import 同一来源防漂移。
// 本模块不得有任何副作用（worker 与主线程都会打包引入）。

export type CompressRequest = {
  id: number;
  blob: Blob;
  maxDimension: number;
  quality: number;
};

export type CompressResponse =
  | { id: number; blob: Blob }
  | { id: number; error: string };

/** 长边限制缩放：返回目标宽高（至少 1px，只缩不放） */
export function scaledSize(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
