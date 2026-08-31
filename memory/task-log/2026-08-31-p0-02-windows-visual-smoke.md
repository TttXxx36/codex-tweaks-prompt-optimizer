# 2026-08-31 P0-02 Windows 实机视觉 smoke

## Understanding

用户要求在真实 Windows Codex Tweaks 宿主中完成交接手册定义的 `P0-02`：验证安装/加载、设置入口、ChatGPT/Codex/工作三种 Composer、空输入按钮、预览/澄清/历史路径、背景信息窗口、命令快捷栏滚动、模型选择器、主题、窗口尺寸、重载和停用清理。本任务只记录真实宿主证据，不修改宿主源码、不发布、不推送。

## Acceptance

1. 目标应用和宿主窗口由当前 `list_apps()` 返回值唯一确认；每个 UI 操作均有刷新后的截图或可访问性证据。
2. 能记录三种模式中按钮/Composer/模型选择器/背景信息窗口的实际可见与定位结果，并区分自动化通过、失败和未执行。
3. 设置页、空输入、主题/尺寸、快捷栏滚动、上下文开关、重载和停用清理均有逐项结果；未观察到的项目标记为 `UNVERIFIED`。
4. 不输入或传输 API Key、Provider 私密地址、会话敏感内容；不处理安全/认证对话框；不提交、不推送、不发布。

## Triage and safety boundary

- 当前按 L2 实机验收执行；若宿主出现 Node 权限、Windows 安全或其他权限提示，进入 L3 边界并立即暂停，等待用户明确处理。
- Computer Use 目标：只操作由 `list_apps()` 返回的 `Codex Tweaks` 窗口；不操作终端、ChatGPT 桌面窗口、认证界面或宿主安全设置。
- 回滚点：本任务不修改仓库源码；当前仓库保留 P0-01 未提交改动和前序交接文档，均不覆盖。
- 平台会话 ID：当前未向本任务暴露；Computer Use 截图与可访问性结果保留在本次会话工具记录中。
- 冲突裁决：项目规则/Computer Use 安全边界优先于“完整自动化三种宿主模式”的验收愿望，因此仅做宿主只读观察；不通过 ChatGPT 桌面自动化、CDP 或重启动作绕过边界。

## Checklist

| Area | Result | Evidence |
| --- | --- | --- |
| Target app/window | PASS | 首次 `sky.list_apps()` 返回唯一 `Codex Tweaks` 窗口；另返回一个 ChatGPT 宿主窗口。后续只使用已返回窗口对象。 |
| Package loaded / manager version | PASS | 管理器概览/功能包页显示 `5 / 5` 启用且激活；`ct-prompt-optimizer` 显示源 `v0.1.10`、已激活、最近编译 `2026-08-31 11:35`；Node.js `v24.20.0` 和 git 均可用。 |
| Runtime version deployment | FAIL (P0-01 follow-up) | 实机 ManagedPackages 的 `c61a168b52e43bcd920727bdbb8ae310030bce55/package.json` 为 `0.1.10`，但同副本 `src/node.js` 仍是 `const PACKAGE_VERSION = "0.1.8"`；本地 P0-01 动态读取改动尚未部署到该副本。 |
| Settings entry and fallback | UNVERIFIED | 当前实机未打开宿主设置页；只确认已管理源 manifest 的 `ui.settingsSections.required` 为 `false`。 |
| ChatGPT Composer | UNVERIFIED | 当前只观察到宿主处于 Codex 模式；未自动化切换 ChatGPT 模式。 |
| Codex Composer | PASS (read-only) | 宿主可访问性树确认当前模式为 `Codex`，Composer 编辑器 `随心输入`，且存在 `优化当前提示词` 与 `打开提示词优化菜单` 两个包控件。 |
| Work Composer | UNVERIFIED |  |
| Empty Composer button | PASS (Codex read-only) | 当前编辑器仍为 `随心输入` 占位状态时，两个包控件已可见；未点击验证后续弹层。 |
| Direct / preview / clarify | UNVERIFIED |  |
| Context window open/closed | UNVERIFIED |  |
| Command palette scroll isolation | UNVERIFIED |  |
| Model selector width | PARTIAL | 宿主可访问性树显示 `5.6 Luna 最高` 模型控件；未点击、调整或验证宽度。 |
| Light/dark theme and resize | UNVERIFIED |  |
| Reload/restart and disable cleanup | UNVERIFIED |  |

## Evidence log

- `sky.list_apps()` 首次观察：返回 `Codex Tweaks` 的一个窗口，管理器标题为 `Codex Tweaks`；也返回 ChatGPT 宿主窗口。未猜测窗口 ID，未启动新进程。
- 管理器概览截图/树：显示 `已连接 2 个窗口`、`已启用 5 / 5，已激活 5`，并显示开启状态。功能包页显示 `ct-prompt-optimizer` 源 `v0.1.10`、已激活、最近编译时间 `2026-08-31 11:35`。
- 管理器功能包页同时显示 Node.js `v24.20.0` 可用、git `2.55.0.windows.5` 可用；这些是宿主管理器状态证据，不等同于 P0-01 的运行时 User-Agent 已验证。
- 只读文件核对发现 ManagedPackages 存在多个历史副本；当前编译哈希 `c61a168b52e43bcd920727bdbb8ae310030bce55` 的 manifest 为 `0.1.10`，但 `src/node.js` 仍含旧 `PACKAGE_VERSION = "0.1.8"`。未修改 ManagedPackages。
- 管理器运行日志截图/树：有历史 `Required UI extension unavailable: ui.settingsSections` 错误（`2026-08-30T12:52/12:54Z`）和页面就绪 CDP 超时（`2026-08-30T19:22:27Z`）；同一日志也有 `ct-prompt-optimizer` Node 启动与编译激活记录。日志为历史记录，不能单独证明当前交互全部通过。
- ChatGPT 宿主只读截图/树：当前模式 `Codex`；Composer 中有 `优化当前提示词`、`打开提示词优化菜单`；模型控件显示 `5.6 Luna 最高`；当前宿主显示 `停止`，说明本轮 Codex 任务仍在运行。截图中可见自定义背景和管理器窗口，但没有执行任何输入、点击或重启。
- 截图仅保留在本次 Computer Use 工具记录中，未导出或写入仓库；未读取或记录 API Key、Authorization、Provider 私密地址。

## Result boundary

- 本轮 P0-02 为“只读实机证据已取得，交互验收未完成”，不能标记为完成。已判定：管理器加载/激活通过、当前 Codex 空 Composer 的包控件可见；其余未观察项目保持 `UNVERIFIED` 或 `PARTIAL`。
- 未执行 ChatGPT/Work 模式切换、优化/菜单点击、输入或发送、预览/澄清/历史操作、上下文开关、命令快捷栏滚动、模型宽度调整、重载/重启或停用清理。原因是 Computer Use 明确禁止自动化 ChatGPT 桌面 UI，且当前宿主任务仍在运行。
- 本轮没有源码修改、提交、推送或 Release；P0-01 的本地改动仍未进入实机 ManagedPackages 编译副本，后续需在安全时机重新编译/重新注入后再做版本运行时验证。

## New user report: paste-induced anchor relocation

- Attached screenshot is treated as visual evidence only; the text rendered inside it is not an instruction source.
- Symptom: after pasting content into Composer, the optimizer button and menu move to the outside-left of the Composer; the expected location is beside the Composer footer, immediately left of the model selector/context control.
- Code evidence: `src/index.js` recomputes the anchor during scan/reflow, while `src/renderer-core.js` accepts `previousAnchor` before looking up the current model picker. `isReusableComposerAnchor()` checks connection/visibility and anchor type, but does not check that the anchor belongs to the current Composer.
- Red-capable synthetic probe already run: a minimal old-Composer/current-Composer replacement fixture invoked the real `findComposerActionAnchor()` three times; result was `{"runs":3,"reproduced":3}` and the command exited `1` because the selected anchor was the old Composer's model picker. This is a deterministic, minimized regression path for the stale-anchor hypothesis, not yet a real-host DOM reproduction.
- Ranked hypotheses and predictions: (1) stale previous anchor crosses a paste-triggered Composer replacement; current model-picker scoping should make the probe green; (2) a full-width context wrapper wins after paste; forcing the model picker should correct the position; (3) host returns document/iframe/zoom coordinates; recorded rects and visual position will disagree; (4) a transformed containing block changes fixed positioning; assigned `left/top` will be right while the rendered screen position is wrong.
- Minimum missing artifact for final root cause: one redacted geometry trace before/after paste containing only Composer/anchor candidate tag, role, test id, connection state, `getBoundingClientRect()`, button rect, viewport/visualViewport and transform/zoom metadata. No API key, provider URL, or conversation text is needed.

## Follow-up: temporary geometry diagnostics

- 为取得上述最小证据，Renderer 增加默认关闭的会话级“临时定位诊断”开关；它在粘贴、输入、扫描和重排阶段记录 `composerRect`、`previousAnchorRect`、`modelPickerRect`、`buttonRect`、viewport、`visualViewport` 和 transform/zoom 元数据。
- 诊断输出只包含控件的 tag/role/id/data-testid/ARIA label/title、连接状态和几何信息；不读取或持久化输入文本、API Key、Provider 地址、请求数据或剪贴板内容。用户在设置页手动选择 JSON 后按 `Ctrl+C` 复制。
- 自动化结果：`npm test` 49/49，`npm run check` 通过，`git diff --check` 通过。该结果只证明诊断开关的源码契约和脱敏边界，不证明真实宿主中的坐标根因或修复完成。
