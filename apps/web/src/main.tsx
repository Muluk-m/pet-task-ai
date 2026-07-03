import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { PawPrint } from "lucide-react";
import { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useMe } from "./api/client";
import { ToastHost } from "./components/toast";
import { AppShell } from "./layout/AppShell";
import { setupPwa } from "./lib/pwa";
import { AiCreatePage } from "./pages/AiCreatePage";
import { GeneratePage } from "./pages/GeneratePage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TaskFormPage } from "./pages/TaskFormPage";

// 详情页带 dnd-kit，按路由分包，避免进首屏 bundle
const TaskDetailPage = lazy(() =>
  import("./pages/TaskDetailPage").then((m) => ({
    default: m.TaskDetailPage,
  })),
);
import "./styles.css";

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

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
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="materials" element={<MaterialsPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="tasks/new" element={<TaskFormPage />} />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="tasks/:taskId/edit" element={<TaskFormPage />} />
        <Route path="ai-create" element={<AiCreatePage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
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
