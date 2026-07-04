const XIAOHONGSHU_PUBLISH_SCHEME = "xhsdiscover://post";
const XIAOHONGSHU_APP_SCHEME = "xhsdiscover://";
const SCHEME_FALLBACK_DELAY_MS = 900;

export function openXiaohongshuPublish() {
  window.location.href = XIAOHONGSHU_PUBLISH_SCHEME;

  window.setTimeout(() => {
    if (document.visibilityState === "visible") {
      window.location.href = XIAOHONGSHU_APP_SCHEME;
    }
  }, SCHEME_FALLBACK_DELAY_MS);
}
