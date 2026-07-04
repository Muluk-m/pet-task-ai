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
    "defaultProvider": "gemini",
    "defaultModel": "gemini-3.1-flash-image",
    "models": [
      {
        "provider": "gemini",
        "model": "gemini-3.1-flash-image",
        "label": "Nano Banana 2"
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
3. Confirm configured `provider` and `model` pairs exist on the BFF.
4. Smoke test: submit a job, refresh status to completed, open a result image,
   and save it into the materials library.
