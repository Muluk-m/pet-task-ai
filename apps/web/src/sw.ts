/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

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
