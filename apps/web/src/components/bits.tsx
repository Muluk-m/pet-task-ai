import type { OrderChannel, TaskStepType } from "@pet-task-ai/shared";
import { orderChannelNames, orderChannelSchema } from "@pet-task-ai/shared";
import { Check, PawPrint, Star } from "lucide-react";
import { Fragment } from "react";
import { siTaobao, siTiktok, siXiaohongshu } from "simple-icons";
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
        <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-center text-[10px] text-white">
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

type ChipMeta = {
  label: string;
  iconClass: string;
  iconText?: string;
  /** simple-icons 品牌 logo（有则优先于 iconText 渲染） */
  brand?: { path: string };
  /** 字标类 logo（如小红书）相对基准尺寸的放大比例 */
  scale?: number;
};

/** 平台视觉唯一事实源：品牌色 + logo（京东未被 simple-icons 收录，退回「京」字） */
export const platformVisuals: Record<string, ChipMeta> = {
  xiaohongshu: {
    label: "小红书",
    iconClass: "bg-[#ff2442] text-white",
    brand: siXiaohongshu,
    scale: 1.5,
  },
  douyin: {
    label: "抖音",
    iconClass: "bg-[#1b1b1b] text-white",
    brand: siTiktok,
  },
  taobao: {
    label: "淘宝",
    iconClass: "bg-[#e94f20] text-white",
    brand: siTaobao,
  },
  jd: {
    label: "京东",
    iconClass: "bg-[#e1251b] text-white",
    iconText: "京",
  },
  pdd: {
    label: "拼多多",
    iconClass: "bg-[#e02e24] text-white",
    iconText: "拼",
  },
};

export const stepChipMeta: Record<TaskStepType, ChipMeta> = {
  delivery: {
    label: "到货",
    iconClass: "bg-secondary text-primary",
    iconText: "货",
  },
  xiaohongshu_note: platformVisuals.xiaohongshu,
  douyin_post: platformVisuals.douyin,
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

/** 首页任务卡上的步骤链条：只展示本任务激活的内容步骤 */
const railOrder: TaskStepType[] = [
  "xiaohongshu_note",
  "douyin_post",
  "ecommerce_review",
  "cashback",
];

export function stepChipDisplay(
  step: Pick<TaskStep, "type" | "platform">,
): ChipMeta {
  if (step.type === "ecommerce_review" && step.platform) {
    const chip = platformVisuals[step.platform];
    if (chip) {
      return chip;
    }
  }
  return stepChipMeta[step.type];
}

export function BrandIcon({
  brand,
  size = 17,
}: {
  brand: { path: string };
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      fill="currentColor"
      height={size}
      role="presentation"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={brand.path} />
    </svg>
  );
}

/** 下单渠道选择：带品牌小方标的 pill 单选组 */
export function ChannelPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (channel: OrderChannel) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {orderChannelSchema.options.map((channel) => (
        <button
          className={cn(
            "flex items-center rounded-full border",
            compact ? "gap-1 px-3 py-1 text-xs" : "gap-1.5 px-3 py-1.5 text-sm",
            value === channel
              ? "border-primary bg-secondary font-medium text-primary"
              : "border-border text-muted-foreground",
          )}
          key={channel}
          type="button"
          onClick={() => onChange(channel)}
        >
          <PlatformBadge platform={channel} size={compact ? 14 : 16} />
          {orderChannelNames[channel]}
        </button>
      ))}
    </div>
  );
}

/** 平台图标内容（无底色容器）：给自带圆形容器的场景用，按 scale 统一放大字标 */
export function PlatformChipIcon({
  platform,
  baseSize = 15,
}: {
  platform: string;
  baseSize?: number;
}) {
  const meta = platformVisuals[platform];
  if (!meta) {
    return null;
  }
  return meta.brand ? (
    <BrandIcon
      brand={meta.brand}
      size={Math.round(baseSize * (meta.scale ?? 1))}
    />
  ) : (
    <>{meta.iconText}</>
  );
}

/** 平台小方标：真实品牌 logo（京东无收录用「京」字） */
export function PlatformBadge({
  platform,
  size = 18,
}: {
  platform: string;
  size?: number;
}) {
  const meta = platformVisuals[platform];
  if (!meta) {
    return null;
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded",
        meta.iconClass,
      )}
      style={{ width: size, height: size }}
    >
      {meta.brand ? (
        <BrandIcon
          brand={meta.brand}
          size={Math.round(size * 0.62 * (meta.scale ?? 1))}
        />
      ) : (
        <span className="font-bold" style={{ fontSize: size * 0.5 }}>
          {meta.iconText}
        </span>
      )}
    </span>
  );
}

export function StepRail({ steps }: { steps: TaskStep[] }) {
  const railSteps = steps
    .filter((step) => step.type !== "delivery")
    .sort(
      (a, b) =>
        railOrder.indexOf(a.type) - railOrder.indexOf(b.type) || a.id - b.id,
    );

  return (
    <div className="flex items-start">
      {railSteps.map((step, index) => {
        const meta = stepChipDisplay(step);
        const done = step.status === "completed";

        return (
          <Fragment key={step.id}>
            {index > 0 ? (
              <span className="mt-4.5 w-3 shrink-0 border-t border-dashed border-border" />
            ) : null}
            <span className="flex w-12 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-xs font-semibold ring-2",
                  done
                    ? "bg-success text-white ring-success/25"
                    : cn(meta.iconClass, "ring-border"),
                )}
              >
                {done ? (
                  <Check size={16} strokeWidth={3} />
                ) : meta.brand ? (
                  <BrandIcon
                    brand={meta.brand}
                    size={Math.round(17 * (meta.scale ?? 1))}
                  />
                ) : meta.iconText ? (
                  meta.iconText
                ) : (
                  <Star size={14} fill="currentColor" strokeWidth={0} />
                )}
              </span>
              <span
                className={cn(
                  "text-[11px]",
                  done ? "text-success" : "text-muted-foreground",
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
