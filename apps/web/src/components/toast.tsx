import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

type ToastMessage = {
  id: number;
  text: string;
  tone: "success" | "error";
};

type Listener = (toast: ToastMessage) => void;

let listener: Listener | null = null;
let nextId = 1;

export function toast(text: string, tone: "success" | "error" = "success") {
  listener?.({ id: nextId++, text, tone });
}

export function ToastHost() {
  const [current, setCurrent] = useState<ToastMessage | null>(null);

  useEffect(() => {
    listener = (message) => setCurrent(message);
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!current) {
      return;
    }
    const timer = setTimeout(() => setCurrent(null), 2400);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) {
    return null;
  }

  return (
    <output
      className={cn(
        "fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg",
        current.tone === "error" ? "bg-destructive" : "bg-foreground/90",
      )}
    >
      {current.text}
    </output>
  );
}
