# Pitfall log (Shisan Xinuo Agent Workflow)

> Symptom → root cause → fix → prevention. Search by symptom keyword; on a hit, follow "fix / prevention"; write duplicates in one place and cross-reference.

## 优化按钮消失或位置错误

- Symptom: 按钮只在输入文本后出现，或被插入到发送按钮附近/对话框上方。
- Root cause: Composer 的候选输入元素、Composer 外壳、背景信息窗口和模型选择器是异步且分层挂载的；只在输入值变化时渲染，或把模型选择器直接当作最终锚点，会造成空输入隐藏和按钮落在模型区域上方；背景信息窗口关闭后还可能保留一个不可用的触发节点。
- Fix: 将按钮生命周期绑定到 Composer 外壳；在模型选择器之前优先识别已打开的背景信息窗口语义标记，并插入其父容器左侧；检测 `aria-expanded=false`、`data-open=false` 和 `data-state=closed/collapsed/hidden` 后，回退到模型选择器；按钮自身保持同一行垂直居中。
- Prevention: 为空输入、Codex/Work/ChatGPT 三种 Composer、重复注入、节点替换、背景信息窗口打开和关闭分别保留 DOM 回归用例；禁止使用发送按钮作为模型选择器或背景信息窗口存在时的首选锚点。

## 获取模型成功但设置页下拉为空

- Symptom: Node 返回模型数量且页面显示成功，但用户点击模型输入框时看不到可选模型。
- Root cause: `datalist` 只提供浏览器相关的输入建议，不是稳定的可见菜单；获取到的数组没有绑定到明确的选择控件。
- Fix: 使用真实 `select` 渲染模型选项，同时保留自由输入框；选择项回填同一份设置状态。
- Prevention: 回归测试检查模型数组去重/清洗以及设置源码存在可见选择控件；不要把 `datalist` 当作跨宿主的主要选择 UI。
