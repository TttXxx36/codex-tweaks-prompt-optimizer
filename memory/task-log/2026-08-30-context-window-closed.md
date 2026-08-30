# 2026-08-30 背景信息窗口关闭时回退模型选择器

- Understanding: 背景信息窗口关闭时，不再把该不可用组件作为“优化”按钮锚点；按钮应改放到 `5.6 Luna` 左侧。未授权推送或发布。
- Acceptance criteria: 背景信息窗口打开时仍优先锚定其左侧；关闭状态用 `aria-expanded=false`、`data-state=closed` 或 `data-open=false` 表示时，锚点回退到模型选择器；无模型选择器时保留发送按钮降级；自动测试、语法检查和 diff 检查通过。
- Triage: L2；修改 Renderer 锚点判断和回归测试，变更可逆，不触碰外部发布。
- Diagnosis: 新增回归用例后，旧代码在关闭背景信息窗口时仍返回该窗口，测试 34 通过、1 失败；根因是只检查语义名称，不检查关闭状态。
- Decision: 在 `contextWindowScore` 中复用可见性判断，并过滤 `aria-expanded=false`、`data-open=false`、`data-state=closed/collapsed/hidden`；未关闭时保持背景信息窗口优先级，关闭后自然执行模型选择器回退。
- Result: 回归用例先红后绿，覆盖三种关闭标记；MutationObserver 同时观察关闭/可见性属性，确保关闭后立即重新锚定；`npm test` 35/35 通过；`npm run check` 通过；`git diff --check` 通过。代码已推送到 GitHub `main` 提交 `b850537eed4c033f0ded483e1124f4a92ee27a92`；未创建新 Release。
- Rollback point: `00d7834`，本次修改前工作区干净。
