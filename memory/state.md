# Session state (Shisan Xinuo Agent Workflow)

- Current goal: 修复优化按钮在独立固定层中退回页面左上角的定位回归。
- Decisions made: 保留独立固定层以避免改写宿主工具栏；运行时强制固定定位，按钮只有在获得有效 Composer 锚点坐标后才显示；不改动 Node RPC 和网络协议。
- Constraints: 获取到的全部模型必须可见可选；手动输入仍可用；模型列表只保留当前页面生命周期，不写入 Provider 配置。
- Progress + next step: 已完成左上角回归的失败用例、内联定位保护、无效矩形隐藏和 `x/y` 兼容，并通过 GitHub API 同步到 `main` 提交 `e278c6a`；待用户完成实际 Codex 视觉验收，未创建新 Release。
