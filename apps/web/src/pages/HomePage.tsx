import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  PawPrint,
  Plus,
  Search,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useCompleteStep, useTasks } from "../api/client";
import type { TaskWithSteps } from "../api/types";
import {
  CashbackBadge,
  PlaceholderImage,
  StatusPill,
  StepRail,
  deadlineBadgeText,
} from "../components/bits";
import { toast } from "../components/toast";
import { formatMoney, parseDbDate } from "../lib/format";
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

function isWaitingCashback(task: TaskWithSteps): boolean {
  const pending = task.steps.filter((s) => s.status === "pending");
  return pending.length > 0 && pending.every((s) => s.type === "cashback");
}

function TaskCard({ task }: { task: TaskWithSteps }) {
  const navigate = useNavigate();
  const completeStep = useCompleteStep(task.id);

  const sortedSteps = [...task.steps].sort((a, b) => a.id - b.id);
  const firstPending = sortedSteps.find((s) => s.status === "pending");
  const waitingCashback = isWaitingCashback(task);
  const hasCashback = task.steps.some((s) => s.type === "cashback");

  async function quickConfirmCashback(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const cashbackStep = task.steps.find(
      (s) => s.type === "cashback" && s.status === "pending",
    );
    if (!cashbackStep) {
      return;
    }
    await completeStep.mutateAsync({ stepId: cashbackStep.id });
    toast("已确认返现，任务完成 🎉");
  }

  return (
    <Link
      className="block rounded-3xl bg-card p-3.5 shadow-xs active:scale-[0.99]"
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
        {task.steps.length === 0 ? (
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            下一步：选择任务步骤
          </span>
        ) : waitingCashback ? (
          <span className="rounded-lg bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
            最后一步：确认返现
          </span>
        ) : firstPending ? (
          <span className="rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            下一步：{nextStepLabels[firstPending.type]}
          </span>
        ) : (
          <span />
        )}
        {waitingCashback ? (
          <button
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground active:scale-95"
            disabled={completeStep.isPending}
            type="button"
            onClick={quickConfirmCashback}
          >
            确认返现
          </button>
        ) : null}
      </div>
    </Link>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useTasks();
  const [sortBy, setSortBy] = useState<"deadline" | "created">("deadline");
  const [keyword, setKeyword] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

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

    const now = new Date();
    let monthAmount = 0;
    let pendingAmount = 0;
    for (const task of all) {
      const amount = task.cashbackAmount ?? 0;
      if (task.status === "completed") {
        if (task.completedAt) {
          const done = parseDbDate(task.completedAt);
          if (
            done.getFullYear() === now.getFullYear() &&
            done.getMonth() === now.getMonth()
          ) {
            monthAmount += amount;
          }
        }
      } else if (
        task.status === "active" &&
        task.steps.some((s) => s.type === "cashback" && s.status === "pending")
      ) {
        pendingAmount += amount;
      }
    }

    return {
      activeTasks: active,
      completedTasks: completed,
      stats: {
        activeCount: all.filter((t) => t.status === "active").length,
        monthAmount,
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

      <section className="relative mt-5 overflow-hidden">
        <h2 className="text-[32px] font-extrabold leading-tight">
          {greeting()}
        </h2>
        <p className="mt-1 text-xl font-semibold">
          今天还有{" "}
          <span className="text-2xl font-extrabold text-fab">
            {stats.activeCount}
          </span>{" "}
          个置换任务
        </p>
        <PawPrint
          className="absolute -right-2 top-0 rotate-12 text-primary/10"
          size={88}
          strokeWidth={1.5}
        />
      </section>

      <Link
        className="mt-5 flex items-center rounded-3xl bg-card p-4 shadow-xs"
        to="/settings"
      >
        <div className="grid flex-1 grid-cols-3 divide-x divide-border">
          <div className="flex flex-col items-center gap-1 px-1">
            <span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success">
              <ClipboardCheck size={17} />
            </span>
            <span className="text-xs text-muted-foreground">进行中</span>
            <span className="whitespace-nowrap text-[17px] font-bold">
              {stats.activeCount}
              <em className="ml-0.5 text-xs font-normal not-italic text-muted-foreground">
                个
              </em>
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 px-1">
            <span className="flex size-9 items-center justify-center rounded-xl bg-warning-soft text-warning">
              <CircleDollarSign size={17} />
            </span>
            <span className="text-xs text-muted-foreground">待返现</span>
            <span className="whitespace-nowrap text-[17px] font-bold text-warning">
              {formatMoney(stats.pendingAmount)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 px-1">
            <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <Wallet size={17} />
            </span>
            <span className="text-xs text-muted-foreground">本月返现</span>
            <span className="whitespace-nowrap text-[17px] font-bold text-primary">
              {formatMoney(stats.monthAmount)}
            </span>
          </div>
        </div>
        <ChevronRight className="shrink-0 text-muted-foreground/50" size={18} />
      </Link>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-lg font-bold">进行中的任务</h3>
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground"
          type="button"
          onClick={() =>
            setSortBy((v) => (v === "deadline" ? "created" : "deadline"))
          }
        >
          {sortBy === "deadline" ? "按截止时间" : "按创建时间"}
          <ChevronDown size={15} />
        </button>
      </div>

      <div className="mt-3 space-y-3.5">
        {isLoading && all.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">加载中...</p>
        ) : null}
        {activeTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
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
