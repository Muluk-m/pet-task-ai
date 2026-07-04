## Context

`GeneratePage` currently submits `/api/ai/generate-review` and stores one text result in `generated_contents`. The prompt is pet-focused and only accepts task, materials, platform, style, and word count. `MaterialsPage` owns AI image generation through `/api/ai/generate-image`; the Worker synchronously waits for image bytes and returns a data URL, so navigation or long upstream latency breaks the user experience.

`/Users/qian/Projects/QLj/qlj-image-playground` already provides a queue BFF with `POST /v1/queue/{provider}/{model}/submit`, `GET /v1/queue/requests/{id}/status`, `GET /v1/queue/requests/{id}`, `GET /v1/queue/requests/{id}/image/{index}`, and cancel. It persists tasks, hides upstream API keys, supports multiple models/providers, and is deployed at the image playground domain.

## Goals / Non-Goals

**Goals:**
- Let users add free-form generation requirements for text content.
- Support both plain copy generation and structured Xiaohongshu publish-content payloads.
- Remove pet/cat-only assumptions from generated copy while still using task and material context when present.
- Submit image generation as durable queue jobs, persist the local mapping, and show progress/results on a dedicated page.
- Reuse the existing image-playground queue API and API keys.

**Non-Goals:**
- Automatically publish to Xiaohongshu or any external social platform.
- Store external API keys in the web client.
- Make every image-playground setting available in the first integration.
- Save generated images into materials without explicit user action.

## Decisions

1. Content generation keeps one Worker route but adds explicit modes.

   `/api/ai/generate-review` can be evolved into `/api/ai/generate-content` or kept as a compatibility alias. The input includes `mode: "review_text" | "xiaohongshu_publish"` and `customRequirement`. Plain review output stores `content` as today; structured Xiaohongshu output stores JSON text in `generated_contents.content` initially, with web types parsing it for display. A future migration can split structured fields into columns if search/filtering is needed.

   Alternative considered: create separate routes per platform. Rejected because task/material context assembly, safety rules, and generation history are shared.

2. The prompt becomes product-neutral.

   The system prompt describes "真实用户内容代笔" instead of "宠物用品真实用户". Pet context remains available if the task/materials indicate it. The model must prioritize `customRequirement` over style presets where they conflict, while preserving platform compliance rules.

   Alternative considered: add a "category" selector. Rejected for now because free-form requirements cover broader needs with less UI friction.

3. Image jobs are first-class local records.

   Add an `image_generation_jobs` table with user ID, external request ID, provider, model, prompt, size, status, error, submitted/started/completed timestamps, result metadata JSON, and saved material IDs. The Worker submits jobs to image-playground and proxies status/result/image fetches so the pet app keeps user isolation and can persist a stable local history.

   Alternative considered: let the browser call image-playground directly and persist in localStorage. Rejected because cross-origin/CORS, user isolation, and "leave and return" durability are better handled server-side.

4. External queue configuration is environment-driven.

   Add config for image queue base URL, default provider/model, and allowlisted models. The Worker owns calls to the BFF. The web UI receives available models via a pet app API endpoint, not direct knowledge of image-playground internals.

   Alternative considered: import image-playground shared package into this monorepo. Rejected to avoid cross-repo workspace coupling; copy the small HTTP contract locally or define compatible Zod schemas.

5. Dedicated image generation page owns job UX.

   Add `/image-generate` as a primary or secondary navigation target. It displays a form, active jobs, completed jobs, progress states, retry/cancel where supported, and save-to-material actions. Materials page links to this page instead of opening inline generation.

## Risks / Trade-offs

- External BFF URL or CORS policy may reject Worker/browser calls → route all BFF calls through the pet Worker and add health/error messaging.
- Queue result images may expire or be purged after the image-playground retention window → save selected images into the pet app R2 before relying on them as materials.
- Structured Xiaohongshu output can drift from schema → validate AI JSON with Zod and retry once, following the existing AI helper pattern.
- Storing structured output as JSON text limits querying → acceptable initially because generation history is read-mostly and small.
- Multiple long-running jobs can increase polling cost → use TanStack Query polling only for non-terminal jobs and back off interval.

## Migration Plan

1. Add shared schemas and route aliases for content generation, preserving existing `/generate-review` behavior.
2. Add the image job DB table and Worker endpoints while keeping existing synchronous `/generate-image` until the new page is usable.
3. Build the dedicated image generation page and link Materials page to it.
4. Switch Materials page away from inline generation after queued flow is verified.
5. Remove or deprecate the synchronous image route in a later cleanup.

Rollback: keep the existing text route and synchronous image route during rollout. If queue integration fails, hide `/image-generate` navigation and keep Materials upload/manual flows intact.
