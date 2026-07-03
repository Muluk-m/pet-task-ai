import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Pet Task AI",
        short_name: "PetTask",
        description: "宠物置换任务管理",
        lang: "zh-CN",
        start_url: "/",
        display: "standalone",
        background_color: "#f5f1e8",
        theme_color: "#f5f1e8",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(
      new Date()
        .toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
        .replace(/\//g, "-"),
    ),
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
