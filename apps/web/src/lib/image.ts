import {
  type CompressRequest,
  type CompressResponse,
  scaledSize,
} from "./image-protocol";

const JPEG_QUALITY = 0.82;

async function drawToCanvas(
  source: Blob,
  maxDimension: number,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(source);
  const { width, height } = scaledSize(
    bitmap.width,
    bitmap.height,
    maxDimension,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

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

/** 主线程压缩：canvas 缩放 + JPEG 重编码。作为 worker 不可用时的降级路径 */
async function compressToJpegBlobOnMain(
  source: Blob,
  maxDimension: number,
): Promise<Blob> {
  const canvas = await drawToCanvas(source, maxDimension);
  return canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
}

// 图片压缩 worker：单例懒加载，用 id 关联并发请求；一旦判定不可用（老 Safari 无
// OffscreenCanvas、worker 构建/运行失败）便永久降级到主线程，不再反复尝试。
// 每个 job 带超时：worker 被浏览器静默杀死（不触发 error 事件）时 promise
// 也必须 settle，否则上传永久转圈、主线程降级路径不可达。
const WORKER_JOB_TIMEOUT_MS = 12_000;

type PendingJob = {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let compressWorker: Worker | null = null;
let workerUnavailable = false;
let workerRequestId = 0;
const pendingWorkerJobs = new Map<number, PendingJob>();

/** 取出并清理一个在途 job（含超时定时器），已被超时清掉时返回 null */
function takePendingJob(id: number): PendingJob | null {
  const job = pendingWorkerJobs.get(id);
  if (!job) {
    return null;
  }
  clearTimeout(job.timer);
  pendingWorkerJobs.delete(id);
  return job;
}

function rejectAllPendingJobs(message: string) {
  for (const [id] of pendingWorkerJobs) {
    takePendingJob(id)?.reject(new Error(message));
  }
}

function supportsOffscreenCompression(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function"
  );
}

function getCompressWorker(): Worker | null {
  if (workerUnavailable) {
    return null;
  }
  if (compressWorker) {
    return compressWorker;
  }
  if (!supportsOffscreenCompression()) {
    workerUnavailable = true;
    return null;
  }
  try {
    const worker = new Worker(new URL("./image-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener(
      "message",
      (event: MessageEvent<CompressResponse>) => {
        const job = takePendingJob(event.data.id);
        if (!job) {
          return;
        }
        if ("error" in event.data) {
          job.reject(new Error(event.data.error));
        } else {
          job.resolve(event.data.blob);
        }
      },
    );
    worker.addEventListener("error", () => {
      // worker 整体崩溃：拒掉在途请求并永久降级
      workerUnavailable = true;
      rejectAllPendingJobs("图片处理 worker 异常");
      compressWorker = null;
    });
    worker.addEventListener("messageerror", () => {
      // 响应反序列化失败：无法定位具体 job，拒掉全部在途请求走主线程降级
      rejectAllPendingJobs("图片处理 worker 响应异常");
    });
    compressWorker = worker;
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

/** 优先用 worker + OffscreenCanvas 压缩，失败或不支持时降级到主线程 */
async function compressToJpegBlob(
  source: Blob,
  maxDimension: number,
): Promise<Blob> {
  const worker = getCompressWorker();
  if (worker) {
    const id = ++workerRequestId;
    try {
      return await new Promise<Blob>((resolve, reject) => {
        // 单例 worker 串行处理：批量上传时后排 job 的等待时间也在计时内，
        // 超时预算按当前队列深度放宽，避免排队被误判为挂起
        const timeoutMs = WORKER_JOB_TIMEOUT_MS * (pendingWorkerJobs.size + 1);
        const timer = setTimeout(() => {
          if (pendingWorkerJobs.delete(id)) {
            reject(new Error("图片处理超时"));
          }
        }, timeoutMs);
        pendingWorkerJobs.set(id, { resolve, reject, timer });
        const request: CompressRequest = {
          id,
          blob: source,
          maxDimension,
          quality: JPEG_QUALITY,
        };
        worker.postMessage(request);
      });
    } catch (error) {
      // 单次 worker 失败/超时：本次降级到主线程（worker 崩溃已在 error 回调里永久降级）；
      // 保留 worker 侧错误便于排查，不静默吞掉
      console.warn("[image] worker 压缩失败，降级主线程", error);
    }
  }
  return compressToJpegBlobOnMain(source, maxDimension);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

/** 压缩图片为 JPEG data URL，控制上传体积（长边默认 1600px） */
export async function fileToCompressedDataUrl(
  file: File,
  maxDimension = 1600,
): Promise<string> {
  const blob = await compressToJpegBlob(file, maxDimension);
  return blobToDataUrl(blob);
}

/** 上传前压缩图片文件：长边限制 + JPEG 重编码；小文件原样返回 */
export async function compressImageFile(
  file: File,
  maxDimension = 1600,
): Promise<File> {
  if (file.size < 200_000) {
    return file;
  }
  const blob = await compressToJpegBlob(file, maxDimension);
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
export async function downloadImage(url: string, filename: string) {
  // 直接把远程 URL 挂到 <a download> 在移动端 / PWA 里不可靠（download 属性常被忽略，
  // 点击退化成导航，可能被 SW/SPA 兜底成「保存网页」）。改为先取回 Blob 再用同源
  // blob: URL 触发下载，跨浏览器最稳；文件名清洗掉非法字符（如日期里的 /）。
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("图片加载失败");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename.replace(/[/\\:*?"<>|]/g, "-");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
