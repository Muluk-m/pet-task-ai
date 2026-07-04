import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

function parseDateValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(value: string | null | undefined) {
  const date = parseDateValue(value);
  if (!date) {
    return "年 / 月 / 日";
  }
  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(
    date.getDate(),
  )}日`;
}

function monthTitle(date: Date) {
  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type CalendarDay = {
  date: Date;
  value: string;
  inMonth: boolean;
};

function buildCalendarDays(month: Date): CalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      value: toDateValue(date),
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
}

export function MobileDateButton({
  value,
  disabled = false,
  compact = false,
  onClick,
}: {
  value: string;
  disabled?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-2 border border-input text-left text-base active:bg-muted disabled:opacity-55 md:text-sm",
        compact
          ? "h-8 rounded-lg bg-transparent px-2.5 py-1"
          : "h-11 rounded-2xl bg-card px-3 text-sm shadow-xs",
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <span
        className={cn(
          "truncate font-medium",
          !value && "text-muted-foreground",
        )}
      >
        {formatDateLabel(value)}
      </span>
      <CalendarDays
        className="shrink-0 text-muted-foreground"
        size={16}
        strokeWidth={1.9}
      />
    </button>
  );
}

export function MobileDateSheet({
  title = "选择截止日期",
  value,
  open,
  onChange,
  onOpenChange,
}: {
  title?: string;
  value: string;
  open: boolean;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const selectedDate = parseDateValue(value);
  const [month, setMonth] = useState(
    () =>
      selectedDate ??
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => buildCalendarDays(month), [month]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const currentSelectedDate = parseDateValue(value);
    setMonth(
      currentSelectedDate ??
        new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    );
  }, [open, value]);

  function pick(nextValue: string) {
    onChange(nextValue);
    onOpenChange(false);
  }

  function moveMonth(offset: number) {
    setMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + offset, 1);
      return next;
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <div className="flex items-center justify-between">
            <button
              className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground active:bg-border/60"
              type="button"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <p className="text-base font-bold">{monthTitle(month)}</p>
            <button
              className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground active:bg-border/60"
              type="button"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
            {weekDays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((day) => {
              const selected = value === day.value;
              const isToday = sameDay(day.date, today);
              return (
                <button
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-2xl text-sm font-medium active:bg-muted",
                    day.inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/45",
                    selected &&
                      "bg-primary text-primary-foreground active:bg-primary",
                    !selected &&
                      isToday &&
                      "border border-primary/40 text-primary",
                  )}
                  key={day.value}
                  type="button"
                  onClick={() => pick(day.value)}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              className="flex h-10 items-center justify-center gap-1 rounded-2xl bg-muted px-3 text-sm font-medium text-muted-foreground active:bg-border/60"
              type="button"
              onClick={() => pick("")}
            >
              <X size={14} />
              清除
            </button>
            <button
              className="h-10 rounded-2xl bg-secondary px-3 text-sm font-medium text-primary active:bg-secondary/80"
              type="button"
              onClick={() => pick(toDateValue(today))}
            >
              今天
            </button>
            <button
              className="h-10 rounded-2xl bg-secondary px-3 text-sm font-medium text-primary active:bg-secondary/80"
              type="button"
              onClick={() => {
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                pick(toDateValue(tomorrow));
              }}
            >
              明天
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
