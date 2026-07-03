## ADDED Requirements

### Requirement: 底部 Tab 导航
应用 SHALL 提供固定在底部的 5 个 Tab：首页、生成、AI、素材、我的。Tab 栏 SHALL 在所有一级页面保持可见，当前所在 Tab SHALL 有高亮标识。

#### Scenario: 切换 Tab
- **WHEN** 用户点击底部任意 Tab
- **THEN** 应用导航到对应页面，且该 Tab 呈现高亮态，其余 Tab 恢复常态

#### Scenario: 二级页面隐藏 Tab 栏
- **WHEN** 用户进入任务详情、新建/编辑任务等二级页面
- **THEN** 页面顶部提供返回入口，返回后回到来源 Tab 页面

### Requirement: 未实现 Tab 的占位页
本阶段未实现的 Tab（生成、AI、我的）SHALL 显示占位页，说明该功能即将上线，不得出现空白或报错页面。

#### Scenario: 访问占位 Tab
- **WHEN** 用户点击「生成」「AI」或「我的」Tab
- **THEN** 页面显示该功能名称与「即将上线」提示

### Requirement: 页面可通过 URL 寻址
每个 Tab 页面与任务详情页 SHALL 拥有独立 URL；刷新浏览器 SHALL 停留在当前页面。

#### Scenario: 刷新任务详情页
- **WHEN** 用户在 `/tasks/:id` 页面刷新浏览器
- **THEN** 页面重新加载后仍显示该任务的详情

### Requirement: 移动优先布局
界面 SHALL 以移动端单列布局为基准设计；在桌面宽屏下内容 SHALL 以最大宽度容器居中呈现，不得出现横向滚动。

#### Scenario: 手机端浏览
- **WHEN** 用户以 390px 宽度视口打开任意页面
- **THEN** 内容单列排布，无横向滚动条，可交互元素满足触控尺寸
