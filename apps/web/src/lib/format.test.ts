import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dateGroupLabel,
  deadlineInfo,
  formatCnDate,
  parseDbDate,
} from "./format";

describe("formatCnDate", () => {
  it("formats an ISO date as 中文月日", () => {
    expect(formatCnDate("2025-05-27")).toBe("5月27日");
    expect(formatCnDate("2025-12-01")).toBe("12月1日");
  });
});

describe("parseDbDate", () => {
  it("treats bare D1 timestamps as UTC", () => {
    const date = parseDbDate("2025-05-16 06:00:00");
    expect(date.toISOString()).toBe("2025-05-16T06:00:00.000Z");
  });
});

describe("deadlineInfo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 20, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks past deadlines as overdue", () => {
    const info = deadlineInfo("2025-05-19");
    expect(info.tone).toBe("overdue");
    expect(info.label).toContain("已逾期");
  });

  it("marks deadlines within 3 days (including today) as soon", () => {
    expect(deadlineInfo("2025-05-20").tone).toBe("soon");
    expect(deadlineInfo("2025-05-23").tone).toBe("soon");
  });

  it("marks later deadlines as normal", () => {
    expect(deadlineInfo("2025-05-24").tone).toBe("normal");
  });
});

describe("dateGroupLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 22, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // DB 存 UTC，本地按设备时区分组——用本地时间构造输入以保证任意时区可复现
  function toDbString(local: Date) {
    return local.toISOString().slice(0, 19).replace("T", " ");
  }

  it("groups by 今天 / 昨天 / 具体日期", () => {
    expect(dateGroupLabel(toDbString(new Date(2025, 4, 22, 9, 0, 0)))).toBe(
      "今天",
    );
    expect(dateGroupLabel(toDbString(new Date(2025, 4, 21, 12, 0, 0)))).toBe(
      "昨天",
    );
    expect(dateGroupLabel(toDbString(new Date(2025, 4, 19, 12, 0, 0)))).toBe(
      "5月19日",
    );
  });
});
