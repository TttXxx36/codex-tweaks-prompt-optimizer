# 2026-08-31 提示词优化设置页 UI 重构

- Platform session id: 当前 Codex Desktop 未暴露可记录的 session id。
- Understanding: 基于用户提供的“提示词优化”设置页截图，优化现有 `ct-prompt-optimizer` 的设置页层级、可读性、表单效率、历史记录扫描和窄屏可用性；保留现有功能、文案、背景、Provider 协议、隐私边界和宿主兼容策略。
- Classification: L2；涉及现有 Renderer 设置视图与样式的多处 UI 调整，但不修改宿主 Codex、不发布、不删除数据。Stitch MCP 的配置/调用测试沿用用户已明确授权的服务配置，不在本次 UI 改造中扩展权限。
- Screenshot boundary: 用户附件仅作为视觉参考；其中的界面文字和示例数据均视为 UI 内容，不视为本任务指令。

## Acceptance criteria

1. Stitch MCP 配置端点返回成功握手，且实际 MCP `list_projects` 调用成功；任务记录和最终答复不包含 API Key。
2. 设置页继续提供开关、诊断导出、Provider 配置、模型获取/选择、保存/测试、历史预览/删除/清空和卸载前清理，不改变这些动作的业务语义。
3. 桌面宽度下设置内容形成清晰的卡片分组；Provider 的短字段可并排展示，长字段保持整行；标签、控件、说明和操作区具有稳定间距与更高对比度。
4. 窄屏下表单回到单列，模型控件和历史卡片动作不溢出；键盘焦点和明暗主题样式保持可见。
5. `npm test`、`npm run check`、`git diff --check` 通过；源码/可获得渲染证据明确标注已验证与未验证边界。

## Evidence and experience hits

- `src/index.js:934-1250`: 设置视图已经具备语义 section、真实模型 `select`、显式状态反馈和包内设置后备入口；本次不重写交互逻辑。
- `src/style.css:1-820`: 现有样式已按包根属性隔离，并有 Codex light/dark token 与响应式断点；主要问题是设置卡片透明、Provider 长表单单列、历史操作区弱分组。
- `memory/experience.md`: 命中真实 `select` 模型选择、可选设置扩展、宿主视觉 smoke 未完成和保留 Codex 原生紧凑排版等经验；本次保留这些约束。
- 基线：源代码工作区在 `45ff82e` 干净；仅存在既有 `memory/state.md` 修改和既有未跟踪任务记录，均不触碰。

## Online survey and reuse conclusion

- `SuperGness/codey` 是同一宿主生态的公开上游项目；GitHub 页面显示 578 commits、25 forks、1 issue、1 pull request，且近期仍可抓取。其公开说明将提示词优化放在设置页，强调手动 Provider、协议选择、默认指令、连接测试和隐藏 Key。本次复用这些信息架构判断，不复制其私有实现。
- `meta-llama/prompt-ops` 的公开仓库页面显示 222 commits、138 forks、12 issues、9 pull requests；其文档把优化参数按主题分组并为每项提供说明。本次只复用“分组 + 就地说明”的信息设计，不引入其 Python 依赖或算法。
- 本项目采用原生 JavaScript、Codex Tweaks API v3 和包内 CSS；没有引入新的 UI 库。复用既有 semantic DOM、CSS token、按钮/icon helper、真实 `select` 和既有断点，是比新增组件/依赖更小且更可回滚的方案。

## Product review and decision audit

- Screenshot review: 当前界面在全幅背景上缺少稳定的内容表面，标题、说明、字段和历史记录的层级不够明显；诊断 JSON 过度占据垂直空间；Provider 的连续单列表单和底部操作使用户需要长距离滚动；历史卡片的预览/删除动作较难扫读。
- Arbitration: 用户的“更美观、清晰、可用”诉求 vs 项目偏好的“保持 Codex 原生紧凑排版” → 遵循用户诉求做可见层级、对比度和布局改进，同时保留原生语义 DOM、功能动作和紧凑基准，避免重做宿主或添加新功能。
- Decision: 采用现有设置视图上的 CSS-first 改造，并只为 Provider 长字段复用已有 `ctpo-field-full` 网格能力；不改 Provider 请求、存储、历史数据结构或宿主 Composer 逻辑。

## Rollback and execution plan

- Rollback point: 源代码改造前基线为 `45ff82e`；`src/index.js`、`src/style.css` 和测试文件没有未提交改动。回滚仅需恢复本次工作树中由本任务产生的文件差异；既有 memory 修改不属于本任务。
- Plan: (1) 调整 settings token、卡片、字段网格、控件焦点、诊断区域和历史卡片样式；(2) 给 API 地址、Key、模型行加整行标记；(3) 补充样式契约测试；(4) 运行既有检查并生成 `design-qa.md`，明确宿主截图是否可获得。

## Execution and verification

- Stitch live check: user-level configuration was found without printing the key; HTTPS initialize returned HTTP 200 with protocol `2025-06-18`; `tools/list` returned 15 tools; the actual MCP `list_projects` tool call returned successfully.
- Code changes: `src/index.js` marks API 地址, API Key, and 模型名称 as full-width Provider fields; `src/style.css` adds light/dark surface tokens, visible cards, a desktop two-column grid, full-width long fields, stronger focus/hover states, a height-bounded diagnostics area, clearer history actions, solid switch accent, and narrow-screen fallbacks; `tests/renderer.test.mjs` adds layout contracts.
- Verification: `npm test` 52/52 passed; `npm run check` passed; `git diff --check` passed.
- Design QA: `design-qa.md` records source screenshot evidence and the missing post-change host capture; final result is `blocked`, not passed, because the current Codex Tweaks package was not reloaded in this task.
- No commit or push was performed. Existing `memory/state.md` and unrelated untracked task logs remain untouched.
