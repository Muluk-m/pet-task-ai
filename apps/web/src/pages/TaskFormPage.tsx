import { ChevronLeft } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useCreateTask, useTask, useUpdateTask } from "../api/client";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";

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

export function TaskFormPage() {
  const navigate = useNavigate();
  const params = useParams();
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
  const [needXhs, setNeedXhs] = useState(false);
  const [needDouyin, setNeedDouyin] = useState(false);
  const [needReview, setNeedReview] = useState(false);
  const [needCashback, setNeedCashback] = useState(true);
  const [loaded, setLoaded] = useState(false);

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
      setLoaded(true);
    }
  }, [isEdit, data, loaded]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim() === "") {
      toast("请填写任务标题", "error");
      return;
    }

    const amount =
      cashbackAmount.trim() === "" ? undefined : Number(cashbackAmount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      toast("返现金额格式不正确", "error");
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
        });
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
          requiresXiaohongshu: needXhs,
          requiresDouyin: needDouyin,
          requiresReview: needReview,
          requiresCashback: needCashback,
        });
        toast("任务已创建");
        navigate(`/tasks/${result.task.id}`, { replace: true });
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    }
  }

  const submitting = createTask.isPending || updateTask.isPending;

  const toggles = [
    { label: "需小红书笔记", checked: needXhs, onChange: setNeedXhs },
    { label: "需抖音帖子", checked: needDouyin, onChange: setNeedDouyin },
    { label: "需电商好评", checked: needReview, onChange: setNeedReview },
    { label: "需确认返现", checked: needCashback, onChange: setNeedCashback },
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="返现金额（元）">
              <Input
                inputMode="decimal"
                placeholder="如 18"
                value={cashbackAmount}
                onChange={(event) => setCashbackAmount(event.target.value)}
              />
            </Field>
            <Field label="截止日期">
              <Input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </Field>
          </div>
          <Field label="商家规则原文">
            <Textarea
              placeholder="粘贴商家发的活动规则，方便随时查看"
              rows={4}
              value={ruleText}
              onChange={(event) => setRuleText(event.target.value)}
            />
          </Field>
        </section>

        {!isEdit ? (
          <section className="mt-4 rounded-3xl border border-border/60 bg-card p-4">
            <h3 className="mb-1 font-semibold">任务步骤</h3>
            {toggles.map((item) => (
              <div
                className="flex items-center justify-between border-b border-border/60 py-3 text-[15px] last:border-b-0 last:pb-0"
                key={item.label}
              >
                <span>{item.label}</span>
                <Switch
                  checked={item.checked}
                  onCheckedChange={item.onChange}
                />
              </div>
            ))}
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
    </div>
  );
}
