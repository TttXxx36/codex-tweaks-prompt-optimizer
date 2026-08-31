# 2026-08-31 Composer 三项问题修复发布

## 范围

只修改 `ct-prompt-optimizer`，不修改 Codex 宿主、其他功能包或 Node 权限。

## 修复摘要

- 排除 Composer 瞬态命令/建议浮层，避免优化按钮使用快捷栏内部元素作为锚点并随滚动漂移。
- 支持同一 Composer 的 footer 与 above-Composer portal，避免背景信息控件被漏查；插件不插入或改写宿主组件。
- 将优化器控件 CSS 限定在包根节点，避免影响宿主模型选择器；无 JavaScript 宽度写入。
- 无效或零尺寸锚点不再回退到页面原点。

## 验证

- `npm test`：47/47 通过。
- `npm run check`：通过。
- `git diff --check`：通过。
- 源码扫描确认无宿主 `insertBefore`、模型选择器 `style.width` 或敏感信息日志。
- 实际 Windows Codex 的视觉 smoke 仍需重载功能包后确认。

## 发布

- 版本：`v0.1.10`。
- 发布前基于远端 `main` 集成，避免覆盖远端无共同祖先的历史。
