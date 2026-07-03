import {
  Archive,
  Bell,
  LogOut,
  RotateCcw,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ptConfig from "../../../../pt.config.json";
import {
  useLogout,
  useMe,
  usePushSubscribe,
  usePushUnsubscribe,
  useTasks,
  useUnarchiveTask,
} from "../api/client";
import { toast } from "../components/toast";
import { Switch } from "../components/ui/switch";
import { parseDbDate } from "../lib/format";
import { urlBase64ToUint8Array } from "../lib/pwa";

function usePushToggle() {
  const subscribe = usePushSubscribe();
  const unsubscribe = usePushUnsubscribe();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }
    setSupported(true);
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEnabled(Boolean(subscription)))
      .catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      if (next) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast("通知权限被拒绝，请在系统设置中开启", "error");
          return;
        }
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            ptConfig.push.vapidPublicKey,
          ) as BufferSource,
        });
        const json = subscription.toJSON();
        await subscribe.mutateAsync({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          },
        });
        setEnabled(true);
        toast("已开启截止提醒");
      } else {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await unsubscribe.mutateAsync(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setEnabled(false);
        toast("已关闭截止提醒");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return { supported, enabled, toggle, busy };
}

export function SettingsPage() {
  const { data } = useTasks();
  const me = useMe();
  const logout = useLogout();
  const unarchiveTask = useUnarchiveTask();
  const push = usePushToggle();

  const stats = useMemo(() => {
    const all = data?.tasks ?? [];
    const now = new Date();

    let total = 0;
    let thisMonth = 0;
    let pendingAmount = 0;

    for (const task of all) {
      const amount = task.cashbackAmount ?? 0;
      if (task.status === "completed") {
        total += amount;
        if (task.completedAt) {
          const completed = parseDbDate(task.completedAt);
          if (
            completed.getFullYear() === now.getFullYear() &&
            completed.getMonth() === now.getMonth()
          ) {
            thisMonth += amount;
          }
        }
      } else if (task.status === "active") {
        const cashbackPending = task.steps.some(
          (step) => step.type === "cashback" && step.status === "pending",
        );
        if (cashbackPending) {
          pendingAmount += amount;
        }
      }
    }

    return { total, thisMonth, pendingAmount };
  }, [data]);

  const archivedTasks = (data?.tasks ?? []).filter(
    (task) => task.status === "archived",
  );

  return (
    <div className="px-4 pt-4 pb-32">
      <header className="flex items-center justify-between">
        <h1 className="text-[26px] font-extrabold">我的</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-xs">
          <UserRound size={15} />
          {me.data?.username}
        </span>
      </header>

      <section className="mt-4 rounded-3xl bg-card p-4 shadow-xs">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Wallet className="text-primary" size={17} />
          返现统计
        </h3>
        <div className="mt-3 grid grid-cols-3 divide-x divide-border text-center">
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">累计返现</p>
            <p className="text-lg font-bold text-primary">
              ¥{stats.total.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">本月返现</p>
            <p className="text-lg font-bold text-primary">
              ¥{stats.thisMonth.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">待回款</p>
            <p className="text-lg font-bold text-warning">
              ¥{stats.pendingAmount.toFixed(2)}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-warning-soft text-warning">
              <Bell size={18} />
            </span>
            <div>
              <p className="text-[15px] font-semibold">截止提醒</p>
              <p className="text-xs text-muted-foreground">
                {push.supported
                  ? "临期/逾期任务每日推送提醒"
                  : "当前浏览器不支持推送（iOS 需先添加到主屏幕）"}
              </p>
            </div>
          </div>
          <Switch
            checked={push.enabled}
            disabled={!push.supported || push.busy}
            onCheckedChange={push.toggle}
          />
        </div>
      </section>

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Archive className="text-primary" size={17} />
          已归档任务
        </h3>
        {archivedTasks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">暂无归档任务</p>
        ) : (
          <div className="mt-2 divide-y divide-border/60">
            {archivedTasks.map((task) => (
              <div
                className="flex items-center justify-between gap-3 py-2.5"
                key={task.id}
              >
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {task.title}
                </span>
                <button
                  className="flex shrink-0 items-center gap-1 text-sm text-primary"
                  type="button"
                  onClick={async () => {
                    await unarchiveTask.mutateAsync(task.id);
                    toast("任务已恢复到进行中");
                  }}
                >
                  <RotateCcw size={13} />
                  恢复
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl bg-card py-3.5 text-sm font-medium text-destructive shadow-xs active:bg-muted"
        type="button"
        onClick={async () => {
          await logout.mutateAsync();
          toast("已退出登录");
        }}
      >
        <LogOut size={16} />
        退出登录
      </button>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Pet Task AI · 构建于 {__APP_VERSION__}
      </p>
    </div>
  );
}
