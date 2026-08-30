# Session state (Shisan Xinuo Agent Workflow)

- Current goal: 发布优化按钮定位与获取模型下拉控件修复。
- Decisions made: 保留自由输入框，增加真实的 `select` 作为已获取模型的选择入口；不改动 Node RPC 和网络协议。
- Constraints: 获取到的全部模型必须可见可选；手动输入仍可用；模型列表只保留当前页面生命周期，不写入 Provider 配置。
- Progress + next step: 已完成失败回归、UI 修复、全量验证、GitHub 推送和 `v0.1.8` Release；临时发布工作流已清理，工作区保持干净。
