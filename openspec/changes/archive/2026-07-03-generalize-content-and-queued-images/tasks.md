## 1. Content Generation

- [x] 1.1 Extend shared generation schemas with `customRequirement`, content mode, and structured Xiaohongshu payload validation.
- [x] 1.2 Update Worker AI content generation to use product-neutral prompts and honor custom requirements.
- [x] 1.3 Add structured Xiaohongshu publish-content generation with JSON validation and retry.
- [x] 1.4 Update web generation UI to expose custom requirements and content mode selection.
- [x] 1.5 Update generation history UI/types to distinguish plain text and structured Xiaohongshu payloads.
- [x] 1.6 Add focused tests for schema validation and prompt/context behavior where practical.

## 2. Queued Image Generation Backend

- [x] 2.1 Add image queue configuration for BFF base URL, provider/model defaults, and model allowlist.
- [x] 2.2 Add `image_generation_jobs` schema and migration with user scoping and result metadata.
- [x] 2.3 Implement Worker endpoints to submit jobs to image-playground, list jobs, refresh status, fetch result images, cancel jobs, and save result images into R2 materials.
- [x] 2.4 Add Worker tests with mocked queue service responses.

## 3. Dedicated Image Generation UI

- [x] 3.1 Add an image generation page and route with prompt, model, size, and reference image controls.
- [x] 3.2 Display active, completed, failed, and cancelled jobs with polling for non-terminal jobs.
- [x] 3.3 Implement save-to-material action for completed result images.
- [x] 3.4 Link Materials page AI generation entry points to the dedicated image generation page.
- [x] 3.5 Verify mobile layout, navigation, and offline/cache behavior for job history.

## 4. Rollout

- [x] 4.1 Keep existing synchronous image route available during rollout.
- [x] 4.2 Add manual smoke checks for text generation, Xiaohongshu structured generation, queue submission, status polling, cancellation, and save-to-material.
- [x] 4.3 Document required production secrets/configuration for the image queue integration.
