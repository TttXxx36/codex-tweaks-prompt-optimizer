# Session state (Shisan Xinuo Agent Workflow)

- Current goal: 为 `ct-prompt-optimizer` 维护一份可供新会话接续的完整开发交接手册和后续任务清单。
- Decisions made: 手册以当前本地源码、Git `main`、远端公开 Release 和项目任务记录为证据；`src/node.js` 从 `package.json` 读取唯一运行时版本；不把未经 Windows/macOS 实机验证的视觉结果写成已完成；临时定位诊断默认关闭、仅保存在会话内且不记录输入内容；用户已确认按 `v0.1.11` 创建 GitHub Release；不修改宿主 Codex。
- Constraints: 不记录 API Key、Authorization、用户 Provider 私密地址；保留现有分支和未相关的用户修改；无 CI 和宿主视觉证据不足仍记录为技术债务或待补充项。
- Progress + next step: `P0-01` 源码与回归测试已完成，自动测试 49/49；P0-02 已取得 Windows 管理器和当前 Codex Composer 的只读证据，但三模式交互、重载/停用清理仍未验收。用户新增报告：粘贴后优化按钮/菜单跳到 Composer 外框左侧；合成探针已确认旧锚点可跨 Composer 复用，源码已加入临时几何诊断开关，真实宿主 DOM 路径仍待 trace。`package.json`/README 已准备升级到 `0.1.11`，待完成发布前验证、推送和 Release 创建。实机 ManagedPackages 的 `c61a168…` 副本仍保留旧 `0.1.8` 运行时常量，需重新编译/注入后验证；未跟踪的模型选择器诊断记录保留在本地，不纳入本次发布。
