# Pitfall log (Shisan Xinuo Agent Workflow)

> Symptom → root cause → fix → prevention. Search by symptom keyword; on a hit, follow "fix / prevention"; write duplicates in one place and cross-reference.

## 优化按钮消失或位置错误

- Symptom: 按钮只在输入文本后出现，或被插入到发送按钮附近/对话框上方。
- Root cause: Composer 的候选输入元素、Composer 外壳和模型选择器是异步且分层挂载的；只在输入值变化时渲染，或把最近父节点误当作按钮锚点，会造成空输入隐藏和错误位置。
- Fix: 将按钮生命周期绑定到 Composer 外壳，而不是输入值；通过语义模型选择器定位，并在模型选择器晚加载、模式切换和重挂载时重新锚定。
- Prevention: 为空输入、Codex/Work/ChatGPT 三种 Composer、重复注入、节点替换分别保留 DOM 回归用例；禁止使用发送按钮作为模型选择器存在时的首选锚点。
