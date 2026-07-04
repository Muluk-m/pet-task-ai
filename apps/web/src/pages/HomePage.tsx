import { type OrderChannel, orderChannelNames } from "@pet-task-ai/shared";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  ClipboardCheck,
  LayoutGrid,
  List,
  PawPrint,
  Plus,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useCompleteStep, useTasks } from "../api/client";
import type { TaskWithSteps } from "../api/types";
import {
  CashbackBadge,
  PlaceholderImage,
  PlatformBadge,
  StatusPill,
  StepRail,
  deadlineBadgeText,
  platformVisuals,
} from "../components/bits";
import { toast } from "../components/toast";
import { formatMoney } from "../lib/format";
import { cn } from "../lib/utils";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) {
    return "夜深了，";
  }
  if (hour < 11) {
    return "早上好，";
  }
  if (hour < 13) {
    return "中午好，";
  }
  if (hour < 18) {
    return "下午好，";
  }
  return "晚上好，";
}

const nextStepLabels: Record<string, string> = {
  delivery: "等待到货",
  xiaohongshu_note: "发布小红书",
  douyin_post: "发布抖音",
  ecommerce_review: "提交好评",
  cashback: "确认返现",
};

const TASK_VIEW_STORAGE_KEY = "pet-task-home-view";
const LIST_ROW_HEIGHT = 84;
const LIST_OVERSCAN = 8;

type TaskViewMode = "card" | "list";

function isWaitingCashback(task: TaskWithSteps): boolean {
  const pending = task.steps.filter((s) => s.status === "pending");
  return pending.length > 0 && pending.every((s) => s.type === "cashback");
}

function taskNextAction(task: TaskWithSteps): {
  firstPending: TaskWithSteps["steps"][number] | undefined;
  waitingCashback: boolean;
  waitingDelivery: boolean;
  hasCashback: boolean;
} {
  const sortedSteps = [...task.steps].sort((a, b) => a.id - b.id);
  const firstPending = sortedSteps.find((s) => s.status === "pending");
  return {
    firstPending,
    waitingCashback: isWaitingCashback(task),
    waitingDelivery: firstPending?.type === "delivery",
    hasCashback: task.steps.some((s) => s.type === "cashback"),
  };
}

function TaskActionBadge({
  firstPending,
  waitingCashback,
  waitingDelivery,
  className,
}: Pick<
  ReturnType<typeof taskNextAction>,
  "firstPending" | "waitingCashback" | "waitingDelivery"
> & {
  className?: string;
}) {
  if (waitingCashback) {
    return (
      <span
        className={cn(
          "rounded-lg bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning",
          className,
        )}
      >
        最后一步：确认返现
      </span>
    );
  }
  if (waitingDelivery) {
    return (
      <span
        className={cn(
          "rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-primary",
          className,
        )}
      >
        待收货：到货后确认
      </span>
    );
  }
  if (firstPending) {
    return (
      <span
        className={cn(
          "rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive",
          className,
        )}
      >
        下一步：{nextStepLabels[firstPending.type]}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground",
        className,
      )}
    >
      下一步：选择任务步骤
    </span>
  );
}

function TaskCard({ task }: { task: TaskWithSteps }) {
  const completeStep = useCompleteStep(task.id);

  const { firstPending, waitingCashback, waitingDelivery, hasCashback } =
    taskNextAction(task);

  async function quickComplete(
    event: React.MouseEvent,
    stepType: "delivery" | "cashback",
    doneToast: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const step = task.steps.find(
      (s) => s.type === stepType && s.status === "pending",
    );
    if (!step) {
      return;
    }
    await completeStep.mutateAsync({ stepId: step.id });
    toast(doneToast);
  }

  return (
    <Link
      className="block rounded-3xl border border-border/80 bg-card p-3.5 shadow-xs active:scale-[0.99]"
      to={`/tasks/${task.id}`}
    >
      <div className="flex gap-3">
        <PlaceholderImage
          badge={deadlineBadgeText(task.deadline)}
          src={task.coverImageUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="flex min-w-0 items-center gap-1 truncate text-[13px] text-muted-foreground">
              <Store className="shrink-0" size={13} strokeWidth={1.8} />
              {task.merchantName ?? "未填写商家"}
            </span>
            {task.orderChannel && platformVisuals[task.orderChannel] ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/70">
                <PlatformBadge platform={task.orderChannel} size={13} />
                {orderChannelNames[task.orderChannel as OrderChannel]}
              </span>
            ) : null}
            <CashbackBadge required={hasCashback} />
            <ChevronRight
              className="ml-auto shrink-0 text-muted-foreground/50"
              size={18}
            />
          </div>
          <h3 className="mt-0.5 truncate text-[17px] font-bold">
            {task.title}
          </h3>
          <div className="mt-2">
            <StepRail steps={task.steps} />
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <TaskActionBadge
          className="max-w-full truncate text-[10px]"
          firstPending={firstPending}
          waitingCashback={waitingCashback}
          waitingDelivery={waitingDelivery}
        />
        {waitingCashback ? (
          <button
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground active:scale-95"
            disabled={completeStep.isPending}
            type="button"
            onClick={(event) =>
              quickComplete(event, "cashback", "已确认返现，任务完成 🎉")
            }
          >
            确认返现
          </button>
        ) : waitingDelivery ? (
          <button
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground active:scale-95"
            disabled={completeStep.isPending}
            type="button"
            onClick={(event) => quickComplete(event, "delivery", "已确认收货")}
          >
            确认收货
          </button>
        ) : null}
      </div>
    </Link>
  );
}

function TaskListItem({ task }: { task: TaskWithSteps }) {
  const { firstPending, waitingCashback, waitingDelivery, hasCashback } =
    taskNextAction(task);
  const deadline = deadlineBadgeText(task.deadline);
  const actionLabel = waitingCashback
    ? "待返现"
    : waitingDelivery
      ? "待收货"
      : firstPending
        ? (nextStepLabels[firstPending.type] ?? "待处理")
        : "待处理";

  return (
    <Link
      className="grid h-[76px] grid-cols-[56px_minmax(0,1fr)_76px] items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 shadow-xs active:bg-muted"
      to={`/tasks/${task.id}`}
    >
      <PlaceholderImage
        badge={deadline}
        className="rounded-xl"
        size="sm"
        src={task.coverImageUrl}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <h4 className="min-w-0 truncate text-[15px] font-bold leading-tight">
            {task.title}
          </h4>
          <CashbackBadge required={hasCashback} />
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] leading-none text-muted-foreground">
          {task.orderChannel && platformVisuals[task.orderChannel] ? (
            <PlatformBadge platform={task.orderChannel} size={12} />
          ) : (
            <Store className="shrink-0" size={12} strokeWidth={1.8} />
          )}
          <span className="truncate">{task.merchantName ?? "未填写商家"}</span>
          {deadline ? (
            <>
              <span className="shrink-0 text-border">/</span>
              <span className="shrink-0">{deadline}</span>
            </>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[11px] leading-none text-muted-foreground">
          {task.steps.filter((step) => step.status === "completed").length}/
          {task.steps.length} 步已完成
        </p>
      </div>
      <div className="flex min-w-0 flex-col items-end gap-1">
        {task.cashbackAmount != null ? (
          <span className="max-w-full truncate text-xs font-bold text-warning">
            {formatMoney(task.cashbackAmount)}
          </span>
        ) : null}
        <span
          className={cn(
            "max-w-full truncate rounded-md px-2 py-1 text-[11px] font-medium leading-none",
            waitingDelivery
              ? "bg-secondary text-primary"
              : waitingCashback
                ? "bg-warning-soft text-warning"
                : "bg-destructive/10 text-destructive",
          )}
        >
          {actionLabel}
        </span>
      </div>
    </Link>
  );
}

function VirtualTaskList({ tasks }: { tasks: TaskWithSteps[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [windowState, setWindowState] = useState({ start: 0, end: 30 });

  useEffect(() => {
    function updateWindow() {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const visibleStart = Math.max(0, -rect.top);
      const visibleEnd = Math.max(visibleStart, viewportHeight - rect.top);
      const start = Math.max(
        0,
        Math.floor(visibleStart / LIST_ROW_HEIGHT) - LIST_OVERSCAN,
      );
      const end = Math.min(
        tasks.length,
        Math.ceil(visibleEnd / LIST_ROW_HEIGHT) + LIST_OVERSCAN,
      );
      setWindowState((current) =>
        current.start === start && current.end === end
          ? current
          : { start, end },
      );
    }

    updateWindow();
    window.addEventListener("scroll", updateWindow, { passive: true });
    window.addEventListener("resize", updateWindow);
    return () => {
      window.removeEventListener("scroll", updateWindow);
      window.removeEventListener("resize", updateWindow);
    };
  }, [tasks.length]);

  const visibleTasks = tasks.slice(windowState.start, windowState.end);
  const topSpacer = windowState.start * LIST_ROW_HEIGHT;
  const bottomSpacer =
    Math.max(0, tasks.length - windowState.end) * LIST_ROW_HEIGHT;

  return (
    <div ref={containerRef}>
      <div style={{ height: topSpacer }} />
      <div className="space-y-2">
        {visibleTasks.map((task) => (
          <TaskListItem key={task.id} task={task} />
        ))}
      </div>
      <div style={{ height: bottomSpacer }} />
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useTasks();
  const [sortBy, setSortBy] = useState<"deadline" | "created">("deadline");
  const [keyword, setKeyword] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [taskView, setTaskView] = useState<TaskViewMode>(() => {
    if (typeof window === "undefined") {
      return "card";
    }
    return window.localStorage.getItem(TASK_VIEW_STORAGE_KEY) === "list"
      ? "list"
      : "card";
  });

  function updateTaskView(mode: TaskViewMode) {
    setTaskView(mode);
    window.localStorage.setItem(TASK_VIEW_STORAGE_KEY, mode);
  }

  const all = data?.tasks ?? [];

  const { activeTasks, completedTasks, stats } = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const matches = (task: TaskWithSteps) =>
      query === "" ||
      [task.title, task.merchantName, task.productName].some((field) =>
        field?.toLowerCase().includes(query),
      );

    const active = all
      .filter((task) => task.status === "active" && matches(task))
      .sort((a, b) => {
        if (sortBy === "deadline") {
          const da = a.deadline ?? "9999-99-99";
          const db = b.deadline ?? "9999-99-99";
          return da.localeCompare(db);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });

    const completed = all.filter(
      (task) => task.status === "completed" && matches(task),
    );

    let pendingAmount = 0;
    for (const task of all) {
      if (
        task.status === "active" &&
        task.steps.some((s) => s.type === "cashback" && s.status === "pending")
      ) {
        pendingAmount += task.cashbackAmount ?? 0;
      }
    }

    return {
      activeTasks: active,
      completedTasks: completed,
      stats: {
        activeCount: all.filter((t) => t.status === "active").length,
        completedCount: all.filter((t) => t.status === "completed").length,
        pendingAmount,
      },
    };
  }, [all, keyword, sortBy]);

  return (
    <div className="px-4 pt-4 pb-32">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-xl font-extrabold text-primary">
          Pet Task AI
          <PawPrint className="text-fab" size={18} />
        </h1>
        <div className="flex items-center gap-1.5">
          <button
            className="flex size-9 items-center justify-center rounded-full bg-card text-muted-foreground shadow-xs"
            type="button"
            onClick={() => navigate("/tasks/new")}
          >
            <Plus size={18} />
          </button>
          <button
            className="flex size-9 items-center justify-center rounded-full bg-card text-muted-foreground shadow-xs"
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search size={17} />
          </button>
          <button
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/25 active:scale-95"
            type="button"
            onClick={() => navigate("/ai-create")}
          >
            <Sparkles size={15} />
            AI 创建
          </button>
        </div>
      </header>

      {searchOpen ? (
        <label className="mt-3 flex items-center gap-2 rounded-2xl bg-card px-3 py-2.5 text-sm shadow-xs">
          <Search
            className="text-muted-foreground"
            size={16}
            strokeWidth={1.8}
          />
          <input
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="搜索商家、商品或任务标题"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
      ) : null}

      <section className="relative mt-4 overflow-hidden rounded-3xl bg-card/70 px-4 py-3 shadow-xs">
        <div className="relative z-10 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold leading-tight">
              {greeting()}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">
              今天还有{" "}
              <span className="text-lg font-extrabold text-fab">
                {stats.activeCount}
              </span>{" "}
              个置换任务
            </p>
          </div>
          <Link
            className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
            to="/settings"
          >
            查看统计
          </Link>
        </div>
        <PawPrint
          className="absolute -right-1 -top-1 rotate-12 text-primary/10"
          size={64}
          strokeWidth={1.5}
        />
      </section>

      <Link
        className="mt-3 flex items-center rounded-2xl bg-card px-3 py-2.5 shadow-xs"
        to="/settings"
      >
        <div className="grid flex-1 grid-cols-3 divide-x divide-border">
          <div className="flex items-center justify-center gap-2 px-1">
            <span className="flex size-8 items-center justify-center rounded-xl bg-success-soft text-success">
              <ClipboardCheck size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">进行中</p>
              <p className="whitespace-nowrap text-sm font-bold">
                {stats.activeCount}
                <em className="ml-0.5 text-[11px] font-normal not-italic text-muted-foreground">
                  个
                </em>
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 px-1">
            <span className="flex size-8 items-center justify-center rounded-xl bg-secondary text-primary">
              <CircleCheck size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">已完成</p>
              <p className="whitespace-nowrap text-sm font-bold">
                {stats.completedCount}
                <em className="ml-0.5 text-[11px] font-normal not-italic text-muted-foreground">
                  个
                </em>
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 px-1">
            <span className="flex size-8 items-center justify-center rounded-xl bg-warning-soft text-warning">
              <CircleDollarSign size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">待返现</p>
              <p className="whitespace-nowrap text-sm font-bold text-warning">
                {formatMoney(stats.pendingAmount)}
              </p>
            </div>
          </div>
        </div>
      </Link>

      <div className="mt-5 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">进行中的任务</h3>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-full bg-card p-1 shadow-xs">
            <button
              aria-label="卡片模式"
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-muted-foreground",
                taskView === "card" && "bg-primary text-primary-foreground",
              )}
              type="button"
              onClick={() => updateTaskView("card")}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              aria-label="列表模式"
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-muted-foreground",
                taskView === "list" && "bg-primary text-primary-foreground",
              )}
              type="button"
              onClick={() => updateTaskView("list")}
            >
              <List size={16} />
            </button>
          </div>
          <button
            className="flex items-center gap-1 rounded-full bg-card px-3 py-2 text-xs text-muted-foreground shadow-xs"
            type="button"
            onClick={() =>
              setSortBy((v) => (v === "deadline" ? "created" : "deadline"))
            }
          >
            {sortBy === "deadline" ? "截止" : "创建"}
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3.5">
        {isLoading && all.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">加载中...</p>
        ) : null}
        {taskView === "list" ? (
          <VirtualTaskList tasks={activeTasks} />
        ) : (
          activeTasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
        {!isLoading && activeTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-card py-12 text-muted-foreground">
            <PawPrint size={32} strokeWidth={1.4} />
            <p className="text-sm">暂无进行中任务</p>
            <button
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              type="button"
              onClick={() => navigate("/ai-create")}
            >
              <Sparkles size={15} />
              粘贴商家规则，AI 创建
            </button>
          </div>
        ) : null}
      </div>

      {completedTasks.length > 0 ? (
        <section className="mt-6">
          <button
            className="flex w-full items-center justify-between text-lg font-bold"
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
          >
            已完成 ({completedTasks.length})
            <ChevronDown
              className={cn(
                "text-muted-foreground transition-transform",
                showCompleted && "rotate-180",
              )}
              size={18}
            />
          </button>
          {showCompleted ? (
            <div className="mt-3 space-y-2">
              {completedTasks.map((task) => (
                <Link
                  className="flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3 opacity-75"
                  key={task.id}
                  to={`/tasks/${task.id}`}
                >
                  <CalendarClock className="shrink-0 text-success" size={17} />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through">
                    {task.title}
                  </span>
                  {task.cashbackAmount != null ? (
                    <span className="shrink-0 text-sm font-semibold text-success">
                      +{formatMoney(task.cashbackAmount)}
                    </span>
                  ) : null}
                  <StatusPill status={task.status} />
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
