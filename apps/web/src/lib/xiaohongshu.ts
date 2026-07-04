const XIAOHONGSHU_PUBLISH_SCHEME = "xhsdiscover://post";
const XIAOHONGSHU_APP_SCHEME = "xhsdiscover://";
const SCHEME_FALLBACK_DELAY_MS = 900;

type XiaohongshuSource = {
  type: "pages" | "order" | "activity" | "home" | "personal";
  ids: string;
  extraInfo?: Record<string, string>;
};

type OpenXiaohongshuPublishOptions = {
  ignoreDraft?: boolean;
  source?: XiaohongshuSource;
};

function encodeQueryValue(value: unknown): string {
  return encodeURIComponent(
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

export function buildXiaohongshuPublishUrl({
  ignoreDraft = false,
  source = {
    type: "personal",
    ids: "",
    extraInfo: { source: "pet-task-ai" },
  },
}: OpenXiaohongshuPublishOptions = {}) {
  return `${XIAOHONGSHU_PUBLISH_SCHEME}?ignore_draft=${String(ignoreDraft)}&source=${encodeQueryValue(source)}`;
}

export function openXiaohongshuPublish(
  options?: OpenXiaohongshuPublishOptions,
) {
  window.location.href = buildXiaohongshuPublishUrl(options);

  window.setTimeout(() => {
    if (document.visibilityState === "visible") {
      window.location.href = XIAOHONGSHU_APP_SCHEME;
    }
  }, SCHEME_FALLBACK_DELAY_MS);
}
