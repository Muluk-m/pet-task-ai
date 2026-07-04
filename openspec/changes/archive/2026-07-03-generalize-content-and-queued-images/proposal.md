## Why

The current generation flow is too narrow: review copy is framed as pet/cat usage, user intent can only be expressed through fixed choices, and image generation is a blocking modal-like tool inside the materials page. Users need a broader content workspace that can generate platform-ready copy and submit long-running image jobs without losing progress when they navigate away.

## What Changes

- Generalize copy generation from "pet review only" to "platform content generation" for any task/product context.
- Add a free-form custom requirement field so users can describe exactly what they want the AI to write, instead of only choosing platform/style/word count.
- Add a structured Xiaohongshu publishing-content generation mode that can return schema fields for one-click downstream use, including title, body, hashtags, cover suggestion, image notes, and compliance notes.
- Replace synchronous image generation with queued image jobs backed by the existing `qlj-image-playground` BFF queue service.
- Move AI image generation out of the materials sheet/card flow into a dedicated page that shows submitted jobs, progress, results, errors, and allows users to leave and return.
- Keep generated images user-confirmed before saving into the materials library, while preserving task state and result links locally.

## Capabilities

### New Capabilities
- `content-generation`: Generate user-directed copy for reviews and platform posts, including structured Xiaohongshu publish payloads.
- `queued-image-generation`: Submit and track long-running AI image jobs through an external queue service, with a dedicated UI and result persistence.

### Modified Capabilities
- `material-management`: Image generation becomes a source that can save completed generated images into materials, instead of being an inline blocking generation flow inside the materials page.

## Impact

- Shared schemas in `packages/shared/src/index.ts` for content-generation inputs/outputs and queued image job contracts.
- Worker AI routes in `apps/worker/src/routes/ai.ts`, plus possible new DB tables/migrations for image generation jobs.
- Web API hooks/types in `apps/web/src/api/client.ts` and `apps/web/src/api/types.ts`.
- UI changes in `apps/web/src/pages/GeneratePage.tsx`, `MaterialsPage.tsx`, a new dedicated image generation page, and app navigation.
- External dependency on the `qlj-image-playground` queue protocol at `https://image.nainma.online/` or its configured BFF base URL.
