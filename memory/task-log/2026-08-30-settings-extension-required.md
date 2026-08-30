# 2026-08-30 settingsSections 启动失败修复

- Understanding: 用户反馈启用最新功能包后 Codex 卡在加载界面并周期性黑屏；日志明确报 `Required UI extension unavailable: ui.settingsSections`。
- Acceptance criteria: 在没有 `ui.settingsSections` 适配器的宿主中，功能包不得因设置入口失败而中止；Renderer/Node 仍可正常加载；有适配器时设置页继续注册。
- Triage: L2；涉及 API v3 manifest 的 UI 扩展兼容性和启动失败回退，不改动 Codex 主程序，不触碰 Release。
- Evidence: `codex-tweaks` API v3 开发规范规定 `settingsSections.required` 默认值为 `true`，并示例要求可降级包显式写 `required: false`；本包 manifest 原先缺少该字段，Renderer 本身已经对 `ui.settingsSections.register` 做可选检查。
- Diagnosis: 宿主在调用包 `activate()` 之前创建声明的 UI 扩展；默认 required 导致当前适配器不存在时直接抛错。启动器反复尝试失败包，解释了卡加载和周期性黑屏现象。
- Decision: 将 `codexTweaks.ui.settingsSections.required` 设置为 `false`，并加入 manifest 回归测试；不删除设置入口，不把 Node 权限当作 UI 能力替代。
- Result: 回归测试先失败后通过；`npm test` 40/40 通过；`npm run check` 通过；`git diff --check` 通过。源码与任务记录已通过 GitHub API 同步到 `main` 提交 `e28d0f9`，未创建 Release。
- Rollback point: `24250f4`，本次修改前工作区干净。
