import {
  type ContentGenerationMode,
  type ReviewPlatform,
  type ReviewStyle,
  type XiaohongshuPublishPayload,
  xiaohongshuPublishPayloadSchema,
} from "@pet-task-ai/shared";
import {
  Cat,
  Check,
  ChevronRight,
  Clock,
  Copy,
  FolderDown,
  Heart,
  ImageUp,
  Leaf,
  List,
  Plus,
  Quote,
  RefreshCw,
  Send,
  Sparkles,
  Store,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  useGenerateReview,
  useGenerations,
  useMaterials,
  useTasks,
  useUploadMaterial,
} from "../api/client";
import type { Material, TaskWithSteps } from "../api/types";
import { AiWorking } from "../components/ai-working";
import {
  PlaceholderImage,
  PlatformBadge,
  stepChipMeta,
} from "../components/bits";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { Slider } from "../components/ui/slider";
import { Textarea } from "../components/ui/textarea";
import { formatDateTime, formatMoney } from "../lib/format";
import { compressImageFile, thumbnailUrl } from "../lib/image";
import { cn } from "../lib/utils";
import { openXiaohongshuPublish } from "../lib/xiaohongshu";

const platformOptions: Array<{
  value: ReviewPlatform;
  label: string;
  icon?: React.ReactNode;
}> = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "douyin", label: "抖音" },
  { value: "generic", label: "好评", icon: <ThumbsUp size={14} /> },
];

const platformValues = new Set<string>(
  platformOptions.map((option) => option.value),
);

const styleOptions: Array<{
  value: ReviewStyle;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "real_daily", label: "真实日常", icon: <Heart size={14} /> },
  { value: "cute_tone", label: "可爱口吻", icon: <Cat size={14} /> },
  { value: "seeding", label: "种草", icon: <Leaf size={14} /> },
  { value: "short_praise", label: "简短", icon: <List size={14} /> },
];

const materialTypeLabels: Record<Material["type"], string> = {
  copywriting: "文案",
  pet_image: "宠物图",
  merchant_review_image: "评论图",
};

const GENERATE_DRAFT_KEY = "pet-task-generate-draft";
const WORD_COUNT_MIN = 20;
const WORD_COUNT_MAX = 200;
const WORD_COUNT_TICKS = [20, 40, 80, 120, 200];

function wordCountPercent(value: number): number {
  return ((value - WORD_COUNT_MIN) / (WORD_COUNT_MAX - WORD_COUNT_MIN)) * 100;
}

function readGenerateDraft(): {
  content: string | null;
  contentMode: ContentGenerationMode;
} {
  try {
    const raw = sessionStorage.getItem(GENERATE_DRAFT_KEY);
    if (!raw) {
      return { content: null, contentMode: "review_text" };
    }
    const parsed = JSON.parse(raw) as {
      content?: unknown;
      contentMode?: unknown;
    };
    return {
      content: typeof parsed.content === "string" ? parsed.content : null,
      contentMode:
        parsed.contentMode === "xiaohongshu_publish"
          ? parsed.contentMode
          : "review_text",
    };
  } catch {
    return { content: null, contentMode: "review_text" };
  }
}

function parseXiaohongshuPayload(
  content: string,
): XiaohongshuPublishPayload | null {
  try {
    return xiaohongshuPublishPayloadSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

function contentText(content: string, mode: ContentGenerationMode): string {
  if (mode !== "xiaohongshu_publish") {
    return content;
  }
  const payload = parseXiaohongshuPayload(content);
  if (!payload) {
    return content;
  }
  const tags = payload.hashtags.map((tag) => `#${tag}`).join(" ");
  return [payload.title, payload.body, tags].filter(Boolean).join("\n\n");
}

function xiaohongshuBodyText(payload: XiaohongshuPublishPayload): string {
  const tags = payload.hashtags.map((tag) => `#${tag}`).join(" ");
  return [payload.body, tags].filter(Boolean).join("\n\n");
}

function contentSummary(content: string, mode: ContentGenerationMode): string {
  if (mode !== "xiaohongshu_publish") {
    return content;
  }
  const payload = parseXiaohongshuPayload(content);
  return payload ? `${payload.title}\n${payload.body}` : content;
}

function XiaohongshuPayloadView({ content }: { content: string }) {
  const payload = parseXiaohongshuPayload(content);
  if (!payload) {
    return (
      <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-muted/40 p-3.5 text-sm leading-relaxed">
        {content}
      </p>
    );
  }

  async function copyPart(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast(`${label}已复制`);
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-2xl bg-muted/40 p-3.5 text-sm leading-relaxed">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">标题</p>
          <button
            className="inline-flex h-7 items-center gap-1 rounded-full bg-background px-2.5 text-xs font-medium text-cta shadow-xs active:scale-[0.98]"
            type="button"
            onClick={() => void copyPart(payload.title, "标题")}
          >
            <Copy size={13} />
            复制
          </button>
        </div>
        <p className="mt-1 font-semibold">{payload.title}</p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            正文与话题
          </p>
          <button
            className="inline-flex h-7 items-center gap-1 rounded-full bg-background px-2.5 text-xs font-medium text-cta shadow-xs active:scale-[0.98]"
            type="button"
            onClick={() => void copyPart(xiaohongshuBodyText(payload), "正文")}
          >
            <Copy size={13} />
            复制
          </button>
        </div>
        <p className="mt-1 whitespace-pre-wrap">{payload.body}</p>
        {payload.hashtags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {payload.hashtags.map((tag) => (
              <span
                className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success"
                key={tag}
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-bold">
      <span className="h-4 w-1 rounded-full bg-cta" />
      {children}
    </h3>
  );
}

function TaskPickerSheet({
  tasks,
  onPick,
  onClose,
}: {
  tasks: TaskWithSteps[];
  onPick: (task: TaskWithSteps) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>选择任务</SheetTitle>
        </SheetHeader>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto px-4 pb-6">
          {tasks.map((task) => (
            <button
              className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left active:bg-muted"
              key={task.id}
              type="button"
              onClick={() => onPick(task)}
            >
              <PlaceholderImage
                className="size-14 rounded-xl"
                src={task.coverImageUrl}
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[15px]">
                  {task.title}
                </strong>
                <small className="text-muted-foreground">
                  {task.merchantName ?? "未填写商家"}
                </small>
              </span>
              <span className="text-sm font-medium text-success">进行中</span>
            </button>
          ))}
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无进行中任务
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MaterialPickerSheet({
  materials,
  selectedIds,
  onConfirm,
  onClose,
}: {
  materials: Material[];
  selectedIds: number[];
  onConfirm: (ids: number[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set(selectedIds));

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>选择素材</SheetTitle>
        </SheetHeader>
        <div className="max-h-[50dvh] overflow-y-auto px-4">
          <div className="grid grid-cols-3 gap-2">
            {materials.map((material) => {
              const selected = picked.has(material.id);
              return (
                <button
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-2xl border-2 bg-card text-left",
                    selected ? "border-primary" : "border-transparent",
                  )}
                  key={material.id}
                  type="button"
                  onClick={() => togglePick(material.id)}
                >
                  {material.assetUrl ? (
                    <img
                      alt={material.title}
                      className="size-full object-cover"
                      src={thumbnailUrl(material.assetUrl, 240)}
                    />
                  ) : (
                    <span className="block size-full overflow-hidden bg-accent/60 p-2 text-[11px] leading-relaxed">
                      {material.content}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1.5 py-0.5 text-[10px] text-white">
                    {materialTypeLabels[material.type]}
                  </span>
                  {selected ? (
                    <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {materials.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              素材库为空，先去上传素材吧
            </p>
          ) : null}
        </div>
        <div className="px-4 pb-6 pt-3">
          <Button
            className="h-11 w-full rounded-2xl"
            onClick={() => onConfirm([...picked])}
          >
            确定（已选 {picked.size} 个）
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function GeneratePage() {
  const initialDraft = useMemo(readGenerateDraft, []);
  const [searchParams] = useSearchParams();
  const { data: tasksData } = useTasks();
  const { data: materialsData } = useMaterials();
  const { data: generationsData } = useGenerations();
  const generateReview = useGenerateReview();
  const uploadMaterial = useUploadMaterial();

  const presetTaskId = Number(searchParams.get("taskId"));
  const [taskId, setTaskId] = useState<number | null>(
    Number.isInteger(presetTaskId) && presetTaskId > 0 ? presetTaskId : null,
  );
  const [materialIds, setMaterialIds] = useState<number[]>([]);
  const presetPlatform = searchParams.get("platform");
  const [platform, setPlatform] = useState<ReviewPlatform>(
    presetPlatform && platformValues.has(presetPlatform as ReviewPlatform)
      ? (presetPlatform as ReviewPlatform)
      : "xiaohongshu",
  );
  const [style, setStyle] = useState<ReviewStyle>("real_daily");
  const [wordCount, setWordCount] = useState(80);
  const [customRequirement, setCustomRequirement] = useState("");
  const [mode, setMode] = useState<ContentGenerationMode>("review_text");
  const [content, setContent] = useState<string | null>(initialDraft.content);
  const [contentMode, setContentMode] = useState<ContentGenerationMode>(
    initialDraft.contentMode,
  );
  const [ruleExpanded, setRuleExpanded] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const allTasks = tasksData?.tasks ?? [];
  const activeTasks = allTasks.filter((task) => task.status === "active");
  const selectedTask = allTasks.find((task) => task.id === taskId) ?? null;

  const allMaterials = materialsData?.materials ?? [];
  const selectedMaterials = useMemo(
    () => allMaterials.filter((material) => materialIds.includes(material.id)),
    [allMaterials, materialIds],
  );

  const generations = generationsData?.generations ?? [];

  useEffect(() => {
    if (!content) {
      sessionStorage.removeItem(GENERATE_DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(
      GENERATE_DRAFT_KEY,
      JSON.stringify({ content, contentMode }),
    );
  }, [content, contentMode]);

  async function runGenerate() {
    try {
      const result = await generateReview.mutateAsync({
        mode,
        taskId: taskId ?? undefined,
        materialIds,
        platform: mode === "xiaohongshu_publish" ? "xiaohongshu" : platform,
        style,
        wordCount,
        customRequirement: customRequirement.trim() || undefined,
      });
      setContent(result.generated.content);
      setContentMode(result.generated.contentMode);
    } catch (error) {
      toast(error instanceof Error ? error.message : "生成失败", "error");
    }
  }

  async function copyContent() {
    if (!content) {
      return;
    }
    await navigator.clipboard.writeText(contentText(content, contentMode));
    toast("文案已复制");
  }

  async function publishToXiaohongshu() {
    if (!content) {
      return;
    }
    await navigator.clipboard.writeText(contentText(content, contentMode));
    toast("内容已复制，请在小红书粘贴发布");
    openXiaohongshuPublish({
      source: {
        type: "personal",
        ids: "",
        extraInfo: {
          source: "pet-task-ai",
          content_mode: contentMode,
        },
      },
    });
  }

  async function saveAsMaterial() {
    if (!content) {
      return;
    }
    const formData = new FormData();
    formData.set("type", "copywriting");
    formData.set("title", `生成内容 ${new Date().toLocaleDateString("zh-CN")}`);
    formData.set("content", contentText(content, contentMode));
    formData.set("tags", "AI生成");
    await uploadMaterial.mutateAsync(formData);
    toast("已保存到素材库");
  }

  async function uploadCustomImage(file: File | null | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件", "error");
      return;
    }

    try {
      const formData = new FormData();
      formData.set("type", "pet_image");
      formData.set(
        "title",
        file.name.replace(/\.[^.]+$/, "") ||
          `自定义图片 ${new Date().toLocaleDateString("zh-CN")}`,
      );
      formData.set("content", "");
      formData.set("tags", "内容生成,自定义上传");
      formData.set("file", await compressImageFile(file));
      const { material } = await uploadMaterial.mutateAsync(formData);
      setMaterialIds((prev) =>
        prev.includes(material.id) ? prev : [...prev, material.id],
      );
      toast("图片已上传并选中");
    } catch (error) {
      toast(error instanceof Error ? error.message : "上传失败", "error");
    } finally {
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  }

  const sliderPercent = wordCountPercent(wordCount);

  return (
    <div className="px-4 pt-4 pb-40">
      <header className="relative flex items-center justify-center py-1">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Sparkles className="text-warning" size={18} />
          内容生成
        </h1>
        <button
          className="absolute right-0 flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-xs"
          type="button"
          onClick={() => setHistoryOpen(true)}
        >
          <Clock size={13} />
          生成记录
        </button>
      </header>

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <SectionTitle>选择任务</SectionTitle>
          <button
            className="flex items-center gap-0.5 text-sm text-muted-foreground"
            type="button"
            onClick={() => setTaskPickerOpen(true)}
          >
            {selectedTask ? "更换任务" : "选择任务"}
            <ChevronRight size={15} />
          </button>
        </div>
        {selectedTask ? (
          <div className="mt-3 flex gap-3">
            <PlaceholderImage src={selectedTask.coverImageUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="truncate font-bold">{selectedTask.title}</h4>
                <span className="shrink-0 text-sm font-medium text-success">
                  进行中
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                <Store size={13} strokeWidth={1.8} />
                {selectedTask.merchantName ?? "未填写商家"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selectedTask.steps
                  .filter((step) => step.type !== "delivery")
                  .map((step) => (
                    <span
                      className="rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] text-success"
                      key={step.id}
                    >
                      {stepChipMeta[step.type].label}
                    </span>
                  ))}
              </div>
              {selectedTask.cashbackAmount != null ? (
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  返现金额{" "}
                  <span className="font-bold text-cta">
                    {formatMoney(selectedTask.cashbackAmount)}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            不选任务也可以生成，选择后会带入商品与商家规则
          </p>
        )}
      </section>

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <SectionTitle>选择素材</SectionTitle>
          <Link
            className="flex items-center gap-0.5 text-sm text-muted-foreground"
            to="/materials"
          >
            全部素材
            <ChevronRight size={15} />
          </Link>
        </div>
        <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto">
          {selectedMaterials.map((material) => (
            <div
              className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card"
              key={material.id}
            >
              {material.assetUrl ? (
                <img
                  alt={material.title}
                  className="size-full object-cover"
                  src={material.assetUrl}
                />
              ) : (
                <span className="block size-full overflow-hidden bg-accent/60 p-1.5 text-[10px] leading-snug">
                  {material.content}
                </span>
              )}
              <span
                className={cn(
                  "absolute bottom-0 left-0 rounded-tr-lg px-1.5 py-0.5 text-[10px] text-white",
                  material.type === "pet_image"
                    ? "bg-success"
                    : material.type === "merchant_review_image"
                      ? "bg-fab"
                      : "bg-warning",
                )}
              >
                {materialTypeLabels[material.type]}
              </span>
              <button
                className="absolute right-1 top-1 flex size-4.5 items-center justify-center rounded-full bg-black/55 text-white"
                type="button"
                onClick={() =>
                  setMaterialIds((prev) =>
                    prev.filter((id) => id !== material.id),
                  )
                }
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-input text-xs text-muted-foreground"
            type="button"
            onClick={() => setMaterialPickerOpen(true)}
          >
            <Plus size={20} />
            添加素材
          </button>
          <button
            className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-cta/45 bg-cta/5 text-xs font-medium text-cta disabled:opacity-60"
            disabled={uploadMaterial.isPending}
            type="button"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageUp size={20} />
            {uploadMaterial.isPending ? "上传中" : "上传图片"}
          </button>
          <input
            ref={imageInputRef}
            accept="image/*"
            className="hidden"
            type="file"
            onChange={(event) => {
              void uploadCustomImage(event.target.files?.[0]);
            }}
          />
        </div>
      </section>

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <SectionTitle>生成模式</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className={cn(
              "rounded-2xl border px-3 py-2.5 text-sm",
              mode === "review_text"
                ? "border-cta bg-cta/8 font-semibold text-cta"
                : "border-border text-muted-foreground",
            )}
            type="button"
            onClick={() => setMode("review_text")}
          >
            普通文案
          </button>
          <button
            className={cn(
              "rounded-2xl border px-3 py-2.5 text-sm",
              mode === "xiaohongshu_publish"
                ? "border-cta bg-cta/8 font-semibold text-cta"
                : "border-border text-muted-foreground",
            )}
            type="button"
            onClick={() => {
              setMode("xiaohongshu_publish");
              setPlatform("xiaohongshu");
            }}
          >
            小红书发布
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <SectionTitle>平台与风格</SectionTitle>
          {mode === "xiaohongshu_publish" ? (
            <span className="text-xs text-muted-foreground">
              输出标题 / 正文 / 话题 / 配图建议
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 [&>*:nth-child(4)]:col-span-1">
          {platformOptions.map((option) => (
            <button
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-sm",
                platform === option.value
                  ? "border-cta bg-cta/8 font-semibold text-cta"
                  : "border-border text-muted-foreground",
              )}
              key={option.value}
              type="button"
              onClick={() => setPlatform(option.value)}
            >
              {option.value === "generic" ? (
                option.icon
              ) : (
                <PlatformBadge platform={option.value} />
              )}
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {styleOptions.map((option) => (
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm",
                style === option.value
                  ? "border-cta bg-cta/8 font-medium text-cta"
                  : "border-border text-muted-foreground",
              )}
              key={option.value}
              type="button"
              onClick={() => setStyle(option.value)}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <SectionTitle>自定义要求</SectionTitle>
          <Textarea
            className="mt-3 min-h-24 resize-none rounded-2xl bg-muted/35 text-sm"
            maxLength={1000}
            placeholder="可以直接写你的需求：比如不要写猫、按小红书发帖结构写、突出物流快、适合家清用品、语气更像真实买家..."
            value={customRequirement}
            onChange={(event) => setCustomRequirement(event.target.value)}
          />
          <p className="mt-1.5 text-right text-xs text-muted-foreground">
            {customRequirement.length}/1000
          </p>
        </div>

        <div className="mt-5">
          <SectionTitle>字数</SectionTitle>
          <div className="relative mt-6 px-1">
            <span
              className="absolute -top-5 -translate-x-1/2 rounded-lg bg-cta px-2 py-0.5 text-xs font-semibold text-white"
              style={{ left: `${sliderPercent}%` }}
            >
              {wordCount}字
            </span>
            <Slider
              max={WORD_COUNT_MAX}
              min={WORD_COUNT_MIN}
              step={10}
              value={[wordCount]}
              onValueChange={(values) => setWordCount(values[0])}
            />
            <div className="relative mt-1.5 h-4 text-xs text-muted-foreground">
              {WORD_COUNT_TICKS.map((tick) => (
                <span
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  key={tick}
                  style={{ left: `${wordCountPercent(tick)}%` }}
                >
                  {tick}
                  {tick === WORD_COUNT_MAX ? "字+" : "字"}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {selectedTask?.ruleText ? (
        <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
          <SectionTitle>商家规则提醒</SectionTitle>
          <div className="mt-2.5 rounded-2xl bg-muted/50 p-3">
            <Quote
              className="rotate-180 text-muted-foreground/40"
              size={14}
              fill="currentColor"
              strokeWidth={0}
            />
            <p
              className={cn(
                "mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground",
                !ruleExpanded &&
                  "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]",
              )}
            >
              {selectedTask.ruleText}
            </p>
            <button
              className="mt-1.5 flex items-center text-xs font-medium text-cta"
              type="button"
              onClick={() => setRuleExpanded((v) => !v)}
            >
              {ruleExpanded ? "收起" : "查看完整规则"}
              <ChevronRight size={13} />
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <SectionTitle>生成结果</SectionTitle>
          {content ? (
            <span className="text-xs text-muted-foreground">
              由 AI 生成 · 仅供参考
            </span>
          ) : null}
        </div>
        {content ? (
          <>
            {contentMode === "xiaohongshu_publish" ? (
              <XiaohongshuPayloadView content={content} />
            ) : (
              <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-muted/40 p-3.5 text-sm leading-relaxed">
                {content}
              </p>
            )}
            <div className="mt-2 grid grid-cols-3 divide-x divide-border border-t border-border/60 pt-2 text-center text-sm text-muted-foreground">
              {contentMode === "xiaohongshu_publish" ? null : (
                <button
                  className="flex items-center justify-center gap-1.5 py-1.5"
                  type="button"
                  onClick={copyContent}
                >
                  <Copy size={14} />
                  复制
                </button>
              )}
              {contentMode === "xiaohongshu_publish" ? (
                <button
                  className="flex items-center justify-center gap-1 py-1.5 text-cta"
                  type="button"
                  onClick={publishToXiaohongshu}
                >
                  <Send size={14} />
                  发小红书
                </button>
              ) : null}
              <button
                className="flex items-center justify-center gap-1.5 py-1.5"
                disabled={generateReview.isPending}
                type="button"
                onClick={runGenerate}
              >
                <RefreshCw size={14} />
                {generateReview.isPending ? "生成中" : "重新生成"}
              </button>
              <button
                className="flex items-center justify-center gap-1.5 py-1.5"
                disabled={uploadMaterial.isPending}
                type="button"
                onClick={saveAsMaterial}
              >
                <FolderDown size={14} />
                保存为素材
              </button>
            </div>
          </>
        ) : (
          <Button
            className="mt-3 h-12 w-full rounded-2xl text-base"
            disabled={generateReview.isPending}
            onClick={runGenerate}
          >
            <Sparkles />
            {generateReview.isPending ? "AI 生成中..." : "生成内容"}
          </Button>
        )}
        {generateReview.isPending ? (
          <AiWorking label="AI 正在生成内容" />
        ) : null}
      </section>

      {content ? (
        <footer className="fixed inset-x-0 bottom-[84px] z-30">
          <div className="mx-auto max-w-[560px] px-4">
            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-cta text-base font-semibold text-cta-foreground shadow-lg shadow-cta/30 active:scale-[0.99]"
              type="button"
              onClick={
                contentMode === "xiaohongshu_publish"
                  ? publishToXiaohongshu
                  : copyContent
              }
            >
              {contentMode === "xiaohongshu_publish" ? (
                <Send size={18} />
              ) : (
                <Copy size={18} />
              )}
              {contentMode === "xiaohongshu_publish"
                ? "发到小红书"
                : "复制文案"}
            </button>
          </div>
        </footer>
      ) : null}

      {historyOpen ? (
        <Sheet open onOpenChange={(open) => !open && setHistoryOpen(false)}>
          <SheetContent
            className="mx-auto max-w-[560px] rounded-t-3xl"
            side="bottom"
          >
            <SheetHeader>
              <SheetTitle>生成记录</SheetTitle>
            </SheetHeader>
            <div className="max-h-[60dvh] space-y-2 overflow-y-auto px-4 pb-6">
              {generations.map((item) => (
                <button
                  className="w-full rounded-2xl border border-border/60 bg-card p-3 text-left active:bg-muted"
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setContent(item.content);
                    setContentMode(item.contentMode);
                    setHistoryOpen(false);
                  }}
                >
                  <p className="overflow-hidden text-[13px] leading-relaxed [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {contentSummary(item.content, item.contentMode)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {item.contentMode === "xiaohongshu_publish"
                      ? "小红书发布"
                      : "普通文案"}{" "}
                    ·{" "}
                    {platformOptions.find((p) => p.value === item.platform)
                      ?.label ?? item.platform}{" "}
                    · {formatDateTime(item.createdAt)}
                  </p>
                </button>
              ))}
              {generations.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  还没有生成记录
                </p>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {taskPickerOpen ? (
        <TaskPickerSheet
          tasks={activeTasks}
          onClose={() => setTaskPickerOpen(false)}
          onPick={(task) => {
            setTaskId(task.id);
            setTaskPickerOpen(false);
          }}
        />
      ) : null}

      {materialPickerOpen ? (
        <MaterialPickerSheet
          materials={allMaterials}
          selectedIds={materialIds}
          onClose={() => setMaterialPickerOpen(false)}
          onConfirm={(ids) => {
            setMaterialIds(ids);
            setMaterialPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
