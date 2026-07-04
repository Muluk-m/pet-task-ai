import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

export type MobileSelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string | null;
};

export function MobileSelectButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-11 min-w-0 items-center justify-between gap-2 rounded-2xl border border-input bg-card px-3 text-left text-sm shadow-xs active:bg-muted disabled:opacity-55"
      disabled={disabled}
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

export function MobileSelectSheet<T extends string>({
  title,
  options,
  value,
  open,
  onPick,
  onOpenChange,
}: {
  title: string;
  options: Array<MobileSelectOption<T>>;
  value: T;
  open: boolean;
  onPick: (value: T) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="mx-auto max-w-[560px] rounded-t-3xl"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="max-h-[60dvh] space-y-2 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-left text-sm active:bg-muted",
                  selected
                    ? "border-cta bg-cta/8 font-semibold text-cta"
                    : "border-border bg-card text-foreground",
                )}
                key={option.value}
                type="button"
                onClick={() => {
                  onPick(option.value);
                  onOpenChange(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {selected ? <Check className="shrink-0" size={16} /> : null}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
