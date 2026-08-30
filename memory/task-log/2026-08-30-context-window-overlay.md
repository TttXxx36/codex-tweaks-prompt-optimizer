# 2026-08-30 Composer 锚点固定层修复

- Understanding: 截图显示“优化”按钮仍在 `5.6 Luna` 上方，且背景信息窗口打开后没有出现在 Composer；需要分析并同时修复两项问题。本次已获授权推送到 GitHub，但不发布 Release。
- Acceptance criteria: 插件不再把按钮插入宿主 Composer 子树；按钮位于打开的背景信息窗口左侧，背景信息窗口关闭或不存在时位于模型选择器左侧；按钮与锚点垂直居中；滚动、缩放、重挂载和关闭状态变化后仍能重新定位；宿主背景信息窗口不因插件注入而被挤出或覆盖。
- Triage: L2；涉及 Renderer 定位、独立覆盖层、几何计算、生命周期监听和回归测试，变更可逆，不触碰外部发布。
- Hypotheses: ①模型选择器父容器是纵向布局，直接插入导致按钮显示在上方；②插件直接改写 Codex React 管理的工具栏，改变布局或被重绘覆盖背景信息窗口；③背景信息窗口的实际节点没有现有语义标记，需补充 data/class 候选扫描。以上假设通过代码结构和截图逐项验证，最终采用独立固定层并保留语义回退。
- Diagnosis: 旧代码在 `placeComposerButton` 中调用 `anchor.parentElement.insertBefore(entry.button, anchor)`，这会把插件按钮放入宿主布局；而且只按锚点元素本身插入，没有计算按钮相对锚点的几何位置。
- Decision: 新增插件自有 `ctpo-composer-button-host` 固定层；新增 `getComposerButtonPosition` 计算左侧坐标和垂直中心；`placeComposerButton` 只挂载到插件层，`reflowComposerButtons` 在滚动、缩放及锚点状态变化时同步；继续使用背景信息窗口打开优先、模型选择器降级的规则。
- Result: 新增回归测试先失败后通过；覆盖不改写宿主工具栏、左侧/垂直居中几何、背景信息窗口关闭回退；`npm test` 37/37 通过；`npm run check` 通过；`git diff --check` 通过。代码已通过 GitHub API 同步到 `main` 提交 `9bc5e10ddb97144ac2e2e1159da786bd5ca202a7`；未创建新 Release。
- Rollback point: `8b77ddd`，本次修改前工作区干净。
