# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 产品定位

个人向的宠物商品「置换活动」任务管理工具（手机优先 PWA 方向）。核心场景：用户参加宠物厂商的置换活动——下单商品，到货后按商家要求发小红书笔记 / 抖音帖子 / 电商好评，最后找客服确认返现。

主线流程：
1. 录入任务：标题（商家 + 商品名），勾选是否需要小红书笔记、抖音帖子、好评；返现步骤默认需要，可配置金额与截止日期。任务可附带商家规则原文（`ruleText`）。
2. 首页是 TODO list：进行中 / 已完成两个列表；逾期红色置顶、临期（≤3 天）次优先。
3. 任务详情页逐步骤完成：笔记/帖子步骤必须提交合法链接，好评步骤佐证可选，返现步骤一键确认。
4. 所有步骤完成后任务自动完成（判定只在服务端），置灰 + 删除线，移入已完成列表。

已实现的辅助功能：
- 素材管理：文案素材、宠物图片、商家评论图三类（图片存 R2，支持手机拍照直传）。
- AI 一键创建：粘贴商家规则文字**或上传聊天截图（最多 3 张，前端 canvas 压缩为 JPEG data URL）** → `/api/ai/extract-task` 多模态结构化抽取（含每平台要求、置信度、存疑 notes）→ 预填表单人工确认 → 创建。gpt-5.5 经此网关支持 image_url 图片输入。
- 好评生成：选任务 + 选素材组合 + 平台（小红书/抖音/通用）+ 风格 + 字数 → `/api/ai/generate-review` 生成，存入 `generated_contents`。
- 返现统计（我的页）：累计 / 本月 / 待回款，从任务数据前端聚合。
- 任务编辑、归档与恢复（已归档列表在「我的」页）。

此外已实现：
- **登录与用户隔离**：users 表 + 全数据表 user_id，Cookie 会话（HMAC 签名，30 天），除 `/api/health` 与 `/api/auth/*` 外全部 API 需登录。密码 PBKDF2 哈希（种子用户在迁移 0003 中）。
- **PWA**：injectManifest 策略 + 自定义 SW（`apps/web/src/sw.ts`），skipWaiting + controllerchange 自动刷新——**发布即更新是硬性要求**；`/api/*` 永不缓存；图标由 `apps/web/scripts/generate-icons.mjs` 生成；版本号（构建时间）显示在「我的」页。
- **推送提醒**：Workers Cron（每天 01:00 UTC = 北京 09:00）检查临期/逾期任务，向 push_subscriptions 发送无 payload Web Push（免 RFC8291 加密），SW 展示固定文案；「我的」页开关订阅。
- **数据本地一份**：TanStack Query 持久化到 localStorage（7 天），离线可查看，写操作需在线。D1 是唯一事实源。
- 每个任务自动带「下单到货」（delivery）首步骤。

**部署**：https://pet-task.nainma.online （自定义域名，图片走 /cdn-cgi/image 转换 + 边缘缓存；workers.dev 域名 https://pet-task-ai.maqiqian0316.workers.dev 仍可用但无这两项）。Cloudflare 账号 maqiqian0316@gmail.com；push main 自动 CI 部署。

## 常用命令

```bash
pnpm install              # 安装依赖（pnpm 9 workspace）
pnpm dev                  # 同时启动 web (vite :5173) 和 worker (wrangler dev :8787)
pnpm build                # turbo 构建
pnpm typecheck            # 全仓库 tsc --noEmit
pnpm test                 # 全部 Vitest（shared 纯单测 / web jsdom / worker 真 workerd+D1）
pnpm lint                 # biome check .（Biome 管 lint+format，不用 ESLint/Prettier）
pnpm format               # biome format --write .
pnpm db:generate          # 从 schema 生成 Drizzle 迁移
pnpm db:migrate:local     # 应用迁移到本地 D1
pnpm deploy               # wrangler deploy（先替换 wrangler.jsonc 的 database_id 占位符）
```

单包测试：`pnpm --filter @pet-task-ai/worker test`（或 web/shared）。

## 配置：pt.config.json（仓库根）

- **AI 多 provider**：`ai.providers` 定义各家 baseUrl/model/apiKeyEnv，`ai.activeProvider` 切换。当前 qiliangjia 网关 + `gpt-5.5`。key 通过 `apiKeyEnv` 指向环境变量（本地 `apps/worker/.dev.vars`，生产 wrangler secret），**key 绝不能进仓库**。
- **push**：VAPID 公钥（可公开）、subject、提前提醒天数。VAPID 私钥在 secret `VAPID_PRIVATE_KEY`。
- worker 端 `src/lib/config.ts` 用 Zod fail-fast 校验后 bundle 导入；web 端（我的页推送订阅）直接 import 该 JSON。
- qiliangjia 网关是 ChatGPT/Codex 代理，不支持 gpt-4o 系列，可用 gpt-5.5 / gpt-5.4 / gpt-5.4-mini（`GET {baseUrl}/models` 可查）。
- 生产 secrets 共三个：`OPENAI_API_KEY`、`AUTH_SECRET`（会话签名）、`VAPID_PRIVATE_KEY`。
- AI 调用封装在 `apps/worker/src/lib/openai.ts`：JSON 模式 + Zod 校验 + 失败重试一次。

## 架构

pnpm + Turborepo monorepo，四个包：

- `apps/worker` — Hono API on Cloudflare Workers。绑定：D1（`DB`）、R2（`BUCKET`，素材图）、静态资源（`ASSETS` → `apps/web/dist`）。生产由 Worker 单一部署单元同时提供 API 与前端；本地 Vite 把 `/api` 代理到 :8787。路由：`routes/tasks.ts`（CRUD/归档/步骤增删/完成/撤销）、`routes/materials.ts`、`routes/ai.ts`（抽取 + 生成）。
- `apps/web` — React 19 + Vite + react-router + TanStack Query + **Tailwind CSS v4 + shadcn**（radix 基座，组件在 `src/components/ui/`，主题 token 在 `src/styles.css` 的 `:root`——奶油底 #f5f1e8 / 墨绿主色 #16655a / 琥珀 warning / 橘红 cta）。页面在 `src/pages/`，底部 5 Tab（任务/素材库/中央 AI/生成/我的）在 `layout/AppShell.tsx`。API 层是 `src/api/client.ts` 的类型化 fetch + Query hooks（没用 Hono RPC：worker 类型会把 workers-types 泄漏进 web 的 tsc，故 web 端类型在 `src/api/types.ts` 手声明，输入类型从 shared 引）。
- `packages/db` — Drizzle schema（D1/SQLite）。schema 在这里，但 drizzle-kit 配置与迁移文件在 `apps/worker/`。改表流程：改 `packages/db/src/schema.ts` → `pnpm db:generate` → `pnpm db:migrate:local`。
- `packages/shared` — Zod schema，是 API 校验（`zValidator`）与 AI 结构化输出的单一事实来源。前后端共享的输入类型都从这里引。

### 核心数据模型与业务规则

- `tasks` 1:N `task_steps`。创建任务时后端把 `requires*` 布尔展开为步骤行；AI 抽取的每平台要求写入 `task_steps.requirement`。
- **任务完成判定唯一入口在服务端** `recomputeTaskStatus`（`routes/tasks.ts`）：complete / undo / 删除步骤后统一重算——pending 为 0 且有已完成步骤 → completed；undo 后有 pending → 回退 active。前端只做展示，不得重复判定。
- 小红书/抖音步骤 complete 必须带合法 URL（服务端 400 + 前端即时校验双保险）；已完成步骤须先 undo 才能删除。
- D1 时间戳是 UTC 裸字符串，前端必须用 `lib/format.ts` 的 `parseDbDate`（补 Z）解析，否则差 8 小时。

### 测试

- worker 集成测试用 `@cloudflare/vitest-pool-workers`（vitest 4 插件形式 `cloudflareTest`）跑真 workerd：`test/wrangler.test.jsonc` 是不带 ASSETS/R2 的测试专用配置，迁移在 `test/apply-migrations.ts` 里应用，`test/env.d.ts` 声明测试绑定类型。
- 用 `app.request(path, init, env)` 直接打 Hono app，不起 dev server。
- AI 路由未做单测（依赖外部网关），改动后用 curl 冒烟。

### 工作流

仓库使用 OpenSpec 规格驱动开发（`/opsx:propose|apply|archive|explore`），产物在 `openspec/`。当前 change `redesign-core-tasks` 已实现（超范围完成了 AI 创建与好评生成，即原计划的 change ③④）。UI 以用户提供的 5 张设计图为准（奶油底/墨绿主色的移动端风格）。

产品范围文档：`docs/product-scope.md`。
