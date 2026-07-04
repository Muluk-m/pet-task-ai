import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  useCancelImageJob,
  useDeleteImageJob,
  useImageJobs,
  useImageQueueConfig,
  useMaterials,
  useRefreshImageJob,
  useSaveGeneratedImage,
  useSubmitImageJob,
} from "../api/client";
import type {
  ImageGenerationJob,
  ImageJobResultImage,
  ImageQueueModel,
  Material,
} from "../api/types";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { Textarea } from "../components/ui/textarea";
import { formatDateTime } from "../lib/format";
import { fileToCompressedDataUrl, thumbnailUrl } from "../lib/image";
import { cn } from "../lib/utils";

const sizeOptions = [
  { value: "1024x1024", label: "方图" },
  { value: "1024x1536", label: "竖图" },
  { value: "1536x1024", label: "横图" },
] as const;

const qualityOptions = [
  { value: "medium", label: "中质量" },
  { value: "high", label: "高质量" },
  { value: "low", label: "低质量" },
  { value: "auto", label: "自动" },
] as const;

type QualityValue = (typeof qualityOptions)[number]["value"];

const statusLabels: Record<ImageGenerationJob["status"], string> = {
  queued: "排队中",
  in_progress: "生成中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function selectedModelValue(model: ImageQueueModel) {
  return `${model.provider}::${model.model}`;
}

function ChoiceButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-11 min-w-0 items-center justify-between gap-2 rounded-2xl border border-input bg-card px-3 text-left text-sm shadow-xs active:bg-muted"
      type="button"
      onClick={onClick}
    >
      <span className="truncate font-medium">{label}</span>
      <ChevronDown
        className="shrink-0 text-muted-foreground"
        size={16}
        strokeWidth={1.9}
      />
    </button>
  );
}

function OptionSheet<T extends string>({
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  title: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onPick: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {options.map((option) => (
            <button
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm active:bg-muted",
                value === option.value
                  ? "border-cta bg-cta/8 font-semibold text-cta"
                  : "border-border bg-card text-foreground",
              )}
              key={option.value}
              type="button"
              onClick={() => {
                onPick(option.value);
                onClose();
              }}
            >
              {option.label}
              {value === option.value ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function resultImages(job: ImageGenerationJob): ImageJobResultImage[] {
  return job.resultJson?.images ?? [];
}

function QuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const update = (next: number) => onChange(Math.min(4, Math.max(1, next)));

  return (
    <div className="flex h-11 w-[142px] flex-none items-center justify-between rounded-2xl border border-input bg-card px-2 shadow-xs">
      <div className="min-w-0">
        <p className="text-[10px] leading-none text-muted-foreground">
          生成数量
        </p>
        <p className="mt-0.5 text-base font-semibold leading-none">{value}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          aria-label="减少生成数量"
          className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground disabled:opacity-40"
          disabled={value <= 1}
          type="button"
          onClick={() => update(value - 1)}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="增加生成数量"
          className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          disabled={value >= 4}
          type="button"
          onClick={() => update(value + 1)}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function ReferenceImageSheet({
  materials,
  selectedMaterialIds,
  uploadedRefs,
  maxCount,
  onUpload,
  onToggleMaterial,
  onRemoveUpload,
  onClose,
}: {
  materials: Material[];
  selectedMaterialIds: number[];
  uploadedRefs: string[];
  maxCount: number;
  onUpload: (files: FileList | null) => void;
  onToggleMaterial: (material: Material) => void;
  onRemoveUpload: (index: number) => void;
  onClose: () => void;
}) {
  const selectedIds = new Set(selectedMaterialIds);
  const selectedCount = selectedMaterialIds.length + uploadedRefs.length;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>参考图看板</SheetTitle>
        </SheetHeader>
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-4 pb-6">
          <label
            className={cn(
              "flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-card text-sm font-medium text-muted-foreground",
              selectedCount >= maxCount && "pointer-events-none opacity-45",
            )}
          >
            <Upload size={16} />
            上传参考图
            <input
              multiple
              accept="image/*"
              className="hidden"
              type="file"
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = "";
              }}
            />
          </label>

          {uploadedRefs.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                已上传
              </p>
              <div className="grid grid-cols-3 gap-2">
                {uploadedRefs.map((image, index) => (
                  <button
                    className="relative aspect-square overflow-hidden rounded-2xl border-2 border-primary"
                    key={image.slice(-24)}
                    type="button"
                    onClick={() => onRemoveUpload(index)}
                  >
                    <img
                      alt="上传参考图"
                      className="size-full object-cover"
                      src={image}
                    />
                    <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
                      <X size={12} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                从素材库选择
              </p>
              <span className="text-xs text-muted-foreground">
                {selectedCount}/{maxCount}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {materials.map((material) => {
                const assetUrl = material.assetUrl;
                if (!assetUrl) {
                  return null;
                }
                const selected = selectedIds.has(material.id);
                const disabled = !selected && selectedCount >= maxCount;
                return (
                  <button
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-2xl border-2 bg-muted",
                      selected ? "border-primary" : "border-transparent",
                      disabled && "opacity-45",
                    )}
                    disabled={disabled}
                    key={material.id}
                    type="button"
                    onClick={() => onToggleMaterial(material)}
                  >
                    <img
                      alt={material.title}
                      className="size-full object-cover"
                      src={thumbnailUrl(assetUrl, 240)}
                    />
                    {selected ? (
                      <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {materials.length === 0 ? (
              <p className="rounded-2xl bg-muted/45 p-5 text-center text-sm text-muted-foreground">
                素材库还没有图片
              </p>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SaveGeneratedImageButton({
  image,
  job,
}: {
  image: ImageJobResultImage;
  job: ImageGenerationJob;
}) {
  const save = useSaveGeneratedImage(job.id);

  return (
    <button
      className="absolute bottom-2 right-2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
      disabled={save.isPending}
      type="button"
      onClick={async () => {
        try {
          await save.mutateAsync({
            index: image.index,
            type: "pet_image",
            title: `AI 生成图片 ${formatDateTime(job.createdAt).slice(0, 10)}`,
            tags: ["AI生成"],
          });
          toast("已保存到素材库");
        } catch (error) {
          toast(error instanceof Error ? error.message : "保存失败", "error");
        }
      }}
    >
      {save.isPending ? "保存中" : "存素材"}
    </button>
  );
}

function JobCard({
  expanded,
  job,
  onRetry,
  onToggle,
}: {
  expanded: boolean;
  job: ImageGenerationJob;
  onRetry: (job: ImageGenerationJob) => void;
  onToggle: () => void;
}) {
  const refresh = useRefreshImageJob();
  const cancel = useCancelImageJob();
  const deleteJob = useDeleteImageJob();
  const active = job.status === "queued" || job.status === "in_progress";
  const images = resultImages(job);
  const firstImage = images[0];

  async function removeJob() {
    if (
      !window.confirm("删除这条生图任务记录？已保存到素材库的图片不会受影响。")
    ) {
      return;
    }
    try {
      await deleteJob.mutateAsync(job.id);
      toast("任务已删除");
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    }
  }

  return (
    <article className="rounded-2xl border border-border/70 bg-card shadow-xs">
      <button
        className="flex w-full items-center gap-3 p-3 text-left active:bg-muted/50"
        type="button"
        onClick={onToggle}
      >
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
          {firstImage ? (
            <img
              alt={firstImage.revised_prompt ?? job.prompt}
              className="size-full object-cover"
              src={`/api/ai/image-jobs/${job.id}/image/${firstImage.index}`}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              {active ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <ImagePlus size={18} />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                job.status === "completed" && "bg-success-soft text-success",
                active && "bg-warning-soft text-warning",
                job.status === "failed" && "bg-destructive/10 text-destructive",
                job.status === "cancelled" && "bg-muted text-muted-foreground",
              )}
            >
              {statusLabels[job.status]}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {job.model} · {job.size}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm font-medium">{job.prompt}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(job.createdAt)}
          </p>
        </div>
        <ChevronRight
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
          size={18}
        />
      </button>

      {expanded && job.errorMessage ? (
        <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {job.errorMessage}
        </p>
      ) : null}

      {expanded && images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          {images.map((image) => (
            <div
              className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
              key={image.index}
            >
              <img
                alt={image.revised_prompt ?? job.prompt}
                className="size-full object-cover"
                src={`/api/ai/image-jobs/${job.id}/image/${image.index}`}
              />
              <SaveGeneratedImageButton image={image} job={job} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 border-t border-border/60 p-2">
        <Button
          className="h-9 flex-1 rounded-xl"
          disabled={refresh.isPending}
          variant="outline"
          onClick={() => refresh.mutate(job.id)}
        >
          <RefreshCw size={15} />
          刷新
        </Button>
        {active ? (
          <Button
            className="h-9 flex-1 rounded-xl"
            disabled={cancel.isPending}
            variant="outline"
            onClick={() => cancel.mutate(job.id)}
          >
            <X size={15} />
            取消
          </Button>
        ) : (
          <>
            <Button
              className="h-9 flex-1 rounded-xl"
              disabled={deleteJob.isPending}
              variant="outline"
              onClick={() => onRetry(job)}
            >
              <RefreshCw size={15} />
              重试
            </Button>
            <Button
              className="h-9 flex-1 rounded-xl text-destructive"
              disabled={deleteJob.isPending}
              variant="outline"
              onClick={removeJob}
            >
              <Trash2 size={15} />
              删除
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

export function ImageGeneratePage() {
  const config = useImageQueueConfig();
  const jobs = useImageJobs();
  const materials = useMaterials();
  const submit = useSubmitImageJob();
  const refreshActiveJob = useRefreshImageJob();
  const [prompt, setPrompt] = useState("");
  const [size, setSize] =
    useState<(typeof sizeOptions)[number]["value"]>("1024x1024");
  const [quality, setQuality] = useState<QualityValue>("medium");
  const [count, setCount] = useState(1);
  const [modelValue, setModelValue] = useState("");
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState<
    string[]
  >([]);
  const [referenceMaterialIds, setReferenceMaterialIds] = useState<number[]>(
    [],
  );
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [qualityPickerOpen, setQualityPickerOpen] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [expandedJobIds, setExpandedJobIds] = useState<Set<number>>(
    () => new Set(),
  );

  const models = config.data?.models ?? [];
  const selectedModel = useMemo(
    () => models.find((model) => selectedModelValue(model) === modelValue),
    [modelValue, models],
  );
  const modelOptions = useMemo(
    () =>
      models.map((model) => ({
        value: selectedModelValue(model),
        label: model.label,
      })),
    [models],
  );
  const selectedQualityLabel =
    qualityOptions.find((option) => option.value === quality)?.label ??
    "中质量";
  const imageMaterials = useMemo(
    () =>
      (materials.data?.materials ?? []).filter(
        (material) => material.assetUrl && material.type !== "copywriting",
      ),
    [materials.data?.materials],
  );
  const referenceCount =
    uploadedReferenceImages.length + referenceMaterialIds.length;
  const selectedReferenceMaterials = imageMaterials.filter((material) =>
    referenceMaterialIds.includes(material.id),
  );

  useEffect(() => {
    if (!modelValue && config.data?.defaultModel) {
      const model =
        models.find(
          (item) =>
            item.provider === config.data.defaultProvider &&
            item.model === config.data.defaultModel,
        ) ??
        models.find((item) => item.model === config.data.defaultModel) ??
        models[0];
      if (model) {
        setModelValue(selectedModelValue(model));
      }
    }
  }, [
    config.data?.defaultModel,
    config.data?.defaultProvider,
    modelValue,
    models,
  ]);

  async function addReferences(files: FileList | null) {
    if (!files) {
      return;
    }
    const picked = Array.from(files).slice(0, 3 - referenceCount);
    const next = await Promise.all(
      picked.map((file) => fileToCompressedDataUrl(file, 1400)),
    );
    setUploadedReferenceImages((prev) => [...prev, ...next].slice(0, 3));
  }

  function toggleReferenceMaterial(material: Material) {
    setReferenceMaterialIds((prev) => {
      if (prev.includes(material.id)) {
        return prev.filter((id) => id !== material.id);
      }
      if (prev.length + uploadedReferenceImages.length >= 3) {
        toast("参考图最多 3 张", "error");
        return prev;
      }
      return [...prev, material.id];
    });
  }

  async function submitJob() {
    if (!selectedModel) {
      toast("请选择模型", "error");
      return;
    }
    try {
      const created = await submit.mutateAsync({
        prompt,
        size,
        quality,
        n: count,
        provider: selectedModel.provider,
        model: selectedModel.model,
        materialIds: referenceMaterialIds,
        referenceImages: uploadedReferenceImages,
      });
      setExpandedJobIds((prev) => new Set([...prev, created.job.id]));
      setPrompt("");
      setUploadedReferenceImages([]);
      setReferenceMaterialIds([]);
      toast("生图任务已提交");
    } catch (error) {
      toast(error instanceof Error ? error.message : "提交失败", "error");
    }
  }

  async function retryJob(job: ImageGenerationJob) {
    try {
      const retried = await submit.mutateAsync({
        prompt: job.prompt,
        size: job.size as (typeof sizeOptions)[number]["value"],
        quality: (job.quality ?? "medium") as QualityValue,
        n: Math.max(1, Math.min(4, resultImages(job).length || 1)),
        provider: job.provider,
        model: job.model,
        materialIds: [],
        referenceImages: [],
      });
      setExpandedJobIds((prev) => new Set([...prev, retried.job.id]));
      toast("已重新提交生图任务");
    } catch (error) {
      toast(error instanceof Error ? error.message : "重试失败", "error");
    }
  }

  function toggleJob(id: number) {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const allJobs = jobs.data?.jobs ?? [];
  const activeJobs = allJobs.filter((job) =>
    ["queued", "in_progress"].includes(job.status),
  );
  const activeJobIds = activeJobs.map((job) => job.id).join(",");

  useEffect(() => {
    const ids = activeJobIds
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) {
      return;
    }
    const refresh = () => {
      if (refreshActiveJob.isPending) {
        return;
      }
      for (const id of ids) {
        refreshActiveJob.mutate(id);
      }
    };
    const timer = window.setInterval(refresh, 6000);
    refresh();
    return () => window.clearInterval(timer);
  }, [activeJobIds, refreshActiveJob.isPending, refreshActiveJob.mutate]);

  return (
    <div className="px-4 pt-4 pb-36">
      <header className="relative flex items-center justify-center py-1">
        <Link
          className="absolute left-0 flex size-9 items-center justify-center rounded-full bg-card shadow-xs"
          to="/materials"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <ImagePlus className="text-warning" size={18} />
          AI 生图
        </h1>
      </header>

      <section className="mt-3 rounded-3xl bg-card p-4 shadow-xs">
        <Textarea
          className="min-h-28 resize-none rounded-2xl bg-muted/35 text-sm"
          maxLength={2000}
          placeholder="描述你想生成的图片，也可以写用途、画面比例、风格和需要避开的元素"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <ChoiceButton
            label={selectedModel?.label ?? "选择模型"}
            onClick={() => setModelPickerOpen(true)}
          />
          <ChoiceButton
            label={selectedQualityLabel}
            onClick={() => setQualityPickerOpen(true)}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {sizeOptions.map((option) => (
            <button
              className={cn(
                "rounded-2xl border py-2.5 text-sm",
                size === option.value
                  ? "border-cta bg-cta/8 font-medium text-cta"
                  : "border-border text-muted-foreground",
              )}
              key={option.value}
              type="button"
              onClick={() => setSize(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <QuantityStepper
            value={count}
            onChange={(nextCount) => setCount(nextCount)}
          />
          <button
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-input px-2 text-sm text-muted-foreground active:bg-muted"
            type="button"
            onClick={() => setReferencePickerOpen(true)}
          >
            <ImagePlus size={16} />
            <span className="whitespace-nowrap">参考图 {referenceCount}/3</span>
          </button>
        </div>

        {referenceCount > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {uploadedReferenceImages.map((image, index) => (
              <div
                className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted"
                key={`upload-${image.slice(-24)}`}
              >
                <img alt="" className="size-full object-cover" src={image} />
                <button
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white"
                  type="button"
                  onClick={() =>
                    setUploadedReferenceImages((prev) =>
                      prev.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {selectedReferenceMaterials.map((material) => {
              const assetUrl = material.assetUrl;
              if (!assetUrl) {
                return null;
              }
              return (
                <div
                  className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted"
                  key={`material-${material.id}`}
                >
                  <img
                    alt={material.title}
                    className="size-full object-cover"
                    src={thumbnailUrl(assetUrl, 160)}
                  />
                  <button
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white"
                    type="button"
                    onClick={() =>
                      setReferenceMaterialIds((prev) =>
                        prev.filter((id) => id !== material.id),
                      )
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <Button
          className="mt-4 h-12 w-full rounded-2xl text-base"
          disabled={!prompt.trim() || submit.isPending || !config.data?.enabled}
          onClick={submitJob}
        >
          {submit.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {submit.isPending ? "提交中..." : "提交生图任务"}
        </Button>

        {!config.data?.enabled && !config.isLoading ? (
          <p className="mt-2 text-center text-xs text-destructive">
            图片队列服务未配置
          </p>
        ) : null}
      </section>

      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">任务结果</h2>
          {activeJobs.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {activeJobs.length} 个进行中
            </span>
          ) : null}
        </div>
        <div className="space-y-3">
          {allJobs.map((job) => (
            <JobCard
              expanded={
                expandedJobIds.has(job.id) ||
                ["queued", "in_progress"].includes(job.status)
              }
              job={job}
              key={job.id}
              onRetry={retryJob}
              onToggle={() => toggleJob(job.id)}
            />
          ))}
          {allJobs.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
              还没有生图任务
            </p>
          ) : null}
        </div>
      </section>

      {modelPickerOpen ? (
        <OptionSheet
          title="选择模型"
          options={modelOptions}
          value={modelValue}
          onClose={() => setModelPickerOpen(false)}
          onPick={setModelValue}
        />
      ) : null}

      {qualityPickerOpen ? (
        <OptionSheet
          title="选择质量"
          options={[...qualityOptions]}
          value={quality}
          onClose={() => setQualityPickerOpen(false)}
          onPick={setQuality}
        />
      ) : null}

      {referencePickerOpen ? (
        <ReferenceImageSheet
          materials={imageMaterials}
          maxCount={3}
          selectedMaterialIds={referenceMaterialIds}
          uploadedRefs={uploadedReferenceImages}
          onClose={() => setReferencePickerOpen(false)}
          onRemoveUpload={(index) =>
            setUploadedReferenceImages((prev) =>
              prev.filter((_, itemIndex) => itemIndex !== index),
            )
          }
          onToggleMaterial={toggleReferenceMaterial}
          onUpload={addReferences}
        />
      ) : null}
    </div>
  );
}
