import type { TaskStepType } from "@pet-task-ai/shared";
import { Check, PawPrint, Star } from "lucide-react";
import { Fragment } from "react";
import type { TaskStatus, TaskStep, TaskWithSteps } from "../api/types";
import { deadlineInfo } from "../lib/format";
import { cn } from "../lib/utils";

export function PlaceholderImage({
  size = "md",
  className,
  badge,
  src,
}: {
  size?: "md" | "lg";
  className?: string;
  badge?: string | null;
  src?: string | null;
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-primary/45",
        size === "lg" ? "size-26" : "size-22",
        className,
      )}
    >
      {src ? (
        <img
          alt=""
          className="size-full object-cover"
          loading="lazy"
          src={src}
        />
      ) : (
        <PawPrint size={size === "lg" ? 36 : 30} strokeWidth={1.5} />
      )}
      {badge ? (
        <span className="absolute bottom-0 left-0 rounded-tr-xl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

const statusMeta: Record<TaskStatus, { label: string; className: string }> = {
  active: { label: "进行中", className: "bg-warning-soft text-warning" },
  completed: { label: "已完成", className: "bg-success-soft text-success" },
  archived: { label: "已归档", className: "bg-muted text-muted-foreground" },
};

export function StatusPill({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function CashbackBadge({ required }: { required: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        required
          ? "bg-destructive/10 text-destructive"
          : "bg-success-soft text-success",
      )}
    >
      {required ? "需返现" : "无需返现"}
    </span>
  );
}

export const stepChipMeta: Record<
  TaskStepType,
  { label: string; iconClass: string; iconText?: string }
> = {
  delivery: {
    label: "到货",
    iconClass: "bg-secondary text-primary",
    iconText: "货",
  },
  xiaohongshu_note: {
    label: "小红书",
    iconClass: "bg-[#e0342c] text-white",
    iconText: "红",
  },
  douyin_post: {
    label: "抖音",
    iconClass: "bg-[#1b1b1b] text-white",
    iconText: "抖",
  },
  ecommerce_review: {
    label: "好评",
    iconClass: "bg-warning-soft text-warning",
  },
  cashback: {
    label: "返现",
    iconClass: "bg-warning-soft text-warning",
    iconText: "¥",
  },
};

/** 首页任务卡上的步骤链条：固定展示四种内容步骤，缺失的置灰 */
const railTypes: TaskStepType[] = [
  "xiaohongshu_note",
  "douyin_post",
  "ecommerce_review",
  "cashback",
];

export function StepRail({ steps }: { steps: TaskStep[] }) {
  const byType = new Map(steps.map((step) => [step.type, step]));

  return (
    <div className="flex items-start">
      {railTypes.map((type, index) => {
        const meta = stepChipMeta[type];
        const step = byType.get(type);
        const state = !step
          ? "absent"
          : step.status === "completed"
            ? "done"
            : "pending";

        return (
          <Fragment key={type}>
            {index > 0 ? (
              <span className="mt-4.5 w-3 shrink-0 border-t border-dashed border-border" />
            ) : null}
            <span
              className={cn(
                "flex w-12 flex-col items-center gap-1",
                state === "absent" && "opacity-35 grayscale",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-xs font-semibold ring-2",
                  state === "done"
                    ? "bg-success text-white ring-success/25"
                    : cn(meta.iconClass, "ring-border"),
                )}
              >
                {state === "done" ? (
                  <Check size={16} strokeWidth={3} />
                ) : type === "ecommerce_review" ? (
                  <Star size={14} fill="currentColor" strokeWidth={0} />
                ) : (
                  meta.iconText
                )}
              </span>
              <span
                className={cn(
                  "text-[11px]",
                  state === "done" ? "text-success" : "text-muted-foreground",
                )}
              >
                {meta.label}
              </span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

export function taskProgress(task: TaskWithSteps): {
  done: number;
  total: number;
  percent: number;
} {
  const total = task.steps.length;
  const done = task.steps.filter((s) => s.status === "completed").length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function deadlineBadgeText(deadline: string | null): string | null {
  if (!deadline) {
    return null;
  }
  const { daysLeft } = deadlineInfo(deadline);
  if (daysLeft < 0) {
    return "已逾期";
  }
  if (daysLeft === 0) {
    return "今天截止";
  }
  if (daysLeft === 1) {
    return "明天截止";
  }
  return `${daysLeft}天后截止`;
}
