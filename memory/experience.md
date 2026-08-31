# Pitfall log (Shisan Xinuo Agent Workflow)

> Symptom → root cause → fix → prevention. Search by symptom keyword; on a hit, follow "fix / prevention"; write duplicates in one place and cross-reference.

## 优化按钮消失或位置错误

- Symptom: 按钮只在输入文本后出现，或被插入到发送按钮附近/对话框上方。
- Root cause: Composer 的候选输入元素、Composer 外壳、背景信息窗口和模型选择器是异步且分层挂载的；只在输入值变化时渲染，或把模型选择器直接当作最终锚点，会造成空输入隐藏和按钮落在模型区域上方；背景信息窗口关闭后还可能保留一个不可用的触发节点；直接把按钮插入宿主工具栏还会改变 Codex 自己的布局或被 React 重绘覆盖；固定层若只依赖 CSS 且定位失败仍保持可见，就会退回页面左上角。
- Fix: 将按钮生命周期绑定到 Composer 外壳；在模型选择器之前优先识别已打开的背景信息窗口语义标记，关闭时回退到模型选择器；按钮渲染到插件自己的固定层，运行时强制设置 fixed 定位，按锚点矩形计算左侧坐标和垂直中心；按钮先隐藏，只有取得有效坐标后才显示，并兼容 `x/y` 矩形。
- Prevention: 为空输入、Codex/Work/ChatGPT 三种 Composer、重复注入、节点替换、背景信息窗口打开和关闭、宿主布局隔离、CSS 未加载和无效矩形分别保留 DOM/几何回归用例；禁止把插件按钮插入宿主模型选择器父容器；重排时保留已验证且仍可见的锚点，并忽略与 Composer 无关的命令面板滚动。

## 获取模型成功但设置页下拉为空

- Symptom: Node 返回模型数量且页面显示成功，但用户点击模型输入框时看不到可选模型。
- Root cause: `datalist` 只提供浏览器相关的输入建议，不是稳定的可见菜单；获取到的数组没有绑定到明确的选择控件。
- Fix: 使用真实 `select` 渲染模型选项，同时保留自由输入框；选择项回填同一份设置状态。
- Prevention: 回归测试检查模型数组去重/清洗以及设置源码存在可见选择控件；不要把 `datalist` 当作跨宿主的主要选择 UI。

## Required UI extension 导致宿主启动失败

- Symptom: 日志出现 `Required UI extension unavailable: ui.settingsSections`，Codex 启动卡住并周期性黑屏重载，功能包无法进入 Renderer。
- Root cause: API v3 的 `codexTweaks.ui.settingsSections` 默认 `required` 为 `true`；声明了设置入口但没有明确标记可选时，宿主在调用包 `activate()` 之前就会因当前 UI 适配器缺失而拒绝创建扩展。
- Fix: 当设置页不是包运行必需条件时，在 manifest 中设置 `settingsSections.required: false`；Renderer 继续通过可选链检查 `ui.settingsSections.register`，缺失时跳过设置入口但保留 Composer/Node 功能。
- Prevention: manifest 回归测试必须解析 `package.json` 并断言可降级 UI 扩展为 `required: false`；不要用 Node 权限或私有 DOM bridge 绕过宿主 UI 能力差异。

## Node 运行时版本与包清单漂移

- Symptom: Node 请求的 `User-Agent` 继续报告旧版本，导致日志、Provider 反馈和公开 Release 难以对应。
- Initial root cause: `src/node.js` 维护了独立的 `PACKAGE_VERSION` 硬编码，未从包根目录的 `package.json` 读取版本。
- Initial fix and regression: P0-01 曾使用 `createRequire(import.meta.url)` 读取 `../package.json`；这在普通本地 ESM 文件加载中通过，但在 Codex Tweaks 托管编译/加载路径中，`import.meta.url` 可能不是可用的文件 URL，导致 Node 入口在 `activate()` 之前抛出 `filename ... Received undefined`。
- Current fix: Node `activate` 使用 API v3 提供的 `packageDirectory`，把版本清单读取延迟到运行时，并将读取结果传入请求 User-Agent。目录缺失、非绝对路径或清单异常时使用 `unknown`，不阻断插件启动；有有效宿主目录时仍从该目录的 `package.json` 读取版本。
- Prevention: Node 入口不能把 `import.meta.url` 当作宿主兼容性保证；优先使用宿主明确提供的 `packageDirectory`。回归测试同时覆盖有效包目录、缺失包目录和禁止重新引入危险调用，发布后还必须重新编译/安装实机副本。

## Windows 管理器版本与实机运行副本漂移

- Symptom: Codex Tweaks 管理器显示包源版本已更新且“已激活”，但实机运行副本仍可能保留旧源码或旧运行时常量。
- Root cause: 管理器展示的是包清单/编译记录；ManagedPackages 可能同时保留多个历史副本，且源码更新不会自动替换当前原子编译副本。
- Fix: Windows smoke 同时核对管理器页面、ManagedPackages 当前哈希副本的 `package.json`/入口源码和运行日志；版本或源码不一致时标记为“未部署验证”，不把管理器显示版本当作运行时证据。
- Prevention: 每次 P0-01 或发布后先重新编译/重新注入，再验证实际 User-Agent 或对应运行行为；保留包哈希、编译时间和日志时间线，避免只截图包列表。

## 粘贴后 Composer 锚点漂移的诊断

- Symptom: 用户把内容粘贴进 Composer 后，优化按钮组从 Composer 底部操作区跳到输入框外框左侧。
- Root cause candidate: 宿主可能替换 Composer 或其模型选择器节点；仅凭合成 DOM 已确认旧 `previousAnchor` 可以跨 Composer 复用，但真实宿主的坐标系、变换和候选节点仍需实机证据确认。
- Fix: 增加会话级、默认关闭的临时几何诊断开关，记录 Composer/锚点/模型选择器/按钮的脱敏 `getBoundingClientRect()`、视口、`visualViewport` 和 transform/zoom 元数据；不记录输入文本、Key、地址或请求数据。
- Prevention: 复现时在粘贴前后各保留一组 trace，并同时核对 `composerRect`、`previousAnchorRect`、`modelPickerRect`、`buttonRect`、viewport 和 transform/zoom；自动化 trace 只能缩小根因范围，不能替代真实宿主截图与数据。
