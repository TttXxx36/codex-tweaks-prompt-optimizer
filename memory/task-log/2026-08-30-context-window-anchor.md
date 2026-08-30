# 2026-08-30 背景信息窗口左侧锚定

- Understanding: 将 Composer 中“优化”按钮从 `5.6 Luna` 上方移动到背景信息窗口左侧，并在同一水平方向垂直居中；未授权本次推送或发布。
- Acceptance criteria: 存在背景信息窗口和模型选择器时，动作锚点必须返回背景信息窗口；按钮保持在锚点父容器左侧；无背景信息窗口时保留模型选择器/发送按钮降级行为；空输入仍可见；自动测试、语法检查和 diff 检查通过。
- Triage: L2；涉及 Renderer 定位逻辑、样式和回归测试，但改动可逆且不触碰外部发布。
- Diagnosis: 先加入回归用例，旧实现返回 `5.6 Luna` 模型选择器，测试 32 通过、1 失败；根因是动作锚点只考虑模型选择器，没有识别 Composer 内固定的背景信息窗口。
- Online/reuse survey: 检查 `codex-tweaks/codex-tweaks-custom-background` 参考包；其范围是设置页视觉样式，不提供 Composer 锚点实现，因此保留本包现有原生 DOM 方案，仅适配语义标记。
- Decision: 新增轻量 `contextWindowScore`/`findComposerContextWindow`，按 `context`、`上下文`、`背景信息` 等可访问名称、title、test id 或类名识别候选；背景信息窗口优先，模型选择器和发送按钮后备。新增 `align-self: center`、`flex: 0 0 auto`、`vertical-align: middle`，不强行改写宿主父容器布局。
- Result: 回归用例已转绿；`npm test` 34/34 通过；`npm run check` 通过；`git diff --check` 通过。尚未提交或推送。
- Rollback point: `357844d`，修改前工作区干净。
