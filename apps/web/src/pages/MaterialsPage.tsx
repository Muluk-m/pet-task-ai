import type { MaterialType } from "@pet-task-ai/shared";
import {
  Camera,
  ChevronRight,
  MessageSquareText,
  PawPrint,
  Quote,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  useDeleteMaterial,
  useMaterials,
  useUploadMaterial,
} from "../api/client";
import type { Material } from "../api/types";
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
import { cn } from "../lib/utils";

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

function MaterialCard({
  material,
  onDelete,
}: {
  material: Material;
  onDelete: () => void;
}) {
  if (material.assetUrl) {
    return (
      <article className="relative overflow-hidden rounded-2xl bg-card shadow-xs">
        <img
          alt={material.title}
          className="aspect-square w-full object-cover"
          loading="lazy"
          src={material.assetUrl}
        />
        <button
          className="absolute right-1.5 top-1.5 rounded-full bg-black/45 p-1.5 text-white"
          type="button"
          onClick={onDelete}
        >
          <Trash2 size={13} />
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
    <article className="flex flex-col rounded-2xl bg-card p-3 shadow-xs">
      <div className="flex items-start justify-between">
        <Quote
          className="rotate-180 text-primary/60"
          size={18}
          fill="currentColor"
          strokeWidth={0}
        />
        <button
          className="p-0.5 text-muted-foreground"
          type="button"
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <p className="mt-1.5 flex-1 overflow-hidden text-[13px] leading-relaxed [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6]">
        {material.content}
      </p>
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
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const isImageType = type !== "copywriting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim() === "") {
      toast("请填写素材标题", "error");
      return;
    }
    if (isImageType && !file) {
      toast("请拍照或选择图片", "error");
      return;
    }
    if (!isImageType && content.trim() === "") {
      toast("请填写文案内容", "error");
      return;
    }

    const formData = new FormData();
    formData.set("type", type);
    formData.set("title", title.trim());
    formData.set("content", content.trim());
    formData.set("tags", tags);
    if (isImageType && file) {
      formData.set("file", file);
    }

    try {
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
          <Input
            placeholder="素材标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Input
            placeholder="标签，用空格或逗号分隔"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
          <Textarea
            placeholder={isImageType ? "备注（可选）" : "文案内容"}
            rows={3}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          {isImageType ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-input bg-muted/40 px-4 py-3.5 text-sm text-muted-foreground">
              <Camera size={18} />
              <span className="truncate">
                {file ? file.name : "拍照或选择图片"}
              </span>
              <input
                accept="image/*"
                className="hidden"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
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

  async function handleDelete(material: Material) {
    if (window.confirm(`删除素材「${material.title}」？`)) {
      await deleteMaterial.mutateAsync(material.id);
      toast("素材已删除");
    }
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
    </div>
  );
}
