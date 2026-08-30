# 2026-08-30 优化按钮左上角回归修复

- Understanding: 用户反馈最新版本的“优化”按钮跑到 Codex 页面左上角，不在 Composer 内；需要重新检查上一版固定层实现。
- Acceptance criteria: 按钮不得在无坐标时显示于页面原点；有效时固定在打开的背景信息窗口左侧，关闭或不存在时固定在模型选择器左侧并垂直居中；不改写宿主 Composer；定位失败时保持隐藏。
- Triage: L2；涉及 Renderer 固定层时序、DOMRect 兼容和回归测试，变更可逆，不触碰 Release。
- Diagnosis: 上一版固定层的 `position` 只写在 CSS 中，且 `placeComposerButton` 未处理定位失败的可见按钮；在宿主样式隔离或矩形读取异常时，按钮以固定层默认位置渲染为左上角。
- Decision: 对固定层和按钮补充运行时 `position: fixed`、点击层级和 z-index；优化按钮初始 `hidden`，定位失败继续隐藏；`getComposerButtonPosition` 对标准 `left/top` 和 host shim 的 `x/y` 都取值；增加无效矩形不返回原点的测试。
- Result: 先加入 2 个失败回归用例，再完成修复；`npm test` 39/39 通过；`npm run check` 和 `git diff --check` 通过。当前尚未提交或推送。
- Rollback point: `b9fafee`，本次修改前工作区干净。
