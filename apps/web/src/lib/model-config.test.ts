import { describe, expect, it } from "vitest";
import { flattenAiModelOptions, flattenImageQueueModels } from "./model-config";

describe("flattenAiModelOptions", () => {
  it("returns an empty list when providers are missing", () => {
    expect(flattenAiModelOptions({ defaultModel: "gpt-5.4mini" })).toEqual([]);
  });

  it("flattens provider models and keeps the provider id", () => {
    expect(
      flattenAiModelOptions({
        providers: [
          {
            id: "openai",
            models: [
              {
                id: "mini",
                ref: "gpt-5.4mini",
                label: "GPT 5.4 Mini",
                description: null,
                supportsVision: false,
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        id: "mini",
        ref: "gpt-5.4mini",
        label: "GPT 5.4 Mini",
        description: null,
        supportsVision: false,
        providerId: "openai",
      },
    ]);
  });
});

describe("flattenImageQueueModels", () => {
  it("falls back to legacy models when providers are missing", () => {
    expect(
      flattenImageQueueModels({
        models: [
          {
            provider: "openai-compat",
            model: "gpt-image-2",
            label: "GPT Image 2",
            description: null,
          },
        ],
      }),
    ).toEqual([
      {
        provider: "openai-compat",
        model: "gpt-image-2",
        label: "GPT Image 2",
        description: null,
      },
    ]);
  });

  it("prefers provider models over legacy models", () => {
    expect(
      flattenImageQueueModels({
        providers: [
          {
            id: "gemini",
            models: [
              {
                provider: "gemini",
                model: "gemini-3.1-flash-image",
                label: "Gemini 3.1 Flash Image",
                description: null,
              },
            ],
          },
        ],
        models: [
          {
            provider: "openai-compat",
            model: "gpt-image-2",
            label: "GPT Image 2",
            description: null,
          },
        ],
      }),
    ).toEqual([
      {
        provider: "gemini",
        model: "gemini-3.1-flash-image",
        label: "Gemini 3.1 Flash Image",
        description: null,
      },
    ]);
  });
});
