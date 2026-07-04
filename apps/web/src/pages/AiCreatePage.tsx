import type { AiTaskExtraction } from "@pet-task-ai/shared";
import {
  BadgeCheck,
  Calendar,
  ChevronLeft,
  CircleCheck,
  CircleDollarSign,
  FileText,
  ImagePlus,
  Pencil,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useCreateTask, useExtractTask } from "../api/client";
import { AiWorking } from "../components/ai-working";
import {
  ChannelPicker,
  PlatformChipIcon,
  platformVisuals,
} from "../components/bits";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { fileToCompressedDataUrl } from "../lib/image";
import { cn } from "../lib/utils";

function parseOneDecimalAmount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d)?$/.test(trimmed)) {
    return undefined;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : undefined;
}

function FieldRow({
  icon,
  iconClass,
  label,
  children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="w-16 shrink-0 text-sm font-medium">{label}</span>
      <div className="relative min-w-0 flex-1">
        {children}
        <Pencil
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          size={13}
        />
      </div>
    </div>
  );
}

function StepToggleRow({
  icon,
  iconClass,
  label,
  requirement,
  checked,
  onCheckedChange,
  onRequirementChange,
  placeholder,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  requirement: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  onRequirementChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
            iconClass,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{label}</p>
          {checked ? (
            <input
              className="mt-0.5 w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60"
              placeholder={placeholder}
              value={requirement}
              onChange={(event) => onRequirementChange(event.target.value)}
            />
          ) : null}
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

const MAX_IMAGES = 3;

export function AiCreatePage() {
  const navigate = useNavigate();
  const extractTask = useExtractTask();
  const createTask = useCreateTask();

  const [ruleText, setRuleText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [draft, setDraft] = useState<AiTaskExtraction | null>(null);

  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast(`最多上传 ${MAX_IMAGES} 张截图`, "error");
      return;
    }
    try {
      const compressed = await Promise.all(
        [...files]
          .slice(0, remaining)
          .map((file) => fileToCompressedDataUrl(file)),
      );
      setImages((prev) => [...prev, ...compressed]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "图片处理失败", "error");
    }
  }

  async function runExtraction() {
    if (ruleText.trim().length < 5 && images.length === 0) {
      toast("请粘贴规则文字或上传截图", "error");
      return;
    }
    try {
      const result = await extractTask.mutateAsync({
        ruleText: ruleText.trim() || undefined,
        images: images.length > 0 ? images : undefined,
      });
      setDraft(result.extraction);
      // 用户没手动粘规则时，用 AI 从截图/文字里转录出的规则原文回填，供确认与编辑
      if (!ruleText.trim() && result.extraction.ruleText?.trim()) {
        setRuleText(result.extraction.ruleText.trim());
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 识别失败", "error");
    }
  }

  async function confirmCreate() {
    if (!draft) {
      return;
    }
    if (draft.title.trim() === "") {
      toast("请填写任务标题", "error");
      return;
    }
    try {
      const result = await createTask.mutateAsync({
        ...draft,
        title: draft.title.trim(),
        ruleText: ruleText.trim() || undefined,
      });
      toast("任务已创建");
      navigate(`/tasks/${result.task.id}`, { replace: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : "创建失败", "error");
    }
  }

  const patch = (changes: Partial<AiTaskExtraction>) =>
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev));

  return (
    <div className="mx-auto max-w-[560px] px-4 pt-2 pb-28">
      <header className="flex items-center justify-between py-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5.5" />
        </Button>
        <h1 className="flex items-center gap-1.5 text-lg font-semibold">
          AI 创建任务
          <Sparkles className="text-primary" size={17} />
        </h1>
        <span className="size-8" />
      </header>

      <section className="rounded-3xl bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-xl bg-muted">
              <FileText size={15} />
            </span>
            粘贴商家规则
          </h3>
          <button
            className="text-sm text-muted-foreground underline underline-offset-2"
            type="button"
            onClick={() => {
              setRuleText("");
              setImages([]);
              setDraft(null);
            }}
          >
            清空
          </button>
        </div>
        <Textarea
          className="mt-3 min-h-40 border-0 bg-accent/40 shadow-none"
          maxLength={2000}
          placeholder={
            "粘贴商家发的活动说明，或直接上传聊天截图。例如：\n【置换规则】\n1. 收到商品后 7 天内完成以下内容\n2. 小红书发布图文笔记 1 篇，字数≥50..."
          }
          value={ruleText}
          onChange={(event) => setRuleText(event.target.value)}
        />
        <p className="mt-1.5 text-right text-xs text-muted-foreground">
          {ruleText.length}/2000
        </p>

        <div className="mt-2 flex gap-2">
          {images.map((image, index) => (
            <div
              className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border"
              key={image.slice(-24)}
            >
              <img
                alt={`规则截图 ${index + 1}`}
                className="size-full object-cover"
                src={image}
              />
              <button
                className="absolute right-0.5 top-0.5 flex size-4.5 items-center justify-center rounded-full bg-black/55 text-white"
                type="button"
                onClick={() =>
                  setImages((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES ? (
            <label className="flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-input text-[10px] text-muted-foreground">
              <ImagePlus size={18} />
              传截图
              <input
                accept="image/*"
                className="hidden"
                multiple
                type="file"
                onChange={(event) => {
                  addImages(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
      </section>

      {!draft ? (
        <Button
          className="mt-4 h-12 w-full rounded-2xl text-base"
          disabled={extractTask.isPending}
          onClick={runExtraction}
        >
          <Sparkles />
          {extractTask.isPending ? "AI 识别中..." : "开始识别"}
        </Button>
      ) : null}

      {extractTask.isPending ? <AiWorking label="AI 正在识别商家规则" /> : null}

      {draft ? (
        <>
          <section className="mt-4 rounded-3xl bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="text-primary" size={16} />
                识别结果
              </h3>
              <span className="flex items-center gap-1 text-sm">
                <span className="text-warning">
                  识别可信度{" "}
                  <strong className="text-base font-bold">
                    {Math.round(draft.confidence * 100)}%
                  </strong>
                </span>
                <BadgeCheck className="text-warning" size={17} />
              </span>
            </div>

            {draft.notes.length > 0 ? (
              <ul className="mt-2.5 list-inside list-disc rounded-xl bg-warning-soft/60 px-3 py-2 text-xs leading-relaxed text-warning">
                {draft.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2 divide-y divide-border/50">
              <FieldRow
                icon={<Pencil size={16} />}
                iconClass="bg-secondary text-primary"
                label="标题"
              >
                <Input
                  className="bg-muted/50 pr-9"
                  value={draft.title}
                  onChange={(event) => patch({ title: event.target.value })}
                />
              </FieldRow>
              <FieldRow
                icon={<Store size={16} />}
                iconClass="bg-success-soft text-success"
                label="商家"
              >
                <Input
                  className="bg-muted/50 pr-9"
                  placeholder="未识别到"
                  value={draft.merchantName ?? ""}
                  onChange={(event) =>
                    patch({ merchantName: event.target.value || undefined })
                  }
                />
              </FieldRow>
              <FieldRow
                icon={<ShoppingBag size={16} />}
                iconClass="bg-secondary text-primary"
                label="商品"
              >
                <Input
                  className="bg-muted/50 pr-9"
                  placeholder="未识别到"
                  value={draft.productName ?? ""}
                  onChange={(event) =>
                    patch({ productName: event.target.value || undefined })
                  }
                />
              </FieldRow>
              <FieldRow
                icon={<CircleDollarSign size={16} />}
                iconClass="bg-warning-soft text-warning"
                label="返现金额"
              >
                <Input
                  className="bg-muted/50 pr-9"
                  inputMode="decimal"
                  placeholder="未识别到"
                  value={
                    draft.cashbackAmount != null
                      ? String(draft.cashbackAmount)
                      : ""
                  }
                  onChange={(event) => {
                    patch({
                      cashbackAmount:
                        event.target.value.trim() === ""
                          ? undefined
                          : parseOneDecimalAmount(event.target.value),
                    });
                  }}
                />
              </FieldRow>
              <FieldRow
                icon={<Calendar size={16} />}
                iconClass="bg-secondary text-primary"
                label="截止时间"
              >
                <Input
                  className="bg-muted/50 pr-9"
                  type="date"
                  value={draft.deadline ?? ""}
                  onChange={(event) =>
                    patch({ deadline: event.target.value || undefined })
                  }
                />
              </FieldRow>
            </div>

            <p className="my-2 flex items-center gap-2 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
              以下任务步骤将自动创建
            </p>

            <StepToggleRow
              checked={draft.requiresXiaohongshu}
              icon={<PlatformChipIcon platform="xiaohongshu" />}
              iconClass={platformVisuals.xiaohongshu.iconClass}
              label="需小红书"
              placeholder="补充要求（字数、图数、话题等）"
              requirement={draft.xiaohongshuRequirement ?? ""}
              onCheckedChange={(value) => patch({ requiresXiaohongshu: value })}
              onRequirementChange={(value) =>
                patch({ xiaohongshuRequirement: value || undefined })
              }
            />
            <StepToggleRow
              checked={draft.requiresDouyin}
              icon={<PlatformChipIcon platform="douyin" />}
              iconClass={platformVisuals.douyin.iconClass}
              label="需抖音"
              placeholder="补充要求（时长、话题等）"
              requirement={draft.douyinRequirement ?? ""}
              onCheckedChange={(value) => patch({ requiresDouyin: value })}
              onRequirementChange={(value) =>
                patch({ douyinRequirement: value || undefined })
              }
            />
            <StepToggleRow
              checked={draft.requiresReview}
              icon={<Star size={15} fill="currentColor" strokeWidth={0} />}
              iconClass="bg-warning-soft text-warning"
              label="需好评"
              placeholder="补充要求（星级、字数、附图等）"
              requirement={draft.reviewRequirement ?? ""}
              onCheckedChange={(value) => patch({ requiresReview: value })}
              onRequirementChange={(value) =>
                patch({ reviewRequirement: value || undefined })
              }
            />
            {draft.requiresReview ? (
              <div className="border-b border-border/60 py-2.5 pl-12">
                <ChannelPicker
                  compact
                  value={draft.orderChannel ?? "other"}
                  onChange={(channel) => patch({ orderChannel: channel })}
                />
              </div>
            ) : null}
            <StepToggleRow
              checked={draft.requiresCashback}
              icon="¥"
              iconClass="bg-success-soft text-success"
              label="需返现"
              placeholder="完成后联系客服，核实通过返现"
              requirement=""
              onCheckedChange={(value) => patch({ requiresCashback: value })}
              onRequirementChange={() => {}}
            />
          </section>

          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
            <TriangleAlert className="shrink-0" size={16} />
            请确认信息后再创建
          </div>

          <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
            <div className="mx-auto flex max-w-[560px] gap-3 p-4 pb-safe">
              <Button
                className="h-11 flex-1 rounded-2xl"
                disabled={extractTask.isPending}
                variant="outline"
                onClick={runExtraction}
              >
                <RefreshCw />
                {extractTask.isPending ? "识别中..." : "重新识别"}
              </Button>
              <Button
                className="h-11 flex-[1.4] rounded-2xl text-base"
                disabled={createTask.isPending}
                onClick={confirmCreate}
              >
                <CircleCheck />
                {createTask.isPending ? "创建中..." : "确认创建任务"}
              </Button>
            </div>
          </footer>
        </>
      ) : null}
    </div>
  );
}
