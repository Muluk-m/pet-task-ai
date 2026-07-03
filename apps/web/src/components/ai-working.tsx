import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

/** AI 请求进行中的读秒卡片：闪烁图标 + 已用秒数 + 弹跳点 */
export function AiWorking({ label }: { label: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-3 flex items-center gap-3 rounded-3xl bg-card p-4 shadow-xs">
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Sparkles className="animate-pulse" size={20} />
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/15" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{label}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          已用时 {elapsed.toFixed(1)} 秒 · 通常需要 5~20 秒
        </p>
      </div>
      <span className="flex shrink-0 items-end gap-1 pb-1">
        {[0, 150, 300].map((delay) => (
          <span
            className="size-1.5 animate-bounce rounded-full bg-fab"
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
