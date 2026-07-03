export function formatCnDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  if (!month || !day) {
    return dateStr;
  }
  return `${month}月${day}日`;
}

export function parseDbDate(value: string): Date {
  if (value.includes("Z") || value.includes("+")) {
    return new Date(value);
  }
  return new Date(`${value.replace(" ", "T")}Z`);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parseDbDate(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseDbDate(value));
}

export function todayHeading(): string {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(
    now,
  );
  return `${now.getMonth() + 1}月${now.getDate()}日 ${weekday}`;
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export type DeadlineTone = "overdue" | "soon" | "normal";

export function deadlineInfo(deadline: string): {
  label: string;
  tone: DeadlineTone;
  daysLeft: number;
} {
  const [year, month, day] = deadline.split("-").map(Number);
  const target = new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
  const daysLeft = Math.round((target - startOfDay(new Date())) / 86_400_000);

  if (daysLeft < 0) {
    return {
      label: `${formatCnDate(deadline)} 已逾期`,
      tone: "overdue",
      daysLeft,
    };
  }
  if (daysLeft <= 3) {
    return { label: `${formatCnDate(deadline)} 截止`, tone: "soon", daysLeft };
  }
  return { label: `${formatCnDate(deadline)} 截止`, tone: "normal", daysLeft };
}

export function dateGroupLabel(value: string): string {
  const date = parseDbDate(value);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diff = Math.round((today - target) / 86_400_000);

  if (diff === 0) {
    return "今天";
  }
  if (diff === 1) {
    return "昨天";
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
