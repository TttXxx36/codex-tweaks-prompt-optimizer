# Session state (Shisan Xinuo Agent Workflow)

- Current goal: 修复 Codex、工作模式和 ChatGPT 模式中优化按钮的常驻显示与模型选择器左侧定位。
- Decisions made: 以用户截图中模型选择器左侧的红框为唯一位置锚点；不改动 API、设置和预览逻辑。
- Constraints: 优化按钮默认显示、空输入也显示、持续显示；需兼容 Composer 重挂载和模式切换。
- Progress + next step: 已完成根因定位、回归修复和全量验证；下一步提交本地回滚点并记录提交哈希。
