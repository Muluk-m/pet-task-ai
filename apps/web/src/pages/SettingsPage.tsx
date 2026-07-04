import {
  Archive,
  Bell,
  Bot,
  Camera,
  Check,
  KeyRound,
  LogOut,
  Pencil,
  RotateCcw,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ptConfig from "../../../../pt.config.json";
import {
  useAiModelConfig,
  useChangePassword,
  useLogout,
  useMe,
  usePushSubscribe,
  usePushUnsubscribe,
  useTasks,
  useUnarchiveTask,
  useUpdateProfile,
  useUploadAvatar,
} from "../api/client";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import {
  AI_MODEL_STORAGE_KEY,
  getSelectedAiModel,
  setSelectedAiModel,
} from "../lib/ai-model";
import { formatMoney, parseDbDate } from "../lib/format";
import { compressImageFile, thumbnailUrl } from "../lib/image";
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

function ProfileCard() {
  const me = useMe();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const user = me.data;
  if (!user) {
    return null;
  }
  const shownName = user.displayName ?? user.username;

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) {
      toast("名称不能为空", "error");
      return;
    }
    try {
      await updateProfile.mutateAsync({ displayName: name });
      setEditingName(false);
      toast("名称已更新");
    } catch (error) {
      toast(error instanceof Error ? error.message : "更新失败", "error");
    }
  }

  async function pickAvatar(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      // 头像展示尺寸小，压到 512px 足够
      await uploadAvatar.mutateAsync(await compressImageFile(file, 512));
      toast("头像已更新");
    } catch (error) {
      toast(error instanceof Error ? error.message : "上传失败", "error");
    }
  }

  return (
    <section className="mt-4 rounded-3xl bg-card p-4 shadow-xs">
      <div className="flex items-center gap-3.5">
        <button
          className="relative shrink-0"
          disabled={uploadAvatar.isPending}
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary">
            {user.avatarUrl ? (
              <img
                alt="头像"
                className="size-full object-cover"
                src={thumbnailUrl(user.avatarUrl, 128)}
              />
            ) : (
              <UserRound size={28} />
            )}
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
            <Camera size={13} />
          </span>
        </button>
        <input
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          type="file"
          onChange={(event) => {
            pickAvatar(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                className="h-9"
                maxLength={24}
                placeholder="输入名称"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
              />
              <button
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                disabled={updateProfile.isPending}
                type="button"
                onClick={saveName}
              >
                <Check size={16} />
              </button>
              <button
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                type="button"
                onClick={() => setEditingName(false)}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-lg font-bold">
              <span className="truncate">{shownName}</span>
              <button
                className="shrink-0 text-muted-foreground"
                type="button"
                onClick={() => {
                  setNameDraft(shownName);
                  setEditingName(true);
                }}
              >
                <Pencil size={14} />
              </button>
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            @{user.username}
          </p>
        </div>
      </div>
    </section>
  );
}

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function submit() {
    if (newPassword.length < 6) {
      toast("新密码至少 6 位", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("两次输入的新密码不一致", "error");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("密码已修改");
    } catch (error) {
      toast(error instanceof Error ? error.message : "修改失败", "error");
    }
  }

  return (
    <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
      <button
        className="flex w-full items-center gap-2.5 text-left"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
          <KeyRound size={18} />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold">修改密码</span>
          <span className="block text-xs text-muted-foreground">
            修改当前账号的登录密码
          </span>
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2.5">
          <Input
            autoComplete="current-password"
            placeholder="当前密码"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            autoComplete="new-password"
            placeholder="新密码（至少 6 位）"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <Input
            autoComplete="new-password"
            placeholder="确认新密码"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button
            className="w-full rounded-xl"
            disabled={changePassword.isPending}
            onClick={submit}
          >
            {changePassword.isPending ? "提交中..." : "确认修改"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function AiModelCard() {
  const { data } = useAiModelConfig();
  const [selected, setSelected] = useState<string>(
    () => getSelectedAiModel() ?? "",
  );

  const options = useMemo(
    () =>
      data?.providers.flatMap((provider) =>
        provider.models.map((model) => ({
          ...model,
          providerId: provider.id,
        })),
      ) ?? [],
    [data],
  );
  const current = selected || data?.defaultModel || "";
  const currentModel = options.find((model) => model.ref === current);

  useEffect(() => {
    if (!data) {
      return;
    }
    const stored = getSelectedAiModel();
    if (!stored) {
      setSelected(data.defaultModel);
      return;
    }
    if (options.some((model) => model.ref === stored)) {
      setSelected(stored);
      return;
    }
    window.localStorage.removeItem(AI_MODEL_STORAGE_KEY);
    setSelected(data.defaultModel);
  }, [data, options]);

  function choose(modelRef: string) {
    setSelected(modelRef);
    setSelectedAiModel(modelRef);
    const model = options.find((item) => item.ref === modelRef);
    toast(model ? `已切换到 ${model.label}` : "AI 模型已更新");
  }

  return (
    <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
      <div className="flex items-start gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Bot size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">AI 模型</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            速度和质量可以自己取舍；失败时后端会按配置自动 fallback
          </p>
          <select
            className="mt-3 h-11 w-full rounded-2xl border border-input bg-card px-3 text-sm outline-none"
            disabled={!data}
            value={current}
            onChange={(event) => choose(event.target.value)}
          >
            {options.map((model) => (
              <option key={model.ref} value={model.ref}>
                {model.label}
                {model.supportsVision ? " · 支持截图" : ""}
              </option>
            ))}
          </select>
          {currentModel?.description ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {currentModel.description}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { data } = useTasks();
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
      <header>
        <h1 className="text-[26px] font-extrabold">我的</h1>
      </header>

      <ProfileCard />

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Wallet className="text-primary" size={17} />
          返现统计
        </h3>
        <div className="mt-3 grid grid-cols-3 divide-x divide-border text-center">
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">累计返现</p>
            <p className="text-lg font-bold text-primary">
              {formatMoney(stats.total)}
            </p>
          </div>
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">本月返现</p>
            <p className="text-lg font-bold text-primary">
              {formatMoney(stats.thisMonth)}
            </p>
          </div>
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">待回款</p>
            <p className="text-lg font-bold text-warning">
              {formatMoney(stats.pendingAmount)}
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

      <AiModelCard />

      <ChangePasswordCard />

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Archive size={18} />
          </span>
          <div>
            <p className="text-[15px] font-semibold">已归档任务</p>
            <p className="text-xs text-muted-foreground">
              {archivedTasks.length === 0
                ? "暂无归档任务"
                : `${archivedTasks.length} 个任务已归档，可随时恢复`}
            </p>
          </div>
        </div>
        {archivedTasks.length === 0 ? null : (
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
