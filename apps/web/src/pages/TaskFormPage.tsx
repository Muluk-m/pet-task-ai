import type { OrderChannel } from "@pet-task-ai/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ImagePlus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  uploadTaskCover,
  useCreateTask,
  useTask,
  useUpdateTask,
} from "../api/client";
import { ChannelPicker } from "../components/bits";
import {
  MobileDateButton,
  MobileDateSheet,
} from "../components/mobile-date-picker";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { fileToCompressedDataUrl } from "../lib/image";
import { cn } from "../lib/utils";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children 恒为 Input/Textarea 控件
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function parseCashbackAmount(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (!/^\d+(?:\.\d)?$/.test(trimmed)) {
    return null;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

export function TaskFormPage() {
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const editingId = params.taskId ? Number(params.taskId) : null;
  const isEdit = editingId !== null;

  const { data } = useTask(isEdit ? editingId : null);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(editingId ?? 0);

  const [title, setTitle] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [productName, setProductName] = useState("");
  const [cashbackAmount, setCashbackAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [ruleText, setRuleText] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [note, setNote] = useState("");
  const [needXhs, setNeedXhs] = useState(false);
  const [needDouyin, setNeedDouyin] = useState(false);
  const [needReview, setNeedReview] = useState(false);
  const [orderChannel, setOrderChannel] = useState<OrderChannel>("other");
  const [needCashback, setNeedCashback] = useState(true);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [existingCover, setExistingCover] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deadlinePickerOpen, setDeadlinePickerOpen] = useState(false);

  useEffect(() => {
    if (isEdit && data?.task && !loaded) {
      const task = data.task;
      setTitle(task.title);
      setMerchantName(task.merchantName ?? "");
      setProductName(task.productName ?? "");
      setCashbackAmount(
        task.cashbackAmount != null ? String(task.cashbackAmount) : "",
      );
      setDeadline(task.deadline ?? "");
      setRuleText(task.ruleText ?? "");
      setTrackingNo(task.trackingNo ?? "");
      setNote(task.note ?? "");
      setOrderChannel((task.orderChannel as OrderChannel) ?? "other");
      setExistingCover(task.coverImageUrl);
      setLoaded(true);
    }
  }, [isEdit, data, loaded]);

  async function pickCover(file: File | null) {
    if (!file) {
      return;
    }
    try {
      setCoverDataUrl(await fileToCompressedDataUrl(file, 1200));
    } catch (error) {
      toast(error instanceof Error ? error.message : "图片处理失败", "error");
    }
  }

  async function submitCover(taskId: number) {
    if (!coverDataUrl) {
      return;
    }
    const formData = new FormData();
    formData.set("file", await dataUrlToBlob(coverDataUrl), "cover.jpg");
    await uploadTaskCover(taskId, formData);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim() === "") {
      toast("请填写任务标题", "error");
      return;
    }

    const amount = parseCashbackAmount(cashbackAmount);
    if (amount === null) {
      toast("返现金额最多保留 1 位小数", "error");
      return;
    }

    try {
      if (isEdit) {
        await updateTask.mutateAsync({
          title: title.trim(),
          merchantName: merchantName.trim() || null,
          productName: productName.trim() || null,
          cashbackAmount: amount ?? null,
          deadline: deadline || null,
          ruleText: ruleText.trim() || null,
          trackingNo: trackingNo.trim() || null,
          note: note.trim() || null,
          orderChannel,
        });
        await submitCover(editingId);
        toast("修改已保存");
        navigate(`/tasks/${editingId}`);
      } else {
        const result = await createTask.mutateAsync({
          title: title.trim(),
          merchantName: merchantName.trim() || undefined,
          productName: productName.trim() || undefined,
          cashbackAmount: amount,
          deadline: deadline || undefined,
          ruleText: ruleText.trim() || undefined,
          trackingNo: trackingNo.trim() || undefined,
          note: note.trim() || undefined,
          requiresXiaohongshu: needXhs,
          requiresDouyin: needDouyin,
          requiresReview: needReview,
          orderChannel,
          requiresCashback: needCashback,
        });
        await submitCover(result.task.id);
        toast("任务已创建");
        navigate(`/tasks/${result.task.id}`, { replace: true });
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    }
  }

  const submitting = createTask.isPending || updateTask.isPending;
  const coverPreview = coverDataUrl ?? existingCover;

  const toggles = [
    { label: "需小红书笔记", checked: needXhs, onChange: setNeedXhs },
    { label: "需抖音帖子", checked: needDouyin, onChange: setNeedDouyin },
  ];

  return (
    <div className="mx-auto max-w-[560px] px-4 pt-2 pb-28">
      <header className="flex items-center justify-between py-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5.5" />
        </Button>
        <h1 className="text-lg font-semibold">
          {isEdit ? "编辑任务" : "新建任务"}
        </h1>
        <span className="size-8" />
      </header>

      <form onSubmit={handleSubmit}>
        <section className="space-y-4 rounded-3xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-4">
            {coverPreview ? (
              <div className="relative size-22 shrink-0 overflow-hidden rounded-2xl">
                <img
                  alt="任务封面"
                  className="size-full object-cover"
                  src={coverPreview}
                />
                <button
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white"
                  type="button"
                  onClick={() => {
                    setCoverDataUrl(null);
                    setExistingCover(null);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-input text-xs text-muted-foreground",
                coverPreview ? "size-22 shrink-0" : "h-22 w-full",
              )}
            >
              <ImagePlus size={20} />
              {coverPreview ? "更换" : "上传商品封面图（可选）"}
              <input
                accept="image/*"
                className="hidden"
                type="file"
                onChange={(event) => {
                  pickCover(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          <Field label="任务标题 *">
            <Input
              placeholder="如：全价冻干狗粮 1.5kg"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="商家名称">
            <Input
              placeholder="如：萌宠优选"
              value={merchantName}
              onChange={(event) => setMerchantName(event.target.value)}
            />
          </Field>
          <Field label="商品名称">
            <Input
              placeholder="如：全价冻干狗粮"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
            />
          </Field>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              下单渠道
            </span>
            <ChannelPicker value={orderChannel} onChange={setOrderChannel} />
          </div>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="返现金额（元）">
              <Input
                inputMode="decimal"
                placeholder="如 5.8"
                value={cashbackAmount}
                onChange={(event) => setCashbackAmount(event.target.value)}
              />
            </Field>
            <Field label="截止日期">
              <MobileDateButton
                compact
                value={deadline}
                onClick={() => setDeadlinePickerOpen(true)}
              />
            </Field>
          </div>
          <Field label="快递单号">
            <Input
              placeholder="到货后可在详情页一键复制"
              value={trackingNo}
              onChange={(event) => setTrackingNo(event.target.value)}
            />
          </Field>
          <Field label="商家规则原文">
            <Textarea
              placeholder="粘贴商家发的活动规则，方便随时查看"
              rows={4}
              value={ruleText}
              onChange={(event) => setRuleText(event.target.value)}
            />
          </Field>
          <Field label="备注">
            <Textarea
              placeholder="取件码、驿站位置、商家微信等随手记"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </section>

        {!isEdit ? (
          <section className="mt-4 rounded-3xl border border-border/60 bg-card p-4">
            <h3 className="mb-1 font-semibold">任务步骤</h3>
            {toggles.map((item) => (
              <div
                className="flex items-center justify-between border-b border-border/60 py-3 text-[15px]"
                key={item.label}
              >
                <span>{item.label}</span>
                <Switch
                  checked={item.checked}
                  onCheckedChange={item.onChange}
                />
              </div>
            ))}
            <div className="border-b border-border/60 py-3">
              <div className="flex items-center justify-between text-[15px]">
                <span>需平台好评</span>
                <Switch checked={needReview} onCheckedChange={setNeedReview} />
              </div>
              {needReview ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  好评将发布在上方选择的下单渠道
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between py-3 text-[15px]">
              <span>需确认返现</span>
              <Switch
                checked={needCashback}
                onCheckedChange={setNeedCashback}
              />
            </div>
          </section>
        ) : (
          <p className="mt-3 px-1 text-sm text-muted-foreground">
            步骤的增删请在任务详情页操作
          </p>
        )}

        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-[560px] p-4 pb-safe">
            <Button
              className="h-11 w-full rounded-2xl text-base"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "保存中..." : isEdit ? "保存修改" : "创建任务"}
            </Button>
          </div>
        </footer>
      </form>
      <MobileDateSheet
        open={deadlinePickerOpen}
        value={deadline}
        onChange={setDeadline}
        onOpenChange={setDeadlinePickerOpen}
      />
    </div>
  );
}
