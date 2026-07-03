import type { TaskStepType } from "@pet-task-ai/shared";
import {
  Archive,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Copy,
  Lightbulb,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Store,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  useAddStep,
  useArchiveTask,
  useCompleteStep,
  useDeleteStep,
  useTask,
  useUndoStep,
} from "../api/client";
import type { TaskStep } from "../api/types";
import {
  PlaceholderImage,
  StatusPill,
  deadlineBadgeText,
  stepChipMeta,
} from "../components/bits";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { deadlineInfo, formatDateTime, formatMoney } from "../lib/format";
import { cn } from "../lib/utils";

const stepTitles: Record<TaskStepType, string> = {
  delivery: "下单到货",
  xiaohongshu_note: "发布小红书",
  douyin_post: "发布抖音",
  ecommerce_review: "提交好评",
  cashback: "确认返现",
};

const stepSubtitles: Record<TaskStepType, string> = {
  delivery: "确认商品已送达",
  xiaohongshu_note: "发布产品使用体验笔记",
  douyin_post: "发布产品使用体验视频",
  ecommerce_review: "在电商平台提交商品好评",
  cashback: "确认已收到返现",
};

const linkStepTypes = new Set<TaskStepType>([
  "xiaohongshu_note",
  "douyin_post",
]);

const ecomPlatformNames: Record<string, string> = {
  taobao: "淘宝",
  jd: "京东",
};

function stepDisplayTitle(step: TaskStep): string {
  if (step.type === "ecommerce_review" && step.platform) {
    const name = ecomPlatformNames[step.platform];
    return name ? `提交${name}好评` : stepTitles[step.type];
  }
  return stepTitles[step.type];
}

function stepDisplaySubtitle(step: TaskStep): string {
  if (step.type === "ecommerce_review" && step.platform) {
    const name = ecomPlatformNames[step.platform];
    if (name) {
      return `在${name}提交商品好评`;
    }
  }
  return stepSubtitles[step.type];
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function remainingLabel(deadline: string | null): string {
  if (!deadline) {
    return "未设截止";
  }
  const { daysLeft } = deadlineInfo(deadline);
  if (daysLeft < 0) {
    return `已逾期 ${-daysLeft} 天`;
  }
  if (daysLeft === 0) {
    return "今天截止";
  }
  return `剩余 ${daysLeft} 天`;
}

export function TaskDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const taskId = Number(params.taskId);
  const { data, isLoading } = useTask(Number.isInteger(taskId) ? taskId : null);

  const completeStep = useCompleteStep(taskId);
  const undoStep = useUndoStep(taskId);
  const deleteStep = useDeleteStep(taskId);
  const addStep = useAddStep(taskId);
  const archiveTask = useArchiveTask();

  const draftsKey = `pt-drafts-${taskId}`;
  const [drafts, setDrafts] = useState<Record<number, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(draftsKey) ?? "{}");
    } catch {
      return {};
    }
  });
  const [ruleExpanded, setRuleExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addingStep, setAddingStep] = useState(false);

  const task = data?.task;
  const steps = useMemo(
    () => (task ? [...task.steps].sort((a, b) => a.id - b.id) : []),
    [task],
  );

  const firstPendingId = steps.find((s) => s.status === "pending")?.id ?? null;

  // 默认展开第一个待完成步骤
  useEffect(() => {
    if (expandedId === null && firstPendingId !== null) {
      setExpandedId(firstPendingId);
    }
  }, [expandedId, firstPendingId]);

  if (isLoading && !task) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-6">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-start gap-3 px-4 pt-6">
        <p className="text-sm text-muted-foreground">任务不存在</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          返回首页
        </Button>
      </div>
    );
  }

  const expandedStep = steps.find((s) => s.id === expandedId) ?? null;

  const setDraft = (stepId: number, value: string) =>
    setDrafts((prev) => ({ ...prev, [stepId]: value }));

  function saveDrafts() {
    localStorage.setItem(draftsKey, JSON.stringify(drafts));
    toast("草稿已保存");
  }

  async function completeCurrentStep() {
    if (!expandedStep || expandedStep.status !== "pending") {
      toast("请先选择一个待完成的步骤", "error");
      return;
    }

    const draft = (drafts[expandedStep.id] ?? "").trim();

    if (linkStepTypes.has(expandedStep.type)) {
      if (!isValidUrl(draft)) {
        toast(`请填写合法的${stepTitles[expandedStep.type]}链接`, "error");
        return;
      }
      await completeStep.mutateAsync({
        stepId: expandedStep.id,
        resultUrl: draft,
      });
    } else if (expandedStep.type === "ecommerce_review") {
      await completeStep.mutateAsync(
        draft === ""
          ? { stepId: expandedStep.id }
          : isValidUrl(draft)
            ? { stepId: expandedStep.id, resultUrl: draft }
            : { stepId: expandedStep.id, resultText: draft },
      );
    } else {
      await completeStep.mutateAsync({ stepId: expandedStep.id });
    }

    toast(`「${stepDisplayTitle(expandedStep)}」已完成`);
    setExpandedId(null);
  }

  async function handleArchive() {
    setMenuOpen(false);
    if (!task) {
      return;
    }
    if (window.confirm("归档后任务将从列表中移除，确定归档？")) {
      await archiveTask.mutateAsync(task.id);
      toast("任务已归档");
      navigate("/");
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    toast("已复制");
  }

  const existingTypes = new Set(steps.map((s) => s.type));
  const addableTypes = (Object.keys(stepTitles) as TaskStepType[]).filter(
    (type) => !existingTypes.has(type),
  );

  return (
    <div className="mx-auto max-w-[560px] px-4 pt-2 pb-36">
      <header className="relative flex items-center justify-between py-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5.5" />
        </Button>
        <h1 className="text-lg font-semibold">任务详情</h1>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal className="size-5" />
        </Button>
        {menuOpen ? (
          <div className="absolute right-0 top-12 z-20 w-36 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-4 py-3 text-sm active:bg-muted"
              type="button"
              onClick={() => navigate(`/tasks/${task.id}/edit`)}
            >
              <Pencil size={15} />
              编辑任务
            </button>
            <button
              className="flex w-full items-center gap-2 border-t border-border/60 px-4 py-3 text-sm active:bg-muted"
              type="button"
              onClick={handleArchive}
            >
              <Archive size={15} />
              归档任务
            </button>
          </div>
        ) : null}
      </header>

      <section className="rounded-3xl bg-card p-4 shadow-xs">
        <div className="flex gap-3.5">
          <PlaceholderImage
            badge={deadlineBadgeText(task.deadline)}
            size="lg"
            src={task.coverImageUrl}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <StatusPill status={task.status} />
            <h2
              className={cn(
                "text-xl font-bold leading-snug",
                task.status === "completed" &&
                  "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </h2>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Store size={14} strokeWidth={1.8} />
              {task.merchantName ?? "未填写商家"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-accent px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            返现{" "}
            <strong className="text-2xl font-extrabold text-fab">
              {task.cashbackAmount != null
                ? formatMoney(task.cashbackAmount)
                : "—"}
            </strong>
          </span>
          <span className="flex items-center gap-1 text-sm font-medium text-warning">
            <Clock size={14} />
            {remainingLabel(task.deadline)}
          </span>
        </div>
      </section>

      <button
        className="mt-3 flex w-full items-start gap-3 rounded-3xl bg-secondary/70 p-4 text-left"
        type="button"
        onClick={() => setRuleExpanded((v) => !v)}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
          <BookOpenText size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">商家规则</span>
          <span
            className={cn(
              "mt-0.5 block whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground",
              !ruleExpanded &&
                "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
            )}
          >
            {task.ruleText ?? "未填写商家规则，可在编辑任务里补充"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-2 shrink-0 text-muted-foreground transition-transform",
            ruleExpanded && "rotate-180",
          )}
          size={16}
        />
      </button>

      <section className="mt-4">
        {steps.map((step, index) => {
          const done = step.status === "completed";
          const isCurrent = step.id === firstPendingId;
          const expanded = step.id === expandedId;

          return (
            <div className="flex gap-3" key={step.id}>
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-8.5 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    done
                      ? "bg-primary text-white"
                      : isCurrent
                        ? "bg-fab text-white"
                        : "border-2 border-border bg-card text-muted-foreground",
                  )}
                >
                  {done ? <Check size={16} strokeWidth={3} /> : index + 1}
                </span>
                {index < steps.length - 1 ? (
                  <span className="w-0.5 flex-1 bg-border" />
                ) : null}
              </div>

              <div
                className={cn(
                  "mb-3 min-w-0 flex-1 rounded-2xl border p-4",
                  expanded && !done && isCurrent
                    ? "border-fab/25 bg-[#fdf1ec]"
                    : done
                      ? "border-success/15 bg-success-soft/35"
                      : "border-border/60 bg-card",
                )}
              >
                <button
                  className="flex w-full items-center justify-between gap-2 text-left"
                  type="button"
                  onClick={() => setExpandedId(expanded ? -1 : step.id)}
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold">
                      {stepDisplayTitle(step)}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {done && step.completedAt
                        ? `已完成 · ${formatDateTime(step.completedAt)}`
                        : stepDisplaySubtitle(step)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-lg px-2 py-0.5 text-xs font-medium",
                        done
                          ? "bg-success-soft text-success"
                          : "bg-warning-soft text-warning",
                      )}
                    >
                      {done ? "已完成" : "待完成"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground transition-transform",
                        expanded && "rotate-180",
                      )}
                      size={15}
                    />
                  </span>
                </button>

                {expanded ? (
                  <div className="mt-3 space-y-2.5">
                    {step.requirement ? (
                      <p className="rounded-xl bg-card/80 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        要求：{step.requirement}
                      </p>
                    ) : null}

                    {done ? (
                      <>
                        {step.resultUrl || step.resultText ? (
                          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {step.resultUrl ?? step.resultText}
                            </span>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              onClick={() =>
                                copyText(
                                  step.resultUrl ?? step.resultText ?? "",
                                )
                              }
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          </div>
                        ) : null}
                        <button
                          className="flex items-center gap-1 text-xs text-primary"
                          type="button"
                          onClick={async () => {
                            await undoStep.mutateAsync(step.id);
                            toast("已撤销完成");
                            setExpandedId(step.id);
                          }}
                        >
                          <RotateCcw size={12} />
                          撤销完成
                        </button>
                      </>
                    ) : (
                      <>
                        {linkStepTypes.has(step.type) ? (
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium">
                              {step.type === "xiaohongshu_note"
                                ? "小红书笔记链接"
                                : "抖音帖子链接"}
                            </p>
                            <Input
                              className="bg-card"
                              placeholder="填写笔记链接 https://..."
                              value={drafts[step.id] ?? ""}
                              onChange={(event) =>
                                setDraft(step.id, event.target.value)
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              请确保内容为公开可见，且包含产品真实体验
                            </p>
                          </div>
                        ) : step.type === "ecommerce_review" ? (
                          <div className="space-y-1.5">
                            <Textarea
                              className="bg-card"
                              placeholder="粘贴好评内容或评价链接（可选）"
                              rows={3}
                              value={drafts[step.id] ?? ""}
                              onChange={(event) =>
                                setDraft(step.id, event.target.value)
                              }
                            />
                            <button
                              className="flex items-center gap-1 text-xs text-primary"
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/generate?taskId=${task.id}&platform=${
                                    step.platform === "taobao" ||
                                    step.platform === "jd"
                                      ? step.platform
                                      : "generic"
                                  }`,
                                )
                              }
                            >
                              <Wand2 size={12} />
                              没想好写什么？去生成好评
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {step.type === "delivery"
                              ? "商品到货后，点击下方「完成此步骤」"
                              : "返现到账后，点击下方「完成此步骤」"}
                          </p>
                        )}
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                          type="button"
                          onClick={async () => {
                            if (window.confirm("删除该步骤？")) {
                              try {
                                await deleteStep.mutateAsync(step.id);
                                toast("步骤已删除");
                              } catch (error) {
                                toast(
                                  error instanceof Error
                                    ? error.message
                                    : "删除失败",
                                  "error",
                                );
                              }
                            }
                          }}
                        >
                          <Trash2 size={12} />
                          删除此步骤
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {addableTypes.length > 0 && task.status !== "archived" ? (
          <div className="pl-11">
            {addingStep ? (
              <div className="flex flex-wrap items-center gap-2">
                {addableTypes.flatMap((type) =>
                  type === "ecommerce_review"
                    ? (["taobao", "jd", "other"] as const).map((platform) => (
                        <Button
                          key={`${type}-${platform}`}
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await addStep.mutateAsync({ type, platform });
                            setAddingStep(false);
                            toast("步骤已添加");
                          }}
                        >
                          {platform === "other"
                            ? "好评"
                            : `${ecomPlatformNames[platform]}好评`}
                        </Button>
                      ))
                    : [
                        <Button
                          key={type}
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await addStep.mutateAsync({ type });
                            setAddingStep(false);
                            toast("步骤已添加");
                          }}
                        >
                          {stepChipMeta[type].label}
                        </Button>,
                      ],
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingStep(false)}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                className="w-full border-dashed"
                variant="outline"
                onClick={() => setAddingStep(true)}
              >
                <Plus />
                添加步骤
              </Button>
            )}
          </div>
        ) : null}
      </section>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lightbulb className="text-warning" size={13} />
        完成所有步骤并确认返现后，任务将自动归档至「已完成」
      </p>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[560px] gap-3 p-4 pb-safe">
          <Button
            className="h-11 flex-1 rounded-2xl"
            variant="outline"
            onClick={saveDrafts}
          >
            <Save />
            保存草稿
          </Button>
          <button
            className="flex h-11 flex-[1.6] items-center justify-center gap-1.5 rounded-2xl bg-fab text-base font-semibold text-white shadow-sm shadow-fab/30 active:scale-[0.99] disabled:opacity-50"
            disabled={
              completeStep.isPending ||
              !expandedStep ||
              expandedStep.status !== "pending"
            }
            type="button"
            onClick={completeCurrentStep}
          >
            {completeStep.isPending ? "提交中..." : "完成此步骤"}
          </button>
        </div>
      </footer>
    </div>
  );
}
