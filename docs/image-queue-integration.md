# AI Image Queue Integration

Pet Task AI submits long-running image generation jobs through the existing
`qlj-image-playground` BFF instead of calling image models synchronously from
the Worker.

## Runtime Contract

- Pet Worker endpoint: `/api/ai/image-jobs`
- External queue base URL: configured by `pt.config.json` at
  `imageQueue.baseUrl`
- Default production base URL: `https://image.nainma.online`
- External queue endpoints used by the Worker:
  - `GET /api/channels`
  - `POST /v1/queue/{provider}/{model}/submit`
  - `GET /v1/queue/requests/{id}/status`
  - `GET /v1/queue/requests/{id}/image/{index}`
  - `PUT /v1/queue/requests/{id}/cancel`

The browser only calls the Pet Worker. It does not need CORS access to the BFF
and never receives upstream image API keys.

## Production Configuration

Configure `pt.config.json`:

```json
{
  "imageQueue": {
    "baseUrl": "https://image.nainma.online",
    "activeChannel": "openai-images",
    "channels": [
      {
        "id": "openai-images",
        "kind": "openai-queue",
        "label": "OpenAI",
        "models": [
          {
            "id": "gpt-image-2",
            "label": "GPT Image 2"
          }
        ]
      }
    ]
  }
}
```

No new Pet Worker secret is required for image generation. The upstream model
API keys remain owned by the `qlj-image-playground` BFF.

## Deployment Checklist

1. Apply D1 migrations through the normal deployment flow.
2. Confirm the BFF is reachable from Cloudflare Workers at
   `imageQueue.baseUrl`.
3. Confirm `GET /api/channels` returns the available channel/model pairs. The
   local `pt.config.json` channel list is only a fallback.
4. Smoke test: submit a job, refresh status to completed, open a result image,
   and save it into the materials library.
