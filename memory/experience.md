# Pitfall log (Shisan Xinuo Agent Workflow)

> Symptom → root cause → fix → prevention. Search by symptom keyword; on a hit, follow "fix / prevention"; write duplicates in one place and cross-reference.

## 优化按钮消失或位置错误

- Symptom: 按钮只在输入文本后出现，或被插入到发送按钮附近/对话框上方。
- Root cause: Composer 的候选输入元素、Composer 外壳、背景信息窗口和模型选择器是异步且分层挂载的；只在输入值变化时渲染，或把模型选择器直接当作最终锚点，会造成空输入隐藏和按钮落在模型区域上方；背景信息窗口关闭后还可能保留一个不可用的触发节点；直接把按钮插入宿主工具栏还会改变 Codex 自己的布局或被 React 重绘覆盖；固定层若只依赖 CSS 且定位失败仍保持可见，就会退回页面左上角。
- Fix: 将按钮生命周期绑定到 Composer 外壳；在模型选择器之前优先识别已打开的背景信息窗口语义标记，关闭时回退到模型选择器；按钮渲染到插件自己的固定层，运行时强制设置 fixed 定位，按锚点矩形计算左侧坐标和垂直中心；按钮先隐藏，只有取得有效坐标后才显示，并兼容 `x/y` 矩形。
- Prevention: 为空输入、Codex/Work/ChatGPT 三种 Composer、重复注入、节点替换、背景信息窗口打开和关闭、宿主布局隔离、CSS 未加载和无效矩形分别保留 DOM/几何回归用例；禁止把插件按钮插入宿主模型选择器父容器。

## 获取模型成功但设置页下拉为空

- Symptom: Node 返回模型数量且页面显示成功，但用户点击模型输入框时看不到可选模型。
- Root cause: `datalist` 只提供浏览器相关的输入建议，不是稳定的可见菜单；获取到的数组没有绑定到明确的选择控件。
- Fix: 使用真实 `select` 渲染模型选项，同时保留自由输入框；选择项回填同一份设置状态。
- Prevention: 回归测试检查模型数组去重/清洗以及设置源码存在可见选择控件；不要把 `datalist` 当作跨宿主的主要选择 UI。

## Required UI extension 导致宿主启动失败

- Symptom: 日志出现 `Required UI extension unavailable: ui.settingsSections`，Codex 启动卡住并周期性黑屏重载，功能包无法进入 Renderer。
- Root cause: 第一层是 API v3 的 `codexTweaks.ui.settingsSections` 默认 `required` 为 `true`；未明确标记可选时，宿主会在调用包 `activate()` 前拒绝创建扩展。第二层是宿主运行时缺陷：它每 2 秒轮询，并在设置模块适配失败时，即便所有声明都为可选，仍以“存在 settings section”为条件判定运行时未就绪，因而反复清理和注入整个 Codex 页面。
- Fix: 包 manifest 保留 `settingsSections.required: false`，避免第一层错误；根治需在 Codex Tweaks 宿主中区分“存在设置页”和“设置页为必需”，只有任一声明为必需时才要求 `settingsAdapterReady`，可选设置页适配失败后不得触发重复注入。
- Prevention: manifest 回归测试必须解析 `package.json` 并断言可降级 UI 扩展为 `required: false`；宿主注入测试必须覆盖“适配器不可用 + 全部 optional”并断言第二次轮询为 unchanged；不要用 Node 权限或私有 DOM bridge 绕过宿主 UI 能力差异。
