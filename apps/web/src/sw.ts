/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

const IMAGE_CACHE_NAME = "pet-task-runtime-images-v1";
const IMAGE_CACHE_MAX_ENTRIES = 160;

// 发布即生效：新 SW 立即接管所有页面，配合前端 controllerchange 自动刷新
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// 预缓存构建产物（文件名带 hash，发布自动失效）
precacheAndRoute(self.__WB_MANIFEST);

// SPA 导航回退到 index.html；/api/* 永不拦截（数据必须实时）
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//],
  }),
);

function isRuntimeImageRequest(request: Request, url: URL): boolean {
  if (request.method !== "GET") {
    return false;
  }
  if (request.destination === "image") {
    return (
      url.pathname.startsWith("/api/materials/assets/") ||
      url.pathname.startsWith("/api/ai/image-jobs/") ||
      (url.pathname.startsWith("/cdn-cgi/image/") &&
        url.pathname.includes("/api/materials/assets/"))
    );
  }
  return (
    url.pathname.startsWith("/api/materials/assets/") ||
    /^\/api\/ai\/image-jobs\/\d+\/image\/\d+$/.test(url.pathname)
  );
}

async function trimImageCache(cache: Cache) {
  const keys = await cache.keys();
  const overflow = keys.length - IMAGE_CACHE_MAX_ENTRIES;
  if (overflow <= 0) {
    return;
  }
  await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
}

registerRoute(
  ({ request, url }) => isRuntimeImageRequest(request, url),
  async ({ request }) => {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await trimImageCache(cache);
    }
    return response;
  },
);

// 临期任务提醒：服务端发送无 payload 推送，这里展示固定文案
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Pet Task AI", {
      body: "有置换任务即将截止，点开看看进度吧 🐾",
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      tag: "deadline-reminder",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients[0];
        if (existing) {
          return existing.focus();
        }
        return self.clients.openWindow("/");
      }),
  );
});
