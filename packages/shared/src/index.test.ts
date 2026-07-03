import { describe, expect, it } from "vitest";
import {
  aiExtractInputSchema,
  aiTaskExtractionSchema,
  createTaskSchema,
  generateReviewSchema,
  updateTaskSchema,
} from "./index";

describe("createTaskSchema", () => {
  it("defaults cashback to required and other steps to off", () => {
    const parsed = createTaskSchema.parse({ title: "冻干狗粮" });
    expect(parsed.requiresCashback).toBe(true);
    expect(parsed.requiresXiaohongshu).toBe(false);
    expect(parsed.requiresDouyin).toBe(false);
    expect(parsed.requiresReview).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(createTaskSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("validates deadline format as YYYY-MM-DD", () => {
    expect(
      createTaskSchema.safeParse({ title: "t", deadline: "2025-05-31" })
        .success,
    ).toBe(true);
    expect(
      createTaskSchema.safeParse({ title: "t", deadline: "2025-05-31 23:59" })
        .success,
    ).toBe(false);
  });

  it("rejects negative cashback amounts", () => {
    expect(
      createTaskSchema.safeParse({ title: "t", cashbackAmount: -1 }).success,
    ).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("allows clearing nullable fields with null", () => {
    const parsed = updateTaskSchema.parse({ deadline: null, ruleText: null });
    expect(parsed.deadline).toBeNull();
    expect(parsed.ruleText).toBeNull();
  });
});

describe("aiExtractInputSchema", () => {
  it("accepts text-only input", () => {
    expect(
      aiExtractInputSchema.safeParse({ ruleText: "小红书笔记要求 30 字" })
        .success,
    ).toBe(true);
  });

  it("accepts image-only input", () => {
    expect(
      aiExtractInputSchema.safeParse({
        images: ["data:image/jpeg;base64,/9j/AAA"],
      }).success,
    ).toBe(true);
  });

  it("rejects empty input and too many images", () => {
    expect(aiExtractInputSchema.safeParse({}).success).toBe(false);
    expect(aiExtractInputSchema.safeParse({ ruleText: "短" }).success).toBe(
      false,
    );
    expect(
      aiExtractInputSchema.safeParse({
        images: Array(4).fill("data:image/png;base64,AAAA"),
      }).success,
    ).toBe(false);
  });
});

describe("aiTaskExtractionSchema", () => {
  it("parses a full extraction with defaults for notes", () => {
    const parsed = aiTaskExtractionSchema.parse({
      title: "便携榨汁杯",
      requiresXiaohongshu: true,
      requiresCashback: true,
      cashbackAmount: 12,
      deadline: "2025-05-31",
      confidence: 0.92,
    });
    expect(parsed.notes).toEqual([]);
    expect(parsed.confidence).toBeCloseTo(0.92);
  });

  it("rejects out-of-range confidence", () => {
    expect(
      aiTaskExtractionSchema.safeParse({ title: "t", confidence: 1.2 }).success,
    ).toBe(false);
  });
});

describe("generateReviewSchema", () => {
  it("bounds word count to 20-500", () => {
    const base = { platform: "xiaohongshu", style: "real_daily" } as const;
    expect(
      generateReviewSchema.safeParse({ ...base, wordCount: 150 }).success,
    ).toBe(true);
    expect(
      generateReviewSchema.safeParse({ ...base, wordCount: 10 }).success,
    ).toBe(false);
    expect(
      generateReviewSchema.safeParse({ ...base, wordCount: 999 }).success,
    ).toBe(false);
  });

  it("defaults materialIds to an empty array", () => {
    const parsed = generateReviewSchema.parse({
      platform: "generic",
      style: "short_praise",
      wordCount: 100,
    });
    expect(parsed.materialIds).toEqual([]);
  });
});
