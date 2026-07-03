# Tasks: redesign-core-tasks

> 实施说明：实际落地时按用户提供的 5 张 UI 设计图还原界面，技术栈按 /tech-stack-selection 决议调整为 Tailwind v4 + shadcn + Vitest；并超出本 change 范围一并实现了 AI 创建（原 change ③）与好评生成 + 返现统计（原 change ④）。偏离点在各任务行内标注。

## 1. 数据层与共享 Schema

- [x] 1.1 `packages/db/src/schema.ts` 的 `tasks` 表新增可空 `deadline` text 列，运行 `pnpm db:generate` 生成迁移并 `pnpm db:migrate:local` 本地验证（额外：`task_steps` 加 `requirement` 列存 AI 抽取的每平台要求）
- [x] 1.2 `packages/shared` 扩展 Zod schema：`createTaskSchema` 加 `deadline`；新增 `updateTaskSchema`、`completeStepSchema`、`addStepSchema`（额外：`generateReviewSchema`、`aiExtractInputSchema`、平台/风格枚举）
- [x] 1.3 删除 `apps/web/src/main.tsx` 中手写的类型，web 端类型集中在 `src/api/types.ts`，输入类型从 shared 引

## 2. 后端路由补齐（apps/worker）

- [x] 2.1 `GET /api/tasks/:id`：返回任务详情含全部步骤（db.query relations）
- [x] 2.2 `PATCH /api/tasks/:id`：编辑字段，更新 `updatedAt`
- [x] 2.3 `POST /api/tasks/:id/archive` 与 `/unarchive`
- [x] 2.4 complete 接口改用 `zValidator` + `completeStepSchema`，笔记/帖子步骤无合法 URL 返回 400
- [x] 2.5 `POST /api/tasks/:id/steps/:stepId/undo`：回退待办、清佐证，任务回退 active
- [x] 2.6 步骤追加与删除（pending 才可删，已完成返回 400）
- [x] 2.7 服务端统一 `recomputeTaskStatus`：complete/undo/删除后重算（偏离：未用 db.batch，D1 顺序执行已满足个人规模一致性需求）
- [x] 2.8 链式路由保持，`AppType` 覆盖全部路由，typecheck 通过

## 3. 前端框架（app-shell）

- [x] 3.1 react-router + `layout/AppShell.tsx`：底部 Tab（偏离：按用户决定改为 任务/素材库/中央 AI 按钮/生成/我的），二级页面隐藏 Tab 栏
- [x] 3.2 API 层 `api/client.ts`（偏离设计 D2：改为类型化 fetch + TanStack Query hooks，不用 hc<AppType>，避免 workers-types 泄漏进 web tsc）
- [x] 3.3 占位页（偏离：生成页直接做成了真功能，仅 PWA/推送留待 change ②）
- [x] 3.4 移动优先样式基线（偏离设计 D6：改为 Tailwind v4 + shadcn 主题 token，不再手写 CSS 设计系统）

## 4. 任务功能页面（task-management + task-steps）

- [x] 4.1 `TaskFormPage` 新建/编辑复用：全字段 + 四步骤开关（返现默认开）、标题必填、日期选择
- [x] 4.2 `HomePage`：进行中/已完成分组、卡片按设计图（商家行/标题/步骤 chips/进度条/截止日期）、完成置灰删除线、逾期红色置顶、临期次优先
- [x] 4.3 首页关键字搜索（标题/商家/商品）；已归档列表与恢复（偏离：入口放「我的」页而非首页折叠组）
- [x] 4.4 `TaskDetailPage`：商家规则四格摘要卡（可折叠+注意事项展开）、步骤时间线
- [x] 4.5 步骤操作：填链接（前后端双校验）、好评可选佐证、返现一键确认、撤销、增删步骤、底部「保存进度」批量提交
- [x] 4.6 完成最后一步自动完成，Query 失效刷新分组
- [x] 4.7 详情页编辑/归档入口

## 5. 素材页迁移（material-management）

- [x] 5.1 素材功能迁入 `MaterialsPage`（按设计图重构：日期分组网格、拍照上传卡、底部上传 Sheet）
- [x] 5.2 类型筛选 chips（全部/文案/宠物图片/评论图）+ 搜索

## 6. 验收与收尾

- [x] 6.1 `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`（27 个测试）全部通过
- [x] 6.2 冒烟验收：wrangler dev 下任务创建/详情/AI 抽取/好评生成全链路 curl 验证通过（UI 手工验收留给用户在真机确认）
- [x] 6.3 更新 CLAUDE.md（技术栈/路由/测试/AI 网关小节）

## 7. 超范围实现（原 change ③④，随设计图一并落地）

- [x] 7.1 `POST /api/ai/extract-task`：OpenAI 兼容网关 + JSON 模式 + Zod 校验重试，落 `ai_extraction_logs`
- [x] 7.2 `AiCreatePage`：粘贴规则 → 识别结果预填表单（置信度/存疑 notes/每平台要求可编辑）→ 确认创建
- [x] 7.3 `POST /api/ai/generate-review` + `GeneratePage`：选任务/选素材/平台/风格/字数滑杆/复制文案
- [x] 7.4 返现统计（我的页：累计/本月/待回款，前端聚合）
