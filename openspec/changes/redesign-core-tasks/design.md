# Design: redesign-core-tasks

## Context

当前 `apps/web/src/main.tsx` 是单文件 demo：无路由、无表单、无任务详情，仅素材管理可用。后端已有正确的骨架：任务创建时将 `requires*` 布尔展开为 `task_steps`，步骤完成接口在服务端判定任务自动完成。本 change 在保留后端骨架的前提下重做前端为移动优先的多页应用，并补齐后端缺失的路由。

约束：
- 单用户个人工具，不做鉴权（部署侧风险见 Risks）
- 后续 change（PWA、AI 对话、好评生成、统计）将挂在本 change 建立的 Tab 框架上
- 保持 Hono 链式路由与 `AppType` 导出（RPC 类型推导）

## Goals / Non-Goals

**Goals:**
- 底部 5 Tab 应用框架，首页（任务）与素材两个 Tab 完整可用
- 任务全生命周期闭环：录入 → 逐步骤完成（填链接/确认返现）→ 自动完成 → 已完成列表
- 任务编辑、归档、截止日期（临期/逾期高亮置顶）
- 前后端类型安全打通（共享 Zod schema + Hono RPC client）

**Non-Goals:**
- PWA / Service Worker / 推送（change ②）
- AI 规则抽取与对话创建（change ③）
- 好评生成与返现统计（change ④）——「生成」「AI」「我的」Tab 只落占位页
- 多用户、鉴权、数据导出

## Decisions

### D1: 前端路由用 react-router（library 模式）
需要 URL 可寻址的页面（任务详情 `/tasks/:id`）以支撑刷新与后续 PWA 深链。react-router 生态最成熟、包体小、心智简单。
- 备选：TanStack Router——类型更强但配置重，对本项目规模收益不成比例；纯 state 切 Tab——无深链，废弃。

### D2: API 调用层用 Hono RPC client（`hc<AppType>`）+ TanStack Query
`AppType` 已导出，`hc` 客户端可获得端到端类型推导，替代现在手写的 `fetch` + 手写 TS 类型（消除 web 端与 shared schema 的类型重复）。TanStack Query 继续负责缓存与失效。
- 备选：手写 fetch wrapper——已被证明会产生类型漂移（`main.tsx` 里手写的 `Task` 类型与 DB schema 已不一致）。

### D3: `deadline` 存 ISO 日期字符串（`YYYY-MM-DD`，text 列，可空）
与现有 `created_at` 等 text 时间戳风格一致；截止日期是「天」粒度，不需要时刻。临期定义为 ≤3 天（含当天），逾期为已过截止日仍 active。临期/逾期判定放前端（纯展示逻辑），置顶排序也在前端做——列表数据量是个人规模，无分页压力。

### D4: 后端补齐的路由清单（全部挂在 `tasksRouter` 链上）
```
GET    /api/tasks/:id                     详情（含 steps，用 relations 查询）
PATCH  /api/tasks/:id                     编辑（title/merchant/product/金额/deadline/ruleText）
POST   /api/tasks/:id/archive             归档；POST /:id/unarchive 恢复
POST   /api/tasks/:id/steps               新增步骤（仅 active 任务）
DELETE /api/tasks/:id/steps/:stepId       删除步骤（仅 pending 步骤）
POST   /api/tasks/:id/steps/:stepId/undo  撤销完成（任务若已 completed 则回退 active）
```
现有 `complete` 接口增加输入校验：笔记/帖子步骤必须携带合法 URL（Zod `z.string().url()`），改用 `zValidator` 替代目前的裸 `c.req.json()`。

### D5: 步骤增删/撤销与自动完成的一致性规则
- 自动完成判定唯一入口在服务端（complete / undo / 步骤增删后统一重算 pending 数）
- 删除仅允许 pending 步骤；已完成步骤须先 undo 再删，避免「删掉唯一未完成步骤导致任务瞬间自动完成」的意外——删除后同样触发重算，若剩余 pending 为 0 且任务有至少一个已完成步骤，则任务自动完成（行为与 complete 一致，规格中固定）
- 多语句写操作用 `db.batch()` 保证 D1 上的原子性

### D6: 前端结构页面化，不引 UI 组件库
```
apps/web/src/
├─ main.tsx            入口：Provider + Router
├─ layout/AppShell.tsx 底部 Tab 布局
├─ pages/  HomePage / TaskDetailPage / TaskFormPage(新建+编辑复用)
│          MaterialsPage / PlaceholderPage(生成·AI·我的)
├─ api/client.ts       hc<AppType> + query hooks
└─ styles.css          移动优先自定义 CSS（继续用现有变量风格 + lucide 图标）
```
不引入 UI 库：界面规模小，自定义 CSS 可控且无包体负担；桌面端用 `max-width` 容器居中即可。

## Risks / Trade-offs

- [Worker 公网可访问且无鉴权，含个人数据] → 本 change 不解决；部署时可先用 Cloudflare Access 免费版挡一层，正式方案留待后续 change
- [D1 relations 查询（任务+步骤）在 drizzle-orm/d1 上需要 `db.query` API] → schema 已定义 relations；若遇边缘问题退化为两次查询 + 手工组装
- [临期/逾期判定在前端，依赖设备时区] → 个人工具单时区使用，接受；判定函数集中一处便于日后挪到服务端
- [重写 main.tsx 会短暂破坏现有素材页] → 素材表单/网格组件先原样迁移进 MaterialsPage 再重构，保持行为不变
- [react-router 与后续 PWA（change ②）的 SW 路由拦截需兼容] → `/api/*` 与页面路由命名空间已分离，SW 只需 NetworkOnly 放行 `/api/*`

## Migration Plan

1. `packages/db/src/schema.ts` 给 `tasks` 加 `deadline: text("deadline")`（可空，无需回填）
2. `pnpm db:generate` 生成迁移 → `pnpm db:migrate:local` 本地验证
3. 后端路由与 shared schema 先行合入（向后兼容，旧前端不受影响）
4. 前端整体切换（一次性替换 main.tsx 为页面化结构）
5. 部署顺序：远程迁移 `db:migrate:remote` → `pnpm deploy`（Worker 同时带新前端资产，无灰度需求）
6. 回滚：代码回退即可；`deadline` 列可空，留在表中不影响旧代码

## Open Questions

- 已归档任务的查看入口放在首页筛选器还是「我的」Tab？暂定首页列表尾部「已归档」折叠组，实现时可微调
- 电商好评步骤是否强制要求佐证（链接或文本二选一）？暂定不强制，允许直接标记完成
