# 2026-08-30 包内设置后备面板

- Understanding: 只修改 `ct-prompt-optimizer`；保留可选原生设置页注册，并在宿主设置适配器不可用时，通过 Composer 的“优化”菜单打开包内完整设置面板。
- Scope: `src/index.js`、`src/style.css` 与针对该行为的回归测试；不修改 Codex Tweaks 宿主、不修改 Node 配置协议、不推送或发布。
- Acceptance criteria:
  1. 原生设置注册存在且可用时，“提示词优化设置”优先调用原生页面。
  2. 原生注册缺失或无法打开时，完整设置表单在居中可关闭的包内面板呈现。
  3. Composer 主按钮保持优化/取消语义；菜单可进入设置与历史，不改变宿主 Composer DOM。
  4. 停用、页面重挂载和 Escape 均清理菜单、面板与监听器。
  5. `npm test`、`npm run check`、`git diff --check` 通过。
- Decision: 采用与 custom-background 相同的 optional settingsSections 兼容策略；`required:true` 在适配器不可用时会阻止包的 `activate`，无法实现纯包后备。
- Rollback point: clean local commit `8026ede` before edits.
- Result: added a split Composer control with a settings/history menu, a centered package-owned settings dialog, native `settingsRegistration.open()` preference, Escape/backdrop/outside-menu cleanup, and first-layout group measurement that keeps both controls left of the semantic Composer anchor.
- Verification: `npm test` 41/41 passed; `npm run check` passed; `git diff --check` passed. Codex Tweaks visual smoke is not run because the package is currently disabled locally and this task did not authorize installation or changing the user's active package state.
