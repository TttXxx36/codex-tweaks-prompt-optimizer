# 2026-08-31 Node 入口 `filename` 启动错误修复

## 范围

用户在公开 `v0.1.11` 中看到功能包“运行失败”，错误为：

`The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined`

本任务只处理 Node 入口启动回归；不修改 Composer 锚点、粘贴定位、设置页、Provider 协议或宿主 Codex。

## 验收标准

1. Node 入口模块加载阶段不再依赖可能不存在的 `import.meta.url`。
2. 宿主提供有效 `packageDirectory` 时，Provider User-Agent 仍使用该包 `package.json` 的版本。
3. 宿主未提供包目录或清单读取失败时，Node 运行时仍可激活；版本标识仅降级为 `unknown`。
4. 自动化测试、语法检查和 Git 空白检查通过。
5. 不推送、不创建 Release，不修改未跟踪的模型选择器诊断记录。

## 根因诊断

### 复现与证据

- 用户截图显示源版本为 `v0.1.11`，管理器状态为“运行失败”，错误文本与 Node 参数校验完全一致。
- 发布前的 `src/node.js` 在模块顶层执行 `createRequire(import.meta.url)("../package.json")`。
- 最小探针对 `createRequire(undefined)` 连续 3 次复现同一错误；普通本地 ESM 文件加载时 `import.meta.url` 是有效文件 URL，因此本地测试无法覆盖宿主托管加载器的差异。
- Node 官方文档要求 `module.createRequire(filename)` 的参数必须是文件 URL 或绝对路径；官方 Codex Tweaks API v3 开发说明为 Node `activate` 提供 `packageDirectory`，并建议用它检查包自身文件。

参考：[Node `module.createRequire`](https://nodejs.org/api/module.html#modulecreaterequirefilename)、[Node `import.meta.url`](https://nodejs.org/api/esm.html#importmetaurl)、[Codex Tweaks API v3 package skill](https://github.com/codex-tweaks/codex-tweaks/blob/main/Skills/develop-codex-tweaks-package/SKILL.md)。

### 根本原因

P0-01 为消除硬编码版本而引入的 `createRequire(import.meta.url)` 假定 Node 入口始终以普通文件型 ESM 运行。Codex Tweaks 会编译/托管加载功能包，入口的 `import.meta.url` 不是该包可依赖的宿主契约；在用户的 v0.1.11 运行路径中它为 `undefined`。该表达式位于模块初始化阶段，所以异常发生在 `activate()`、RPC 注册、数据目录读取和 Provider 请求之前。

因此，当前错误不是 API Key、Provider 地址、Composer 内容或 `dataDirectory` 造成的，而是版本读取方式本身造成的启动阻断。

## 候选假设与裁决

| 假设 | 预测 | 结果 |
| --- | --- | --- |
| `createRequire(import.meta.url)` 收到 `undefined` | 精确出现当前 `filename ... Received undefined`，且在 `activate()` 前失败 | **确认，最高可能** |
| 宿主提供非文件型虚拟 URL | 应更可能出现非文件 URL/模块解析错误，而非 `undefined` | 未作为主因，修复同时移除该假设依赖 |
| 包清单丢失 | 更可能出现 `MODULE_NOT_FOUND` 或 `ENOENT` | 与当前错误不符 |
| Provider/数据目录路径为空 | 应在激活或请求阶段报数据目录/网络错误 | 与当前启动时机不符 |

## 实施

- 删除 `src/node.js` 对 `node:module` `createRequire` 的导入和模块顶层版本读取。
- `activate({ packageDirectory, dataDirectory, ... })` 接收宿主 API v3 上下文中的包目录。
- `createNodeRuntime` 启动时异步读取 `path.join(packageDirectory, "package.json")`；版本 Promise 在发起请求时解析并传给 User-Agent。
- 对缺失、非绝对目录、读取错误、JSON 错误或无版本字段使用 `unknown`，不让版本诊断信息阻断功能包启动。
- 测试辅助函数显式传入仓库包目录，继续验证 User-Agent 与 manifest 版本相等；新增缺失目录的 fail-open 测试和源码契约测试。

## 验证

- `npm test`：51/51 通过（Node 18 项、Renderer 33 项）。
- `npm run check`：通过。
- `git diff --check`：通过。
- 当前工作区仍保留未跟踪的 `memory/task-log/2026-08-31-model-selector-width-diagnosis.md`，未读取修改内容、未纳入本任务。
- 尚未重新编译/安装到 Windows ManagedPackages；尚未证明宿主实机已恢复，因此实机状态保持 **【待部署验证】**。
- 公开 `v0.1.11` 仍指向修复前提交；本地修复尚未提交、推送或发布。

## 后续

1. 用当前工作树在 Codex Tweaks 中重新编译并授权/激活 Node，确认日志不再出现该错误。
2. 在实机确认一次模型列表或连接测试请求的 User-Agent 版本为 `0.1.11`。
3. 只有实机通过后，另行确认补丁版本号并执行提交、推送和 Release 流程。
