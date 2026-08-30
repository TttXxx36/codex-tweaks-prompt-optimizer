# 2026-08-30 获取模型下拉选项

- Understanding: 修复设置页提示已获取模型，但模型名称下拉入口没有显示这些模型的问题。
- Acceptance criteria: 获取到的模型数组生成真实可见下拉选项；用户选择后回填模型输入和设置状态；自由输入仍可用；模型列表不写入 Provider 配置。
- Decisions: Node RPC 返回结构保持不变；替换不稳定的 `datalist` 主入口为原生 `select`，并保留手动输入框；仅在当前设置页视图内保存已获取列表。
- Diagnosis: 现有 Node `list-models` 已返回 `models` 数组；设置页只创建 `datalist`。根据 HTML 平台文档，`datalist` 是输入建议且存在宿主差异，不能作为明确的可见下拉菜单；因此用户看到数量但无法可靠选择。
- Result: 已新增模型选项清洗函数、真实选择控件和手动输入同步；`tests/renderer.test.mjs` 增加模型选项转换与可见选择控件契约测试。`npm test` 32/32 通过，`npm run check` 通过。已推送到 GitHub，并发布不可变正式 Release [`v0.1.8`](https://github.com/TttXxx36/codex-tweaks-prompt-optimizer/releases/tag/v0.1.8)。Release 指向核心代码提交 `a977c0d6c5ec94d1d50066e2b1906ffdf93383e4`；临时发布工作流随后已删除，远端 `main` 清理提交为 `42b69b4a4a1e4ffc6a542e37926765f0433fec92`。
- Commit: `f860f9f`（模型选择控件修复、测试、README 和工作区记录）。
- Release commits: `f525527` / `71ad6fd`（版本号与运行时 User-Agent 对齐）；GitHub Release: `v0.1.8`。
- Knowledge points (0-5):
  - 模型列表状态 | RPC 返回数组不等于用户可选择 | 必须在设置页显式渲染真实选择控件。
  - 手动与选择输入 | 两个入口必须写入同一个 `state.settings.model` | 输入变化取消选择，选择变化回填输入。
