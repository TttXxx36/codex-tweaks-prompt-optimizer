# Session state (Shisan Xinuo Agent Workflow)

- Current goal: 维护优化按钮在 Composer 宿主布局和背景信息窗口状态变化下的稳定定位。
- Decisions made: 保留自由输入框，增加真实的 `select` 作为已获取模型的选择入口；不改动 Node RPC 和网络协议。
- Constraints: 获取到的全部模型必须可见可选；手动输入仍可用；模型列表只保留当前页面生命周期，不写入 Provider 配置。
- Progress + next step: 已完成宿主布局隔离、背景信息窗口打开/关闭回退、全量验证，并通过 GitHub API 同步到 `main` 提交 `9bc5e10`；待用户验收实际 Codex 视觉表现，未创建新 Release。
