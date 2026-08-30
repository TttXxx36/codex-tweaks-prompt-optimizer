# 2026-08-30 Composer 优化按钮显示与定位

- Understanding: 修复优化按钮在 Codex/工作模式空输入时隐藏，以及新对话中没有位于模型选择器左侧的问题。范围限定为 Renderer 的按钮发现、插入和生命周期；不改动网络协议、设置或预览功能。
- Acceptance criteria: 空输入时按钮可见；Codex、工作和 ChatGPT Composer 均可见；按钮位于模型选择器左侧；模型选择器晚加载后仍能重新定位；输入框替换、导航、重复注入和停用不会残留或重复。
- Decisions: 以截图红框对应的模型选择器左侧为位置锚点；先建立失败回归再修复；版本发布前需保留本地回滚提交。
- Result: 已完成本地修复。通过模型控件身份评分排除项目选择器，并覆盖版本号、Luna、GPT 和 Auto 等模型标识；空输入及 home/work/chatgpt 三种 Composer 回归均通过。`npm test` 30/30 通过，`npm run check` 通过，`git diff --check` 通过。尚未发布到 GitHub。
- Knowledge points (0-5):
  - Composer 空输入 | 显示逻辑不应依赖输入值 | 绑定 Composer 生命周期并用 DOM 回归验证。
  - 模型选择器误判 | `role=combobox` 不是充分身份 | 必须结合模型文本/版本/测试 ID 评分并排除项目、工作区和仓库选择器。
