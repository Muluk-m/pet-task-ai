import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { PawPrint } from "lucide-react";
import {
  Component,
  type ComponentType,
  type ReactNode,
  Suspense,
  lazy,
} from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useMe } from "./api/client";
import { ToastHost } from "./components/toast";
import { AppShell } from "./layout/AppShell";
import { setupPwa } from "./lib/pwa";
// 首屏页面同步加载，保证首屏无额外 chunk 往返
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";

import "./styles.css";

// 非首屏页面按需拆 chunk：命名导出映射成 lazy 需要的 default。
// import 失败（发版后旧 chunk 404）时在 loader 内兜底刷新一次——React.lazy
// 会接管 rejection，window 的 unhandledrejection 监听器收不到这类错误。
// 防重入 key 只在某次 lazy import 成功后清除，不能挂在 window load 上：
// PWA 壳秒开、load 远早于 chunk 请求失败，会击穿守卫造成无限刷新循环。
function lazyPage<K extends string>(
  loader: () => Promise<Record<K, ComponentType>>,
  name: K,
) {
  return lazy(() =>
    loader().then(
      (module) => {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        return { default: module[name] };
      },
      (error) => {
        if (sessionStorage.getItem(CHUNK_RELOAD_KEY) !== "1") {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
          // 刷新已触发：挂起 promise 让 Suspense 停在 fallback，避免白屏
          return new Promise<{ default: ComponentType }>(() => {});
        }
        throw error;
      },
    ),
  );
}

const MaterialsPage = lazyPage(
  () => import("./pages/MaterialsPage"),
  "MaterialsPage",
);
const GeneratePage = lazyPage(
  () => import("./pages/GeneratePage"),
  "GeneratePage",
);
const ImageGeneratePage = lazyPage(
  () => import("./pages/ImageGeneratePage"),
  "ImageGeneratePage",
);
const SettingsPage = lazyPage(
  () => import("./pages/SettingsPage"),
  "SettingsPage",
);
const TaskDetailPage = lazyPage(
  () => import("./pages/TaskDetailPage"),
  "TaskDetailPage",
);
const TaskFormPage = lazyPage(
  () => import("./pages/TaskFormPage"),
  "TaskFormPage",
);
const AiCreatePage = lazyPage(
  () => import("./pages/AiCreatePage"),
  "AiCreatePage",
);

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const CHUNK_RELOAD_KEY = "pt-chunk-reload-attempted";

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  if (
    !/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  ) {
    return;
  }
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") {
    return;
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  window.location.reload();
});

// 兜底守卫击穿后的最后防线：lazy 抛错时不白屏，给出手动刷新入口
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-muted-foreground">
            页面加载失败，可能是刚发布了新版本
          </p>
          <button
            className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground"
            type="button"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 数据本地存一份：查询缓存持久化到 localStorage，离线也能查看
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: CACHE_MAX_AGE,
      staleTime: 30_000,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "pt-local-cache",
});

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-primary">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
        <PawPrint size={32} />
      </div>
      <p className="text-sm text-muted-foreground">Pet Task AI</p>
    </div>
  );
}

function AuthGate() {
  const me = useMe();

  if (me.isLoading) {
    return <Splash />;
  }

  if (!me.data) {
    return <LoginPage />;
  }

  return (
    <PageErrorBoundary>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="materials" element={<MaterialsPage />} />
            <Route path="generate" element={<GeneratePage />} />
            <Route path="image-generate" element={<ImageGeneratePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="tasks/new" element={<TaskFormPage />} />
          <Route path="tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="tasks/:taskId/edit" element={<TaskFormPage />} />
          <Route path="ai-create" element={<AiCreatePage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </PageErrorBoundary>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister, maxAge: CACHE_MAX_AGE }}
  >
    <BrowserRouter>
      <AuthGate />
      <ToastHost />
    </BrowserRouter>
  </PersistQueryClientProvider>,
);

setupPwa();
