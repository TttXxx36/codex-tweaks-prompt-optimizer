# 2026-08-30 Codex 启动循环宿主诊断

- Understanding: 用户反馈 `required:false` 后 Codex 仍无法启动并周期性黑屏，要求重新找根因，只有证实原修复错误才回退。
- Acceptance criteria: 区分旧的 required 扩展错误与当前循环；验证实际安装构建；提出不会重引入旧错误的根治路径。
- Triage: L2 诊断；实际修改 Codex Tweaks 宿主、重新构建或向上游发布将是 L3 架构/外部协作，须另行确认。
- Evidence: 实际锁文件指向 `914932d`，active build `9110ad...` 的 `settingsSections.required` 为 false；旧日志含 5 次 `Required UI extension unavailable`，active build 时间之后为 0 次。上游 `controller.monitor` 每 2 秒调用 `Refresh`；注入 probe 对任意 settings sections 强制要求 `settingsAdapterReady`；当前 Codex 设置模块无法适配时，optional 声明因此仍会反复全量注入。
- Differential: 旧未标记 optional 的构建为红；新 active build 对旧错误为绿。`ct-custom-background` 也声明 optional settings，证明循环不是提示词包单独造成。
- Decision: 不回退 `required:false`。根治是给宿主的 settings adapter 配置添加 required 聚合语义，并在全 optional + adapter 不可用时让 probe 视为 unchanged；保留首次适配尝试和 required 扩展的失败语义。
- Status: 已完成根因分析，未修改宿主或发布任何新包，等待用户确认宿主级修复范围。
