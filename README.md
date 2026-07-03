# Pet Task AI

宠物商品「置换活动」个人任务管理工具。

## 场景

参加宠物厂商的置换活动：下单商品 → 到货后按商家要求发小红书笔记 / 抖音帖子 / 电商好评 → 找客服确认返现。这个应用把每次置换记成一个任务，逐步骤跟踪直到返现完成。

## 功能

### 主线：置换任务管理

- 录入任务：标题（商家 + 商品名），勾选是否需要小红书笔记、抖音帖子、好评；返现默认需要，可配置
- 任务可附带商家规则原文
- 首页 TODO list：进行中 / 已完成两个列表
- 完成步骤时提交对应的笔记链接，返现步骤为「确认已返现」
- 所有步骤完成后任务自动完成，置灰 + 删除线，移入已完成列表

### 辅助功能

- 素材管理：文案素材、宠物图片、商家评论图（图片存 Cloudflare R2，支持手机拍照直传）
- AI 一键创建任务：粘贴商家规则文字，AI 识别并预填表单，确认后创建（含置信度与存疑提示）
- 好评生成：选任务 + 自选素材组合，配置平台（小红书/抖音/通用）、风格与字数，一键生成并复制
- 返现统计：累计返现 / 本月返现 / 待回款
- PWA 与推送提醒（规划中）

## 技术栈

- React 19 + Vite 7 + react-router + TanStack Query（web 前端，移动优先）
- Tailwind CSS v4 + shadcn（radix 基座，自定义奶油底/墨绿主题）
- Hono on Cloudflare Workers（API，同时托管前端静态资源）
- Cloudflare D1 + Drizzle ORM（数据），Cloudflare R2（素材图片）
- OpenAI 兼容网关（规则抽取与文案生成，Zod 结构化校验）
- Vitest（shared 单测 / web jsdom / worker 真 workerd + D1 集成测试）
- pnpm workspace + Turborepo，Biome（lint/format）

## AI 配置

`apps/worker/wrangler.jsonc` 的 vars 配 `OPENAI_BASE_URL` 与 `OPENAI_MODEL`；API key 本地放 `apps/worker/.dev.vars`（`OPENAI_API_KEY=...`，已 gitignore），生产环境执行：

```bash
wrangler secret put OPENAI_API_KEY
```

## 本地开发

```bash
pnpm install
pnpm db:generate
pnpm db:migrate:local
pnpm dev          # web: http://localhost:5173，API: http://localhost:8787
```

## 部署

部署前先创建 Cloudflare 资源，并把 `apps/worker/wrangler.jsonc` 里的占位 `database_id` 替换掉：

```bash
wrangler d1 create pet-task-ai
wrangler r2 bucket create pet-task-ai-materials
```

然后：

```bash
pnpm build
pnpm --filter @pet-task-ai/worker db:migrate:remote
pnpm deploy
```
