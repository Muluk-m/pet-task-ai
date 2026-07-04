import type { MaterialType } from "@pet-task-ai/shared";
import {
  Camera,
  Check,
  ChevronRight,
  Copy,
  Download,
  MessageSquareText,
  PawPrint,
  Quote,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  useDeleteMaterial,
  useGenerateImage,
  useMaterials,
  useUploadMaterial,
} from "../api/client";
import type { Material } from "../api/types";
import { AiWorking } from "../components/ai-working";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { Textarea } from "../components/ui/textarea";
import { dateGroupLabel, formatTime } from "../lib/format";
import {
  compressImageFile,
  copyImageToClipboard,
  copyText,
  downloadImage,
  fileToCompressedDataUrl,
  thumbnailUrl,
} from "../lib/image";
import { cn } from "../lib/utils";
import { openXiaohongshuPublish } from "../lib/xiaohongshu";

const typeLabels: Record<MaterialType, string> = {
  copywriting: "文案",
  pet_image: "宠物图片",
  merchant_review_image: "评论图",
};

const typeBadgeClass: Record<MaterialType, string> = {
  copywriting: "bg-[#efe9fb] text-[#7c5cd6]",
  pet_image: "bg-success-soft text-success",
  merchant_review_image: "bg-warning-soft text-warning",
};

const filterOptions: Array<{ value: MaterialType | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pet_image", label: "图片" },
  { value: "copywriting", label: "文案" },
  { value: "merchant_review_image", label: "评论图" },
];

async function copyMaterialImage(url: string) {
  try {
    await copyImageToClipboard(url);
    toast("图片已复制");
  } catch (error) {
    toast(error instanceof Error ? error.message : "复制失败", "error");
  }
}

async function copyMaterialText(content: string) {
  try {
    await copyText(content);
    toast("已复制文案");
  } catch (error) {
    toast(error instanceof Error ? error.message : "复制失败", "error");
  }
}

async function publishTextToXiaohongshu(content: string) {
  try {
    await copyText(content);
    toast("文案已复制，请在小红书粘贴发布");
    openXiaohongshuPublish();
  } catch (error) {
    toast(error instanceof Error ? error.message : "发送失败", "error");
  }
}

type ImageMaterialType = "pet_image" | "merchant_review_image";

const imageTypeOptions = [
  { value: "pet_image", label: "宠物图片" },
  { value: "merchant_review_image", label: "评论图" },
] as const;

/** 图片素材类型单选（宠物图片 / 评论图）：一组按钮片段，供生图表单与确认态复用 */
function TypePills({
  value,
  onChange,
}: {
  value: ImageMaterialType;
  onChange: (value: ImageMaterialType) => void;
}) {
  return (
    <>
      {imageTypeOptions.map((option) => (
        <button
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm",
            value === option.value
              ? "border-primary bg-secondary font-medium text-primary"
              : "border-border text-muted-foreground",
          )}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </>
  );
}

function MaterialCard({
  material,
  onDelete,
  onPreview,
}: {
  material: Material;
  onDelete: () => void;
  onPreview: () => void;
}) {
  if (material.assetUrl) {
    const assetUrl = material.assetUrl;
    return (
      <article className="relative overflow-hidden rounded-2xl bg-card shadow-xs">
        <button className="block w-full" type="button" onClick={onPreview}>
          <img
            alt={material.title}
            className="aspect-square w-full object-cover"
            decoding="sync"
            src={thumbnailUrl(assetUrl, 400)}
          />
        </button>
        <button
          className="absolute right-1.5 top-1.5 rounded-full bg-black/45 p-1.5 text-white"
          type="button"
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
        <button
          className="absolute right-9 top-1.5 rounded-full bg-black/45 p-1.5 text-white"
          type="button"
          onClick={() => copyMaterialImage(assetUrl)}
        >
          <Copy size={13} />
        </button>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/50 to-transparent px-2 pb-2 pt-6 text-[11px] text-white">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-medium",
              typeBadgeClass[material.type],
            )}
          >
            {typeLabels[material.type]}
          </span>
          <time>{formatTime(material.createdAt)}</time>
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col rounded-2xl bg-card p-3 text-left shadow-xs">
      <div className="flex items-start justify-between">
        <Quote
          className="rotate-180 text-primary/60"
          size={18}
          fill="currentColor"
          strokeWidth={0}
        />
        <div className="flex items-center gap-1">
          <button
            className="p-0.5 text-muted-foreground"
            type="button"
            onClick={() => copyMaterialText(material.content ?? "")}
          >
            <Copy size={13} />
          </button>
          <button
            className="p-0.5 text-muted-foreground"
            type="button"
            onClick={onDelete}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <button
        className="mt-1.5 flex-1 overflow-hidden text-left text-[13px] leading-relaxed active:text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6]"
        type="button"
        onClick={onPreview}
      >
        {material.content}
      </button>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 font-medium",
            typeBadgeClass[material.type],
          )}
        >
          {typeLabels[material.type]}
        </span>
        <time className="text-muted-foreground">
          {formatTime(material.createdAt)}
        </time>
      </div>
    </article>
  );
}

function AiImageSheet({
  imageMaterials,
  onClose,
  onDone,
}: {
  imageMaterials: Material[];
  onClose: () => void;
  onDone: (material: Material) => void;
}) {
  const generateImage = useGenerateImage();
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1024x1536" | "1536x1024">(
    "1024x1024",
  );
  const [type, setType] = useState<"pet_image" | "merchant_review_image">(
    "pet_image",
  );
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());
  const [uploadedRefs, setUploadedRefs] = useState<string[]>([]);
  const uploadMaterial = useUploadMaterial();
  // 生成后的草稿（仅存在浏览器，未入库）：用户可改标题，类型沿用表单的 type/setType
  const [draft, setDraft] = useState<{ dataUrl: string; title: string } | null>(
    null,
  );

  const refCount = pickedIds.size + uploadedRefs.length;

  function togglePick(id: number) {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (refCount < 3) {
        next.add(id);
      }
      return next;
    });
  }

  async function addUploadRef(file: File | undefined) {
    if (!file || refCount >= 3) {
      return;
    }
    try {
      setUploadedRefs((prev) => prev.slice());
      const dataUrl = await fileToCompressedDataUrl(file, 1200);
      setUploadedRefs((prev) => [...prev, dataUrl]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "图片处理失败", "error");
    }
  }

  async function handleGenerate() {
    if (prompt.trim().length < 2) {
      toast("请先描述要生成的图片", "error");
      return;
    }
    try {
      const { image } = await generateImage.mutateAsync({
        prompt: prompt.trim(),
        materialIds: [...pickedIds],
        referenceImages: uploadedRefs,
        size,
      });
      // 进入可编辑确认态：标题自动取 prompt 前若干字（类型继续用表单的 type）
      setDraft({ dataUrl: image, title: prompt.trim().slice(0, 24) });
    } catch (error) {
      toast(error instanceof Error ? error.message : "生成失败", "error");
    }
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }
    try {
      const blob = await (await fetch(draft.dataUrl)).blob();
      const file = new File([blob], "ai-image.png", { type: "image/png" });
      const form = new FormData();
      form.set("type", type);
      form.set("title", draft.title.trim() || "AI 生成图片");
      form.set("content", prompt.trim());
      form.set("tags", "ai");
      form.set("file", file);
      const { material } = await uploadMaterial.mutateAsync(form);
      toast("已存入素材库 ✨");
      onDone(material);
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    }
  }

  if (draft) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          className="mx-auto max-w-[560px] rounded-t-3xl"
          side="bottom"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-1.5">
              <Sparkles className="text-primary" size={17} />
              确认保存到素材
            </SheetTitle>
          </SheetHeader>
          <div className="max-h-[70dvh] space-y-3.5 overflow-y-auto px-4 pb-6">
            <img
              alt="生成结果"
              className="mx-auto max-h-[40dvh] rounded-2xl object-contain"
              src={draft.dataUrl}
            />
            <Input
              placeholder="给这张图起个名（可选）"
              value={draft.title}
              onChange={(event) =>
                setDraft((prev) =>
                  prev ? { ...prev, title: event.target.value } : prev,
                )
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <TypePills value={type} onChange={setType} />
            </div>
            <div className="flex gap-2">
              <Button
                className="h-11 flex-1 rounded-2xl"
                disabled={uploadMaterial.isPending}
                onClick={saveDraft}
              >
                <Check />
                {uploadMaterial.isPending ? "保存中..." : "保存到素材"}
              </Button>
              <Button
                className="h-11 rounded-2xl"
                disabled={uploadMaterial.isPending}
                variant="outline"
                onClick={() => setDraft(null)}
              >
                重新生成
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const sizeOptions = [
    { value: "1024x1024", label: "方图" },
    { value: "1024x1536", label: "竖图" },
    { value: "1536x1024", label: "横图" },
  ] as const;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-1.5">
            <Sparkles className="text-primary" size={17} />
            AI 生成素材
          </SheetTitle>
        </SheetHeader>
        <div className="max-h-[70dvh] space-y-3.5 overflow-y-auto px-4 pb-6">
          <Textarea
            placeholder="描述要生成的图片，如：一只橘猫趴在猫抓板上晒太阳，温馨家居氛围，真实摄影感"
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />

          <div>
            <p className="mb-1.5 text-sm font-medium text-muted-foreground">
              参考图（可选，最多 3 张）
            </p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              <label className="flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-input text-muted-foreground">
                <Upload size={16} />
                <input
                  accept="image/*"
                  className="hidden"
                  type="file"
                  onChange={(event) => {
                    addUploadRef(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {uploadedRefs.map((dataUrl, index) => (
                <button
                  className="relative size-16 shrink-0 overflow-hidden rounded-xl border-2 border-primary"
                  key={`up-${dataUrl.slice(-16)}`}
                  type="button"
                  onClick={() =>
                    setUploadedRefs((prev) =>
                      prev.filter((_, i) => i !== index),
                    )
                  }
                >
                  <img
                    alt="参考图"
                    className="size-full object-cover"
                    src={dataUrl}
                  />
                </button>
              ))}
              {imageMaterials.map((material) => {
                const assetUrl = material.assetUrl;
                if (!assetUrl) {
                  return null;
                }
                const selected = pickedIds.has(material.id);
                return (
                  <button
                    className={cn(
                      "relative size-16 shrink-0 overflow-hidden rounded-xl border-2",
                      selected ? "border-primary" : "border-transparent",
                    )}
                    key={material.id}
                    type="button"
                    onClick={() => togglePick(material.id)}
                  >
                    <img
                      alt={material.title}
                      className="size-full object-cover"
                      src={thumbnailUrl(assetUrl, 128)}
                    />
                    {selected ? (
                      <span className="absolute right-1 top-1 flex size-4.5 items-center justify-center rounded-full bg-primary text-white">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sizeOptions.map((option) => (
              <button
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm",
                  size === option.value
                    ? "border-primary bg-secondary font-medium text-primary"
                    : "border-border text-muted-foreground",
                )}
                key={option.value}
                type="button"
                onClick={() => setSize(option.value)}
              >
                {option.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-border" />
            <TypePills value={type} onChange={setType} />
          </div>

          <Button
            className="h-11 w-full rounded-2xl"
            disabled={generateImage.isPending}
            onClick={handleGenerate}
          >
            <Sparkles />
            {generateImage.isPending ? "生成中..." : "开始生成"}
          </Button>
          {generateImage.isPending ? (
            <AiWorking hint="生图通常需要 20~60 秒" label="AI 正在生成图片" />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ImagePreviewOverlay({
  material,
  onClose,
}: {
  material: Material;
  onClose: () => void;
}) {
  const assetUrl = material.assetUrl;
  if (!assetUrl) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      <button
        aria-label="关闭预览"
        className="absolute inset-0"
        type="button"
        onClick={onClose}
      />
      <div className="pointer-events-none relative flex h-full flex-col">
        <div className="flex justify-end p-3 pt-safe">
          <button
            className="pointer-events-auto rounded-full bg-white/15 p-2 text-white"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <img
            alt={material.title}
            className="pointer-events-auto max-h-full max-w-full rounded-xl object-contain"
            src={assetUrl}
          />
        </div>
        <div className="flex justify-center gap-3 p-6 pb-10">
          <button
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/15 px-5 py-2.5 text-sm font-medium text-white active:scale-95"
            type="button"
            onClick={() => copyMaterialImage(assetUrl)}
          >
            <Copy size={15} />
            复制
          </button>
          <button
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground active:scale-95"
            type="button"
            onClick={async () => {
              try {
                await downloadImage(
                  assetUrl,
                  `${material.title || "material"}.png`,
                );
                toast("已开始保存");
              } catch (error) {
                toast(
                  error instanceof Error ? error.message : "保存失败",
                  "error",
                );
              }
            }}
          >
            <Download size={15} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function TextPreviewSheet({
  material,
  onClose,
  onDelete,
}: {
  material: Material;
  onClose: () => void;
  onDelete: () => void;
}) {
  const content = material.content ?? "";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>文案预览</SheetTitle>
        </SheetHeader>
        <div className="max-h-[70dvh] space-y-3 overflow-y-auto px-4 pb-6">
          <div className="rounded-2xl bg-muted/45 p-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-medium",
                  typeBadgeClass[material.type],
                )}
              >
                {typeLabels[material.type]}
              </span>
              <time>{formatTime(material.createdAt)}</time>
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {content}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              className="h-11 rounded-2xl"
              variant="outline"
              onClick={() => copyMaterialText(content)}
            >
              <Copy size={15} />
              复制
            </Button>
            <Button
              className="h-11 rounded-2xl"
              onClick={() => publishTextToXiaohongshu(content)}
            >
              <Send size={15} />
              小红书
            </Button>
            <Button
              className="h-11 rounded-2xl text-destructive"
              variant="outline"
              onClick={onDelete}
            >
              <Trash2 size={15} />
              删除
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UploadSheet({
  initialType,
  onClose,
}: {
  initialType: MaterialType;
  onClose: () => void;
}) {
  const uploadMaterial = useUploadMaterial();
  const [type, setType] = useState<MaterialType>(initialType);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 预览用的 object URL：在其变更前与组件卸载时释放，避免内存泄漏
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const isImageType = type !== "copywriting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isImageType && !file) {
      toast("请拍照或选择图片", "error");
      return;
    }
    if (!isImageType && content.trim() === "") {
      toast("请填写文案内容", "error");
      return;
    }

    // 标题可选：图片留空自动按日期命名，文案留空取正文开头（相册/列表本就不显示标题）
    const finalTitle =
      title.trim() ||
      (isImageType
        ? `图片素材 ${new Date().toLocaleDateString("zh-CN")}`
        : content.trim().slice(0, 24));

    try {
      const formData = new FormData();
      formData.set("type", type);
      formData.set("title", finalTitle);
      formData.set("content", content.trim());
      if (isImageType && file) {
        formData.set("file", await compressImageFile(file));
      }

      await uploadMaterial.mutateAsync(formData);
      toast("素材已保存");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "上传失败", "error");
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>上传素材</SheetTitle>
        </SheetHeader>
        <form className="space-y-3 px-4 pb-6" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            {(Object.keys(typeLabels) as MaterialType[]).map((option) => (
              <button
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition-colors",
                  type === option
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
                key={option}
                type="button"
                onClick={() => setType(option)}
              >
                {typeLabels[option]}
              </button>
            ))}
          </div>
          {isImageType ? (
            <label className="block cursor-pointer">
              <input
                accept="image/*"
                className="hidden"
                type="file"
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null;
                  setFile(picked);
                  setPreviewUrl(picked ? URL.createObjectURL(picked) : null);
                }}
              />
              {previewUrl ? (
                <img
                  alt="预览"
                  className="mx-auto max-h-[40dvh] rounded-2xl object-contain"
                  src={previewUrl}
                />
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-muted/40 text-sm text-muted-foreground">
                  <Camera size={24} />
                  拍照或选择图片
                </div>
              )}
            </label>
          ) : null}
          <Input
            placeholder={
              isImageType ? "标题（可选，留空自动命名）" : "文案标题（可选）"
            }
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {!isImageType ? (
            <Textarea
              placeholder="文案内容"
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          ) : null}
          <Button
            className="h-11 w-full rounded-2xl text-base"
            disabled={uploadMaterial.isPending}
            type="submit"
          >
            <Upload />
            {uploadMaterial.isPending ? "上传中..." : "保存素材"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function MaterialsPage() {
  const { data, isLoading } = useMaterials();
  const deleteMaterial = useDeleteMaterial();
  const [filter, setFilter] = useState<MaterialType | "all">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [uploadType, setUploadType] = useState<MaterialType | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);

  const groups = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const filtered = (data?.materials ?? []).filter(
      (material) =>
        (filter === "all" || material.type === filter) &&
        (query === "" ||
          material.title.toLowerCase().includes(query) ||
          material.content?.toLowerCase().includes(query) ||
          material.tags.some((tag) => tag.toLowerCase().includes(query))),
    );

    const map = new Map<string, Material[]>();
    for (const material of filtered) {
      const label = dateGroupLabel(material.createdAt);
      const list = map.get(label) ?? [];
      list.push(material);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [data, filter, keyword]);

  async function handleDelete(material: Material): Promise<boolean> {
    if (!window.confirm(`删除素材「${material.title}」？`)) {
      return false;
    }
    await deleteMaterial.mutateAsync(material.id);
    toast("素材已删除");
    return true;
  }

  return (
    <div className="px-4 pt-4 pb-32">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold">素材库</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            所有素材都在这里，方便复用与管理 ✨
          </p>
        </div>
        <button
          className="flex size-10 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-xs"
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search size={18} />
        </button>
      </header>

      {searchOpen ? (
        <label className="mt-3 flex items-center gap-2 rounded-2xl bg-card px-3 py-2.5 text-sm shadow-xs">
          <Search
            className="text-muted-foreground"
            size={16}
            strokeWidth={1.8}
          />
          <input
            // biome-ignore lint/a11y/noAutofocus: 搜索框由用户点击展开，聚焦是预期行为
            autoFocus
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="搜索标题、内容或标签"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
      ) : null}

      <section className="mt-4 rounded-3xl border-2 border-dashed border-border bg-card/70 p-4">
        <button
          className="flex w-full items-center gap-3 text-left"
          type="button"
          onClick={() => setUploadType("pet_image")}
        >
          <span className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm shadow-primary/25">
            <Camera size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-lg font-bold">拍照上传</strong>
            <small className="block text-xs text-muted-foreground">
              支持拍照或从相册选择
            </small>
          </span>
          <ChevronRight
            className="shrink-0 text-muted-foreground/50"
            size={18}
          />
        </button>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            className="flex items-center justify-center gap-1.5 rounded-xl border border-success/20 bg-success-soft/60 py-2.5 text-sm font-medium text-success"
            type="button"
            onClick={() => setUploadType("pet_image")}
          >
            <PawPrint size={15} />
            宠物图片
          </button>
          <button
            className="flex items-center justify-center gap-1.5 rounded-xl border border-warning/20 bg-warning-soft/60 py-2.5 text-sm font-medium text-warning"
            type="button"
            onClick={() => setUploadType("merchant_review_image")}
          >
            <MessageSquareText size={15} />
            评论图
          </button>
          <button
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#7c5cd6]/20 bg-[#efe9fb]/70 py-2.5 text-sm font-medium text-[#7c5cd6]"
            type="button"
            onClick={() => setUploadType("copywriting")}
          >
            <Quote size={14} />
            文案
          </button>
        </div>
      </section>

      <Link
        className="relative isolate mt-3 block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#12574d] to-[#0d443c] p-4 text-left text-white shadow-lg shadow-primary/30 active:scale-[0.99]"
        to="/image-generate"
      >
        <Sparkles
          className="pointer-events-none absolute -right-3 -top-4 rotate-12 text-white/10"
          size={88}
          strokeWidth={1.5}
        />
        <PawPrint
          className="pointer-events-none absolute -bottom-5 right-16 -rotate-12 text-white/10"
          size={56}
          strokeWidth={1.5}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <WandSparkles size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="flex items-center gap-2 text-lg font-bold">
              AI 生成素材
              <span className="rounded-full bg-fab px-2 py-0.5 text-[10px] font-semibold">
                ✨ 新
              </span>
            </strong>
            <small className="mt-0.5 block text-xs text-white/75">
              一句话描述出图 · 可带参考图改风格
            </small>
          </span>
          <ChevronRight className="shrink-0 text-white/60" size={18} />
        </div>
      </Link>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
        {filterOptions.map((option) => (
          <button
            className={cn(
              "shrink-0 rounded-full px-5 py-2 text-sm transition-colors",
              filter === option.value
                ? "bg-primary font-medium text-primary-foreground"
                : "bg-card text-muted-foreground shadow-xs",
            )}
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading && groups.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          素材加载中...
        </p>
      ) : null}

      {groups.map(([label, items]) => (
        <section className="mt-5" key={label}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              {label}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {items.length} 个素材
              </span>
            </h2>
            <Link
              className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs text-warning shadow-xs"
              to="/generate"
            >
              <Sparkles size={12} />
              用于好评生成
            </Link>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {items.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                onDelete={() => handleDelete(material)}
                onPreview={() => setPreviewMaterial(material)}
              />
            ))}
          </div>
        </section>
      ))}

      {!isLoading && groups.length === 0 ? (
        <button
          className="mt-4 flex w-full flex-col items-center gap-3 rounded-3xl bg-card py-12 text-muted-foreground active:bg-muted"
          type="button"
          onClick={() => setUploadType("pet_image")}
        >
          <Camera size={32} strokeWidth={1.4} />
          <p className="text-sm">还没有素材，点击上传一张宠物照片吧</p>
        </button>
      ) : null}

      <button
        className="fixed bottom-24 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/35 active:scale-95 sm:right-[calc(50%-264px)]"
        type="button"
        onClick={() => setUploadType("pet_image")}
      >
        <Camera size={22} />
      </button>

      {uploadType ? (
        <UploadSheet
          initialType={uploadType}
          onClose={() => setUploadType(null)}
        />
      ) : null}

      {previewMaterial?.assetUrl ? (
        <ImagePreviewOverlay
          material={previewMaterial}
          onClose={() => setPreviewMaterial(null)}
        />
      ) : null}

      {previewMaterial && !previewMaterial.assetUrl ? (
        <TextPreviewSheet
          material={previewMaterial}
          onClose={() => setPreviewMaterial(null)}
          onDelete={async () => {
            if (await handleDelete(previewMaterial)) {
              setPreviewMaterial(null);
            }
          }}
        />
      ) : null}

      {aiSheetOpen ? (
        <AiImageSheet
          imageMaterials={(data?.materials ?? []).filter((m) => m.assetUrl)}
          onClose={() => setAiSheetOpen(false)}
          onDone={(material) => {
            setAiSheetOpen(false);
            setPreviewMaterial(material);
          }}
        />
      ) : null}
    </div>
  );
}
