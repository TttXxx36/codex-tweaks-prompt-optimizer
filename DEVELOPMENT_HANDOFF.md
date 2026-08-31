# `codex-tweaks-prompt-optimizer` 项目开发交接手册

> 文档版本：2026-08-31
>
> 适用仓库：<https://github.com/TttXxx36/codex-tweaks-prompt-optimizer>
>
> 当前公开版本：`v0.1.11`（公开 Release 对应 `0881163a7cd378e94e6417e9259f8a577aed1c33`；开发分支的后续提交以第 5 节和任务记录为准）

## 使用说明与事实边界

本手册用于让新会话的 AI 在不回看历史对话的情况下继续维护本项目。内容优先依据以下证据整理：

1. 当前本地工作区的源码、测试、`package.json` 和 Git 历史。
2. GitHub 仓库 `main`、标签和 Release 的当前公开状态。
3. 项目内 `memory/task-log/`、`memory/experience.md` 和 `memory/preferences.md` 中的开发记录。

无法从上述证据确认的内容使用 **【待补充：说明缺失信息】** 标记，不以推测替代事实。尤其要注意：自动化测试通过不等于 Windows Codex 实机视觉 smoke 已完成；当前 Windows 和 macOS 的完整视觉验收状态见[当前代码库状态](#5-当前代码库状态)和[已知风险](#已知风险)。

本手册初版生成时只新增文档和本地任务记录，未执行 GitHub 推送或 Release。之后用户确认将 P0-01、P0-02 诊断开关及相关测试作为一个变更集推送到 `origin/main`；本轮不创建新的 Release。

## 1. 项目概述

### 1.1 项目名称与目标

- 源码目录与公开仓库名称：`codex-tweaks-prompt-optimizer`
- Codex Tweaks 稳定包 ID：`ct-prompt-optimizer`
- 许可证：MIT
- GitHub Topic：`codex-tweaks-package`
- 目标：为 Codex Tweaks 宿主提供一个第三方提示词优化功能包，在当前 Composer 旁提供“优化”入口，并支持直接替换、预览后应用、多轮澄清三种工作流。
- 首发版本：`v0.1.0`
- 当前公开版本：`v0.1.11`

本包参考 [Codey](https://github.com/SuperGness/codey) 的可见产品行为，包括优化设置、模型配置、输入框入口和结果替换流程；不复制 Codey 源码，不依赖 Codey 的私有 bridge、OAuth、路由或会话上下文。

### 1.2 核心功能模块

| 模块 | 当前职责 |
| --- | --- |
| Composer 入口 | 识别 Codex/ChatGPT/工作模式中的当前 Composer，在稳定的 Composer 操作区附近显示“优化”按钮。 |
| 普通优化 | 只发送当前提示词和用户保存的默认优化指令，返回可直接使用的提示词。 |
| 预览面板 | 展示原始提示词和可编辑的优化结果，支持应用、复制、拖动和调整大小。 |
| 多轮澄清 | 每轮最多 3 个问题、最多 3 轮；回答后重新生成，最终只进入预览，不自动写回 Composer。 |
| Provider 配置 | 支持 OpenAI Responses、OpenAI Chat Completions、Anthropic Messages 三种协议，允许手动填写模型。 |
| 模型获取 | 从用户指定 Provider 的 `/models` 或有限 `/v1/models` 兼容端点获取模型，并用真实下拉选项展示。 |
| 历史记录 | 按 `0/5/10/20/50` 保留原文、结果、澄清回答、模式和时间；不保存 API Key、地址或模型来源。 |
| 恢复快照 | 在当前页面生命周期中保留最近一次原文恢复快照；历史上限为 `0` 时仍可恢复最近快照。 |
| 设置界面 | 优先注册宿主个人设置页；宿主设置扩展不可用时使用包自有设置对话框，不阻断宿主启动。 |
| 生命周期 | 支持重复注入、页面重挂载、Composer 替换、会话切换、停用、请求取消和监听器清理。 |

### 1.3 产品契约

- 宿主功能包总开关控制整体加载；包内“启用优化按钮”首次默认开启。
- 优化按钮应在 Composer 操作区中稳定显示，不因输入框为空、命令快捷栏滚动或模型选择状态变化而被移动到宿主页面其他区域。
- 只读取当前 Composer；不读取会话历史、文件、附件或项目上下文。
- 默认结果跟随原文语言，保留 URL、代码、数字、专有名词和明确格式；缺失事实使用占位符，不编造事实。
- 默认输出只包含可直接使用的提示词，不添加解释、前言、后记或外层代码围栏。
- 取消、失败、超时、响应解析失败或上下文已变化时，不写回当前 Composer。
- 历史记录点击只进入预览，不覆盖当前 Composer；只有直接替换成功或用户明确应用/复制结果后才保存历史。
- 初版不支持 Codey 路由、OAuth、附件、完整会话上下文、流式输出和遥测。

### 1.4 技术栈与运行环境

| 项目 | 当前情况 |
| --- | --- |
| 语言 | Renderer 使用原生 JavaScript ES modules；Node 使用原生 Node.js ES modules；样式使用 CSS。 |
| 宿主 API | Codex Tweaks API v3。 |
| 前端框架 | 无 React/Vue/Svelte 依赖；通过 DOM、ARIA 语义和 `MutationObserver` 与宿主页面协作。 |
| Node 能力 | 使用 Node 内置 `fetch`、`AbortController`、文件系统和 JSON；首版不引入第三方运行时依赖。 |
| 持久化 | Node `dataDirectory` 下的 `config.json` 和 `history.json`；无数据库、缓存中间件或远程后端。 |
| npm 依赖 | `dependencies: {}`；`packageDependencies: {}`。 |
| 实际最低 Node 预期 | 实用上需要 Node.js 18+（内置 `fetch`、现代 ES modules 和 `node:test`）；宿主随附 Node 的精确版本要求为 **【待补充：由 Codex Tweaks 宿主文档确认】**。 |
| 当前验收平台 | Windows Codex 为首发正式验收平台；macOS 代码保持跨平台，但初期视觉验收未完成。 |
| 构建系统 | 当前没有独立编译器、打包脚本或 `.github/workflows`；由 Codex Tweaks 宿主加载源码。 |

### 1.5 当前阶段

当前属于 **alpha/预发布维护阶段**：核心源码、Node RPC、单元测试和静态语法检查已具备；公开 Release 已到 `v0.1.10`。但尚未形成 CI、自动打包和可重复的 Windows 实机视觉回归证据，因此不能称为生产就绪。

## 2. 开发时间线与里程碑

时间以当前 Git 提交和 GitHub 公开 Release 为依据；对于只有本地代码阶段、未出现在公开 Release 列表中的版本，明确标注。

### 2.1 阶段总览

| 阶段 | 时间 | 核心内容 | 交付物/版本 |
| --- | --- | --- | --- |
| 骨架与首版协议 | 2026-08-30 | 建立 API v3 包结构、Renderer/Node 分层、设置和三种模式的基础契约。 | `v0.1.0`；初始化提交 `9fb761a`、功能提交 `2870ce3`。 |
| Composer 与预览 UI | 2026-08-30 | 扩大 Composer 覆盖、预览面板、拖动/缩放、设置视觉样式和主题适配。 | `d63f606`、`87c7fea`、`b5ce7cb`；`v0.1.2`。 |
| Provider 与模型链路 | 2026-08-30 | 修复 OpenAI 协议响应解析、端点回退、模型列表展示和嵌套模型选择器。 | `8404412`、`14269ae`、`5897a54`、`a977c0d`；公开版本映射部分需补齐。 |
| Composer 锚点与生命周期稳定化 | 2026-08-30 | 处理背景信息窗口开关、固定覆盖层、无效坐标、设置扩展启动兼容和历史回归。 | `b850537`、`9bc5e10`、`e278c6a`、`e28d0f9`、`00d5370`；`v0.1.9`。 |
| 快捷栏与模型按钮回归修复 | 2026-08-31 | 排除命令快捷栏瞬态节点，稳定 Composer 锚点，隔离包 CSS，修复按钮随滚动移动、背景信息窗口受影响和模型选择宽度风险。 | `0e90f4a`、`c61a168`；`v0.1.10`。 |
| 版本字段统一与粘贴定位取证 | 2026-08-31 | 从 `package.json` 读取 Node 运行时版本，并增加默认关闭的会话级脱敏几何诊断开关。 | `bb17c58`、`112cad7`、`0881163`；`v0.1.11`。 |

### 2.2 公开 Release 记录

以下为 GitHub 当前可见的正式 Release；日期为 GitHub API 返回的发布时间（UTC）。

| Release | 发布时间 | 说明 |
| --- | --- | --- |
| `v0.1.0` | 2026-08-30 05:18:18Z | 首版功能包。 |
| `v0.1.2` | 2026-08-30 06:34:24Z | Composer 覆盖和 UI/预览改进。 |
| `v0.1.3` | 2026-08-30 07:27:47Z | 模型协议解析与设置页反馈修复。 |
| `v0.1.6` | 2026-08-30 10:04:26Z | Release 名称包含“对齐 Composer 的预览窗”。 |
| `v0.1.7` | 2026-08-30 10:37:01Z | 具体变更与提交映射为 **【待补充：核对 GitHub Release body/commit】**。 |
| `v0.1.8` | 2026-08-30 11:17:07Z | 模型下拉和持久化锚点阶段。 |
| `v0.1.9` | 2026-08-30 15:16:16Z | 设置扩展兼容、Composer 覆盖层和清理阶段。 |
| `v0.1.10` | 2026-08-31 03:34:13Z | 上一公开版本，快捷栏/Composer 回归修复。 |
| `v0.1.11` | 2026-08-31 09:35:20Z | 版本字段统一、临时几何诊断和交接记录同步。 |

公开 Release 列表当前未显示 `v0.1.4`、`v0.1.5` 的正式条目；本地 Git 历史存在对应代码阶段。两者是否曾以草稿、删除 Release 或仅标签形式发布，标记为 **【待补充：检查 GitHub Releases、标签和事件记录】**。

### 2.3 代表性提交时间线

| 提交 | 阶段性意义 |
| --- | --- |
| `9fb761a` | 初始化包目录。 |
| `2870ce3` | 加入提示词优化包 v0.1.0。 |
| `d63f606` | 改进 Composer 覆盖和设置样式。 |
| `87c7fea` | 加入可拖动预览面板。 |
| `5fa84f2` | 改进预览 surface。 |
| `8404412` | v0.1.3 阶段发布代码。 |
| `14269ae` | 支持嵌套模型选择器。 |
| `5897a54` | Composer 发现和 `/v1` 回退。 |
| `a977c0d` | 模型和持久化锚点改进。 |
| `b850537` | 背景信息窗口关闭时的锚点回退。 |
| `9bc5e10` | 使用固定覆盖层，减少宿主 Composer DOM 改动。 |
| `e278c6a` | 无效原点/左上角定位回归处理。 |
| `e28d0f9`、`00d5370` | 设置扩展可选注册和包内设置回退。 |
| `094367c` | 覆盖层间距/避让改进。 |
| `0e90f4a` | 命令快捷栏定位回归修复起点。 |
| `c61a168` | `v0.1.10` 公开基线，完成三类 Composer 回归修复。 |
| `bb17c58`、`112cad7` | 版本字段统一、临时几何诊断和交接记录同步，作为 `v0.1.11` 发布候选。 |
| `0881163` | `v0.1.11` Release 对应的发布提交。 |

## 3. 详细开发执行记录（分阶段）

### 3.1 阶段 A：包骨架、清单与产品契约

#### 执行步骤

1. 建立独立 Git 仓库和 `codex-tweaks-prompt-optimizer` 源码目录。
2. 创建 `package.json`、`README.md`、`LICENSE`、`src/index.js`、`src/style.css`、`src/node.js`。
3. 按 Codex Tweaks API v3 声明 Renderer 和 Node 入口。
4. 声明个人设置入口、包权限理由和空依赖集合。
5. 固定三种模式、三种协议、历史上限和输入/输出约束。

#### 执行原因

独立包和清晰的 API 边界可以避免修改宿主源码；先锁定产品契约，再实现 DOM 和网络细节，可以让后续 UI 回归不改变隐私、写回和取消语义。

#### 关键配置片段

```json
{
  "name": "ct-prompt-optimizer",
  "type": "module",
  "codexTweaks": {
    "apiVersion": 3,
    "renderer": "src/index.js",
    "node": "src/node.js",
    "packageDependencies": {}
  }
}
```

当前 `package.json` 的版本为 `0.1.11`。公开包 ID、仓库 slug 和 Topic 均保持固定规范：`ct-prompt-optimizer`、`codex-tweaks-prompt-optimizer`、`codex-tweaks-package`。

#### 环境变更

- 未引入 npm 运行时依赖。
- 没有数据库、远程服务端或构建产物目录。
- 增加 API v3 manifest、Renderer/Node 权限说明和 MIT 许可证。

### 3.2 阶段 B：Renderer 生命周期与 Composer 集成

#### 执行步骤

1. 以 `activate({ root, onCleanup, api, ui, node })` 为唯一启动入口。
2. 创建包自有 `uiRoot`、按钮宿主、面板宿主、设置宿主和 toast 宿主。
3. 给包 DOM 加唯一 `data-codex-tweaks-ct-prompt-optimizer` 标记。
4. 使用语义角色、ARIA 属性、`data-testid`、Composer 区域特征和 `MutationObserver` 发现 Composer。
5. 使用 `findComposerActionAnchor` 选择模型选择器/上下文窗口/提交按钮附近的稳定锚点。
6. 将包按钮放入固定覆盖层，不直接修改宿主 Composer 的子节点结构。
7. 监听页面重挂载、会话切换、输入框替换和滚动，所有监听器都纳入 `onCleanup`。

#### 执行原因

宿主页面属于动态 DOM。直接依赖一次性的 class 或把按钮插入宿主操作栏会受到 React 重渲染、弹窗和命令面板的影响，也可能破坏背景信息窗口。因此采用“语义发现 + 包自有固定覆盖层 + 生命周期清理”的最小侵入方案。

#### 关键实现约束

```js
activate({ root, onCleanup, api: _api, ui, node })
```

- 所有位置计算必须基于当前稳定 Composer 锚点的视口矩形。
- 找不到有效锚点或矩形宽高无效时，按钮保持隐藏，不使用页面左上角作为默认位置。
- 不把命令快捷栏的列表项、菜单项、历史消息编辑器或设置输入框当作 Composer。
- 异步请求完成后必须重新比较 Composer、会话标识和原文快照，变化时禁止自动写回。

#### 环境变更

- 增加 `src/renderer-core.js`，集中处理发现、排除、读写输入、上下文比较和按钮位置。
- 增加 `src/panel-geometry.js`，集中处理预览面板候选位置、边界和避让。
- CSS 全部通过包根选择器限定，避免泄漏到宿主模型按钮或背景信息窗口。

### 3.3 阶段 C：Node RPC、Provider 协议与安全边界

#### 执行步骤

1. 在 Node 中统一配置规范化、敏感字段脱敏和输入长度校验。
2. 通过 `dataDirectory` 保存 `config.json`、`history.json`，使用临时文件加替换的原子写入。
3. 实现固定 RPC：

   ```text
   load-settings
   save-settings
   clear-api-key
   test-connection
   list-models
   optimize
   clarify-round
   list-history
   delete-history
   clear-history
   ```

4. 统一处理 HTTPS、localhost HTTP、凭据 URL 拒绝、端点补齐、有限 `/v1` 回退和 60 秒超时。
5. 只返回已知的 JSON/响应字段，不递归猜测任意文本；对错误正文、Key 和 Authorization 做脱敏。
6. 用 `AbortController` 支持取消，并在 `dispose` 时中止所有活动请求。

#### 执行原因

API Key、网络请求和本地文件访问必须留在 Node 权限边界；Renderer 只处理当前页面 UI。固定 RPC 还可以使取消、日志脱敏、测试和未来替换 Provider 的行为集中可控。

#### 关键类型与限制

```ts
type Mode = "direct" | "preview" | "clarify";

type Protocol =
  | "openaiResponses"
  | "openaiChatCompletions"
  | "anthropicMessages";

type Settings = {
  schemaVersion: 1;
  enabled: boolean;
  mode: Mode;
  protocol: Protocol;
  baseUrl: string;
  apiKeyConfigured: boolean;
  model: string;
  instruction: string;
  historyLimit: 0 | 5 | 10 | 20 | 50;
};
```

| 限制 | 值 |
| --- | --- |
| 输入上限 | 32,000 字符。 |
| 输出上限 | 8,000 字符。 |
| 响应体上限 | 4 MiB。 |
| 请求超时 | 60 秒。 |
| 输出 token 预算 | 约 2,048。 |
| 首版流式 | 不使用，固定 `stream: false`。 |

#### 环境变更

- `config.json` 和 `history.json` 均带 `schemaVersion: 1`。
- 当前没有迁移脚本；后续 schema 变化必须增加显式迁移和备份策略。
- `src/node.js` 的 `PACKAGE_VERSION` 从根目录 `package.json` 读取，Node 请求标识与包清单版本保持一致；已增加请求级回归测试。

### 3.4 阶段 D：预览、澄清、历史和设置 UI

#### 执行步骤

1. 普通模式使用可编辑默认优化指令；澄清模式使用固定 JSON 协议指令，二者分离。
2. 预览面板显示原文和优化结果，结果区域使用更强的视觉层级。
3. 预览面板默认约 `720 × 340`，最小约 `320 × 240`，支持上方/右侧/左侧/下方候选位置、边界限制、拖动和缩放。
4. 历史点击进入预览，应用或复制后才确认写回/保存。
5. 设置 UI 优先使用宿主设置扩展；扩展缺失时显示包内设置对话框。
6. 使用宿主 CSS 变量、深色/浅色主题变量、紧凑间距和语义控件，降低与 Codex 视觉风格的偏差。

#### 执行原因

预览和历史是防止错误覆盖输入的安全边界；澄清 JSON 不能被用户的普通指令覆盖，因此必须使用独立协议。设置扩展存在宿主版本差异，包内回退可以保持功能可用且不让扩展初始化异常阻断宿主启动。

#### 当前澄清规则

- 最多 3 轮。
- 每轮最多 3 个问题。
- 允许留空、跳过或取消。
- JSON 解析失败只提示重试，不发送隐藏修复请求。
- 最终只进入预览，不自动写回。

### 3.5 阶段 E：测试与发布

#### 执行步骤

1. 使用 `tests/node.test.mjs` 覆盖协议、解析、脱敏、超时、配置、历史和取消。
2. 使用 `tests/renderer.test.mjs` 覆盖 Composer 发现、排除规则、定位、生命周期和异步上下文保护。
3. 运行 `npm test`、`npm run check` 和 Git 空白检查。
4. 发布前检查 `main`、版本标签、GitHub Release 和仓库 Topic。

#### 当前证据

- `npm test`：49/49 通过（Node 16 项、Renderer 33 项）。
- `npm run check`：通过。
- 当前 `main` 已包含 `v0.1.11` 发布提交 `0881163a7cd378e94e6417e9259f8a577aed1c33`；状态记录提交之后的最新 HEAD 以 `git rev-parse HEAD` 为准。
- 远端 `origin/main` 已核对包含同一发布提交；`v0.1.11` 标签和 Release 指向该提交，`v0.1.10` 标签仍指向公开基线 `c61a168b52e43bcd920727bdbb8ae310030bce55`。
- Windows 只读实机复核已取得部分证据：Codex Tweaks 管理器显示 `5 / 5` 包已启用且激活，`ct-prompt-optimizer` 为源 `v0.1.10`；当前 Codex Composer 可见两个包控件。三模式交互、设置页、重载/重启和停用清理仍未完成，详见 `memory/task-log/2026-08-31-p0-02-windows-visual-smoke.md`。
- 实机 ManagedPackages 的当前 `c61a168…` 副本 manifest 为 `0.1.10`，但 `src/node.js` 仍含旧 `PACKAGE_VERSION = "0.1.8"`；P0-01 的本地源码改动尚未重新编译/注入到该副本。

## 4. Bug 追踪与修复记录

> 说明：下表按现象和根因聚合历史修复。提交哈希是当前 Git 历史中可追溯的证据；没有独立的自动化复现用例或宿主视觉证据的项目，验证栏会明确写出边界。

### BUG-20260830-01：空 Composer 或错误控件出现优化按钮

- **问题描述**：Composer 为空时按钮不显示或显示在错误位置；早期实现可能把普通 combobox、模型控件或其他输入区当作 Composer。
- **触发条件/影响**：新对话、不同工作模式、输入框为空或宿主 DOM 重挂载时位置不稳定。
- **诊断过程**：检查候选元素的 ARIA/role/testid/ancestor 关系，并对比直接插入宿主 DOM 与包覆盖层的行为。
- **根本原因**：早期使用输入值作为显示门槛，且 Composer/模型选择器启发式过宽；按钮直接插入宿主操作栏，受到宿主重排影响。
- **修复方案**：在 `src/renderer-core.js` 中使用语义 Composer 区域评分；排除设置、弹窗、菜单、历史编辑器和消息区域；按钮改由包自有固定覆盖层管理。
- **相关提交**：早期修复起点 `413c957`，后续由 `9bc5e10`、`e278c6a` 和 `c61a168` 持续收敛。
- **验证方法**：Renderer 发现/定位测试通过；空输入不再作为唯一显示条件。Windows 多模式视觉实机证据仍为 **【待补充】**。

### BUG-20260830-02：预览窗位置远、尺寸和主题不匹配

- **问题描述**：预览窗初期显示在页面右上角，距离 Composer 较远；尺寸、拖动、缩放和浅/深色主题与 Codex 不一致。
- **根本原因**：使用固定角落或单一锚点，没有根据 Composer 和视口计算可避让候选位置。
- **修复方案**：新增 `src/panel-geometry.js`；按 Composer 上方、右侧、左侧、下方顺序选择不重叠位置，进行视口边界限制；增加拖动、缩放和主题变量；结果区提高层级并压缩排版。
- **相关提交**：`87c7fea`、`5fa84f2`、`b5ce7cb`。
- **验证方法**：几何模块和 Renderer 面板行为由测试覆盖；不同视口的完整视觉回归为 **【待补充】**。

### BUG-20260830-03：OpenAI 协议测试/优化提示响应不是合法 JSON

- **问题描述**：Anthropic 协议可以测试，OpenAI Responses 和 Chat Completions 报“API 响应不是合法 JSON”；部分兼容 API 的路径和响应外形不同。
- **诊断过程**：分别检查 base URL、`/responses`、`/chat/completions`、`/models` 与 `/v1/models`，并检查 BOM、已知 SSE 包装和不同响应字段。
- **根本原因**：端点补齐和响应提取只覆盖单一路径/单一 JSON 外形；兼容服务可能返回带 BOM、有限 SSE 或 `output`/`choices` 等已知结构。
- **修复方案**：按协议补齐端点；只在兼容性 404/HTML 响应时有限尝试 `/v1`；增加 BOM 和已知 SSE 解包；支持 `output_text`、嵌套 response、Responses output content、Chat choices message、Anthropic content 和 `body.text` 等已知字段；解析失败不发隐藏修复请求，不做可能重复计费的自动重试。
- **相关提交**：`268b65d`、`e43719a`、`5897a54`、`8404412`、`e8e4909`。
- **验证方法**：Node 测试覆盖三协议请求/响应、`/v1` 有限回退、BOM/已知响应形状、非法 JSON、HTTP 错误、超时和脱敏；真实用户 Provider 的当前可用性不在仓库测试内。

### BUG-20260830-04：模型已获取但下拉列表为空

- **问题描述**：界面提示成功获取多个模型，但点击模型输入框时没有可选项，仍需手动输入。
- **根本原因**：早期依赖 `datalist`/不稳定输入关联，宿主样式或浏览器实现没有可靠呈现选项。
- **修复方案**：设置页改为真实 `<select>` 模型选择器，同时保留手动模型输入能力；列表加载后将模型值映射到选项并保持当前草稿值。
- **相关提交**：`f860f9f`、`a977c0d`。
- **验证方法**：Renderer/Node 测试覆盖列表值归一化和设置交互；需要在 Windows 设置页实机点击确认选项可见，当前证据为 **【待补充】**。

### BUG-20260830-05：背景信息窗口开关/关闭时锚点错误

- **问题描述**：背景信息窗口打开时优化按钮可能占据其位置；关闭后按钮又无法稳定落到模型选择器左侧。
- **根本原因**：只寻找单一模型控件或没有识别背景信息窗口的展开/关闭状态；关闭的上下文控件仍被误当成可用锚点。
- **修复方案**：对 context/上下文/背景信息/background info 语义评分；拒绝 `aria-expanded=false`、`data-open=false`、closed/collapsed/hidden 状态；打开时优先使用上下文窗口，关闭时回退到模型选择器，再回退提交按钮。
- **相关提交**：`b850537`。
- **验证方法**：Composer 区域和锚点单元测试覆盖打开/关闭状态；宿主实际背景信息窗口的显示属于宿主功能，包只识别并避让，不负责渲染该组件。

### BUG-20260830-06：宿主工具栏/背景信息窗口被包修改影响

- **问题描述**：按钮插入后宿主原生工具栏或背景信息窗口可能消失、布局被重排。
- **根本原因**：旧实现调用 `anchor.parentElement.insertBefore`，直接改变宿主 Composer DOM；宿主重渲染后还可能重复插入。
- **修复方案**：包按钮、菜单和面板全部放入包自有固定宿主；只读宿主矩形和语义属性，不向宿主操作栏插入节点；CSS 选择器统一挂在包根标记下。
- **相关提交**：`9bc5e10`、`c61a168`。
- **验证方法**：源码审阅确认不再直接修改宿主 Composer 子树；Renderer 测试覆盖重复注入和清理。宿主背景组件的视觉实机回归为 **【待补充】**。

### BUG-20260830-07：无效坐标使按钮落到页面左上角

- **问题描述**：定位失败时按钮出现在 Codex 页面最左上角，而不是隐藏等待有效 Composer。
- **根本原因**：CSS/运行时在缺少矩形时仍使用默认 `left/top`；不同矩形实现的 `left/top` 与 `x/y` 也没有统一。
- **修复方案**：`getComposerButtonPosition` 同时兼容 `left/top` 和 `x/y`；检查有限数值和正高度；没有有效坐标时返回 `null`，调用方保持按钮隐藏；运行时对包按钮使用 fixed 定位和包级 z-index。
- **相关提交**：`a27e5d3`、`e278c6a`。
- **验证方法**：Renderer 测试覆盖无效矩形、坐标别名和隐藏状态；真实页面的每种 Composer 布局仍需 Windows smoke 复核。

### BUG-20260830-08：`ui.settingsSections` 缺失导致宿主启动失败

- **问题描述**：日志出现 `Required UI extension unavailable: ui.settingsSections`，Codex 启动卡住、黑屏闪烁或无法正常进入页面。
- **诊断过程**：对比宿主在不同版本中是否提供 `ui.settingsSections`，检查包 manifest 的 `required` 默认值和初始化异常传播。
- **根本原因**：功能包把可选 UI 扩展声明成 required，宿主没有该扩展时在创建设置区阶段直接抛出异常，阻断整个包启动，间接影响宿主加载循环。
- **修复方案**：manifest 中设置入口使用 `required: false`；Renderer 以能力检测方式注册原生设置，失败时使用包内设置对话框，不让可选扩展异常离开包激活边界。
- **相关提交**：`e28d0f9`、`00d5370`。
- **验证方法**：源码和静态检查确认可选注册与 fallback 存在；需要在不提供 `ui.settingsSections` 的宿主版本进行实际启动验证，当前日志复现证据为历史记录，最新 Windows smoke 结果为 **【待补充】**。

### BUG-20260830-09：输入 `/` 后优化按钮跟随命令快捷栏滚动

- **问题描述**：命令/建议快捷栏弹出后，按钮跳到快捷栏左侧；滚动快捷栏时按钮随 `scrollTop` 垂直移动。
- **诊断过程**：排查 CSS containing block、`position: absolute/sticky/fixed`、`getBoundingClientRect` 来源、滚动事件和候选节点；发现宽泛搜索会把瞬态命令项或快捷栏容器作为锚点。
- **根本原因**：按钮位置基于瞬态快捷栏 DOM 的滚动矩形，或滚动容器变化触发了错误的锚点重算；快捷栏属于临时浮层，不是 Composer 操作区。
- **修复方案**：`EXCLUDED_SELECTOR` 排除 command/suggestion/listbox、Radix/floating UI/cmdk 等瞬态浮层；优先保留上一次稳定 Composer 锚点；只在同一 Composer 区域或明确的同会话 portal/footer 中搜索；滚动监听只触发重定位到稳定锚点，不直接累加 `scrollTop`；按钮继续位于包自己的 fixed overlay。
- **相关提交**：`0e90f4a`、`c61a168`。
- **验证方法**：Renderer 测试覆盖命令快捷栏排除、稳定锚点、重复注入和滚动扫描；实际复现“输入 `/` → 滚动列表”的 Windows 视觉结果为 **【待补充】**。

### BUG-20260830-10：模型选择按钮点击后宽度跳变

- **问题描述**：点击宿主模型选择按钮后，按钮宽度比点击前变大。
- **诊断过程**：检查包代码是否写入宿主按钮 `style.width`、点击/焦点态是否改变 padding/border、以及包 CSS 是否存在未限定的 `button`/选择器规则。
- **根本原因判断**：当前提交中没有发现包 JavaScript 动态设置宿主模型按钮宽度；更可能是旧的宿主 DOM 插入或未隔离 CSS 造成父布局重排/样式泄漏。仅凭源码不能排除宿主本身的点击态样式。
- **修复方案**：包控件只在包根下渲染；不改宿主按钮 style/class/children；包 CSS 全部加 `[data-codex-tweaks-ct-prompt-optimizer]` 范围；固定包按钮尺寸，不对宿主模型按钮写宽度。
- **相关提交**：`c61a168`。
- **验证方法**：源码静态审阅和 Renderer 回归通过；若仍出现跳变，应在宿主页面分别记录点击前后的 computed `width/padding/border/box-sizing`，以区分宿主 CSS 与包 CSS。当前实机测量为 **【待补充】**。

### BUG-20260831-11：最近三类 Composer 回归合并修复

- **范围**：快捷栏滚动、背景信息窗口受影响、模型选择宽度风险。
- **修复摘要**：稳定 Composer 锚点、排除瞬态浮层、固定包覆盖层、根作用域 CSS、清理 host mutation。
- **版本证据**：公开基线 `v0.1.10` 的 `c61a168`；本轮功能提交为 `bb17c58`。
- **验证**：49 个自动化测试、语法检查和 Git 空白检查通过；宿主视觉验收仍不能由自动化测试代替。

### BUG-20260831-12：粘贴后优化按钮组跳到 Composer 左侧（诊断阶段）

- **问题描述**：用户把内容粘贴进 Composer 后，优化按钮和优化菜单从 Composer 底部操作区跳到输入框外框左侧。
- **现有证据**：合成 DOM 替换探针可稳定复现旧 `previousAnchor` 跨 Composer 复用；真实宿主触发路径和坐标系影响仍未确认。
- **临时诊断方案**：`src/index.js` 增加默认关闭、仅保存在当前会话的“临时定位诊断”开关，在粘贴、输入、扫描和重排阶段记录脱敏几何数据；输出包含 `composerRect`、`previousAnchorRect`、`modelPickerRect`、`buttonRect`、viewport、`visualViewport` 和 transform/zoom 元数据，不读取输入内容、API Key、地址或请求数据。
- **验证边界**：Renderer 回归测试和语法检查通过；该开关只提供实机取证能力，不等同于已修复，也不能替代 Windows 宿主截图和前后几何数据。

### 4.1 未关闭的已知问题与临时规避

1. **宿主 DOM/API 演进风险**：Codex Tweaks 或 Codex 更新可能改变 Composer 语义标记。临时规避是保留稳定 anchor、重新扫描和包内 fallback；正式方案见 `P0-02`。
2. **Windows 实机视觉证据仍不完整**：本轮只读观察确认当前 Codex 空 Composer 的包控件可见，自动测试通过仍不等于按钮在 ChatGPT/工作模式、背景窗口和快捷栏状态下位置正确；历史日志还出现过一次设置扩展错误和一次页面就绪超时。临时规避是重新编译/注入后逐模式 smoke，并保留截图/日志。
3. **macOS 视觉验收未完成**：代码层面保持跨平台，但不得在没有独立测试前宣称兼容。
4. **没有 CI/打包流水线**：当前发布依赖人工命令和人工检查，容易漏测或把未验证代码发布出去。
5. **宿主背景信息窗口不是包所有**：本包只识别其状态并避让；若宿主组件本身不渲染，应单独检查宿主实现，不能在本包中复制宿主组件。
6. **新增用户报告：粘贴后按钮组跳到 Composer 左侧**：目前已用合成 DOM 替换探针确认 `previousAnchor` 缺少当前 Composer 归属校验，真实宿主触发路径和坐标系影响仍待补采 geometry trace；暂不把该合成结果写成已修复。

## 5. 当前代码库状态

### 5.1 版本、分支与远端

| 项目 | 当前事实 |
| --- | --- |
| 当前目录 | `D:\Document\Codex\codex-tweaks-prompt-optimizer` |
| 当前分支 | `main` |
| `main` HEAD | 已包含 `v0.1.11` 发布提交 `0881163a7cd378e94e6417e9259f8a577aed1c33`；状态记录提交之后以 `git rev-parse HEAD` 为准。 |
| `origin/main` | 已核对与本地 `main` 同步，并包含 `0881163a7cd378e94e6417e9259f8a577aed1c33`。 |
| 当前标签 | `v0.1.11`，指向发布提交；`v0.1.10` 保留为上一公开基线。 |
| GitHub | <https://github.com/TttXxx36/codex-tweaks-prompt-optimizer> |
| 最新公开 Release | <https://github.com/TttXxx36/codex-tweaks-prompt-optimizer/releases/tag/v0.1.11> |
| 仓库权限/许可证 | 公开仓库，MIT。 |
| 公开 Topic | `codex-tweaks-package`。 |

### 5.2 本地分支概况

以下为当前本地分支和远端引用的摘要；历史备份分支不要删除，也不要用 force push 覆盖。

```text
backup/main-before-v0.1.10          08884a8...
backup/remote-main-before-v0.1.10   453f1ac... [behind 1]
fix/composer-three-bugs-20260831    87073a6...
integration-main-20260831           0fe7afa... [ahead 3, behind 4]
main                                0881163... (current at release)
publish-v0.1.9                     094367c...
release/v0.1.10-integrated-20260831 c61a168...
remotes/origin/main                 0881163... (release)
remotes/origin/release/v0.1.9       6739efa...
```

由于历史上存在多个本地/远端发布辅助分支，继续开发时以当前 `main` 与 `origin/main` 为事实源；先 `fetch` 和只读比较，再决定是否合并。禁止未经明确授权的 `reset --hard`、`checkout --` 或 force push。

### 5.3 当前目录结构

```text
codex-tweaks-prompt-optimizer/
├─ package.json                 # 包清单、API v3、入口、设置声明
├─ README.md                    # 面向安装者的功能、权限和限制说明
├─ LICENSE                      # MIT
├─ DEVELOPMENT_HANDOFF.md       # 本手册；本轮新增
├─ src/
│  ├─ index.js                  # Renderer 入口、设置、按钮、面板、生命周期
│  ├─ renderer-core.js          # Composer/锚点/输入读写/定位/排除规则
│  ├─ panel-geometry.js         # 预览窗尺寸、位置、边界和避让
│  ├─ style.css                 # 包根作用域 UI 和主题样式
│  └─ node.js                   # Node RPC、Provider 请求、文件持久化、安全边界
├─ tests/
│  ├─ node.test.mjs             # Node 侧协议、解析、安全、配置、历史测试（16 项）
│  └─ renderer.test.mjs         # Renderer 侧发现、定位、生命周期测试（33 项）
└─ memory/
   ├─ state.md                  # 当前任务状态记录
   ├─ experience.md             # 可复用排查经验
   ├─ preferences.md            # 用户偏好和工程约束
   └─ task-log/                 # 分任务的执行/验证记录
```

### 5.4 未提交修改

本手册生成后，`DEVELOPMENT_HANDOFF.md`、P0 任务记录、诊断开关源码/测试和状态更新组成一个变更集，已由功能提交 `bb17c58` 推送到 `origin/main`；具体当前状态仍以命令输出为准：

```powershell
git status --short --branch
```

上述变更集已同步到 `origin/main`，GitHub `v0.1.11` Release 已创建；未跟踪的诊断记录仍须保留并不得擅自纳入。若 `git status` 显示其他不属于本任务的文件，必须保留并先确认来源。

### 5.5 已实现功能清单

- [x] Codex Tweaks API v3 独立包结构。
- [x] Renderer/Node 分层和生命周期清理。
- [x] 三种 Provider 协议和有限端点回退。
- [x] 普通优化、预览后应用、多轮澄清。
- [x] 当前 Composer 读取、上下文一致性保护和取消。
- [x] 预览面板拖动、缩放、主题和结果强调。
- [x] 模型列表获取与真实下拉选项。
- [x] `0/5/10/20/50` 历史上限、裁剪和恢复快照。
- [x] Key 不回传、不写日志、不进入历史。
- [x] 设置扩展能力检测和包内 fallback。
- [x] 命令快捷栏/菜单/历史编辑器/设置输入框排除。
- [x] 固定包覆盖层、根作用域 CSS 和重复注入清理。
- [x] Node 16 项 + Renderer 33 项自动测试。

### 5.6 待实现或待完善功能清单

- [ ] Windows Codex 三种模式的完整视觉 smoke 和截图证据（本轮已补录管理器与当前 Codex Composer 的只读部分，交互项仍待完成）。
- [ ] macOS 独立视觉验收。
- [ ] CI：安装检查、语法检查、测试、Git 空白检查。
- [ ] 可重复的宿主安装/授权/重载验收脚本或手册化 checklist。
- [ ] 真实宿主版本矩阵和 API 能力探测记录。
- [ ] 更系统的 Composer fixture/回归测试。
- [ ] 公开 Release 与本地提交的完整映射，尤其是 `v0.1.4`、`v0.1.5`、`v0.1.7`。
- [ ] 任何 schema 变化前的显式迁移机制。

## 6. 开发环境与部署说明

### 6.1 本地环境初始化

以下命令适用于 Windows PowerShell；执行前先确认不会覆盖本地未提交修改。

```powershell
git clone https://github.com/TttXxx36/codex-tweaks-prompt-optimizer.git
Set-Location .\codex-tweaks-prompt-optimizer
git switch main
git pull --ff-only
node --version
npm --version
npm test
npm run check
```

当前 `package.json` 没有 npm `dependencies` 或 `devDependencies`，因此不需要安装第三方包；若宿主未来要求构建步骤，应先更新本手册和 `package.json`，不要凭空加入安装命令。

### 6.2 配置 Provider

设置页中填写 Provider 协议、HTTPS base URL、API Key、模型、默认优化指令和历史上限。

| 协议 | 请求路径规则 | 说明 |
| --- | --- | --- |
| OpenAI Responses | 裸地址补齐 `/responses`。 | 首版非流式；从已知 `output_text`/output content 等字段提取结果。 |
| OpenAI Chat Completions | 裸地址补齐 `/chat/completions`。 | 从已知 `choices[].message.content` 等字段提取结果。 |
| Anthropic Messages | 裸地址补齐 `/v1/messages`。 | 从已知 `content` 等字段提取结果。 |

通用规则：远程地址必须使用 HTTPS；localhost、127.0.0.1 等本地服务可以使用 HTTP；含用户名或密码的 URL 拒绝；兼容性 404/HTML 响应只有限尝试 `/v1` 变体；不支持无限重试或可能重复计费的自动重试。三种协议都会尝试模型列表端点；不支持时应显示清晰错误，但仍可手动填写模型。

### 6.3 数据目录与初始化

Node 由宿主传入 `dataDirectory`。运行时创建或维护：

```text
<Codex Tweaks package data directory>/
├─ config.json
└─ history.json
```

- 两个文件均包含 `schemaVersion: 1`。
- 写入使用临时文件加替换的原子流程。
- 没有数据库初始化、迁移命令或 seed 脚本。
- 设置读取不会向 Renderer 返回明文 Key。
- “清除 Key”“清空历史”和卸载前清理数据由设置页触发；停用包本身不删除配置或历史。

### 6.4 启动、测试和检查命令

| 目的 | 命令 |
| --- | --- |
| 运行全部自动测试 | `npm test` |
| 检查两个入口语法 | `npm run check` |
| 检查工作区状态 | `git status --short --branch` |
| 查看当前提交 | `git log -1 --format=fuller` |
| 查看分支和远端 | `git branch --all --verbose --no-abbrev` |
| 同步远端只读引用 | `git fetch origin --prune` |
| 检查 Git 空白 | `git diff --check`（未跟踪文件需另行检查） |
| 查看包清单 | `Get-Content .\package.json` |

### 6.5 在 Codex Tweaks 中安装和验收

1. 从仓库或指定版本取得包目录，确认根目录存在 `package.json` 和 `README.md`。
2. 通过宿主安装/加载功能包。
3. 按宿主提示授权 Node；权限范围应与 manifest 理由一致：只访问用户指定 API 和包数据目录，不访问其他文件、不运行子进程、不发送遥测。
4. 重载或重新注入功能包，确认没有 `ui.settingsSections` required 异常。
5. 在个人设置中确认“提示词优化”入口、开关、Provider 配置、模型测试和模型下拉。
6. 在 ChatGPT、Codex 和工作模式分别确认：Composer 为空时按钮仍按契约显示；按钮位于 Composer 操作区，不进入项目选择区、命令快捷栏或页面左上角。
7. 依次验收直接替换、预览后应用、多轮澄清、取消、上下文切换和历史恢复。
8. 输入 `/` 打开并滚动宿主快捷栏，确认优化按钮不随列表滚动。
9. 打开/关闭宿主背景信息窗口，确认宿主组件仍显示，优化按钮只避让/回退锚点，不改写宿主 DOM。
10. 点击模型选择器，确认其点击前后宽度不跳变。
11. 切换明暗主题、调整窗口尺寸、重启 Codex、停用包，确认样式和清理行为。

当前自动化部分已通过；本轮真实 Windows 观察只完成管理器状态和当前 Codex Composer 可见性，完整逐项结果仍未完成，不能仅凭源码或管理器版本宣布 P0-02 完成。已增加会话级几何诊断开关用于取得粘贴前后 trace，但它不改变上述验收边界。逐项记录见 `memory/task-log/2026-08-31-p0-02-windows-visual-smoke.md`。

### 6.6 构建、打包和发布流程

当前没有 `build`、`pack` 或 CI 脚本。推荐发布流程如下：

1. 在当前 `main` 上先做只读检查并创建可回滚分支/标签。
2. 修改 `package.json` 版本；`src/node.js` 会从包清单读取运行时版本，无需维护第二份常量。
3. 更新 `README.md` 的行为、权限、限制和变更记录。
4. 运行 `npm test`、`npm run check`、Git 空白检查，并完成 Windows smoke。
5. 审阅 `git diff`，只提交本任务范围内的文件。
6. 创建不可变 `v<SemVer>` 标签，并推送 `main` 与标签。
7. 在 GitHub 创建正式 Release，Release body 写明自动化测试和实机验收边界。
8. 发布后重新从公开仓库安装一次，确认包清单、版本和宿主加载结果。

禁止把“本地提交成功”“标签创建成功”当成公开发布完成；必须验证远端分支、标签、Release 和实际安装结果。

## 7. 后续开发计划与任务清单

### 7.1 近期目标：接下来 1–2 个迭代

近期目标是先提高可发布性和宿主兼容证据，再增加功能：

1. **已完成**：统一版本来源，避免运行时报告错误版本。
2. 建立最小 CI，自动执行语法、测试和文档/包清单检查。
3. 完成 Windows Codex 的 ChatGPT、Codex、工作模式视觉 smoke，保存截图、宿主版本和日志。
4. 在真实宿主中确认 `ui.settingsSections` 缺失与可用两种环境都不阻断启动。
5. 为 Composer/模型选择器/背景信息窗口建立固定 DOM fixture，减少下一次宿主更新造成的回归。

### 7.2 中期目标：后续 3–5 个迭代

- 建立宿主版本兼容矩阵和能力探测日志。
- 增加协议契约测试服务器，覆盖真实兼容 Provider 的 JSON、BOM、SSE 和错误响应。
- 完成设置页无障碍、键盘操作、焦点回收、窄窗口和高 DPI 回归。
- 建立预览面板视觉基线，验证明暗主题、拖动、缩放和多分辨率边界。
- 将发布检查改为可重复脚本，减少手工漏项。
- 评估 API 配置多 Provider profile；若加入，必须保持 Key 不进入日志、历史和 Renderer 返回值。
- 增加 schema 迁移、配置备份和卸载清理的可恢复测试。

### 7.3 长期规划

- 用宿主稳定扩展点替代对易变 DOM 的依赖；若宿主提供正式 Composer 插槽，优先迁移。
- 在明确用户同意和 Provider 支持后评估流式预览；保留取消和防止重复计费语义。
- 支持可选的本地优化服务，但继续遵守 localhost HTTP 例外和权限最小化。
- 建立跨平台 Windows/macOS 视觉回归矩阵；在有证据前不扩大兼容声明。
- 逐步将包级状态、RPC、解析和 UI 渲染拆成可独立测试的模块，但避免为了抽象而重写稳定代码。

### 7.4 按优先级排列的任务清单

工时为初步工程估算，不是已承诺排期；实际开始前要基于当前宿主版本重新确认。

| ID | 优先级 | 任务描述 | 预估工时 | 依赖条件 | 验收标准 |
| --- | --- | --- | ---: | --- | --- |
| P0-01 | P0 | **代码与测试已完成**：Node 从 `package.json` 读取运行时版本，避免硬编码漂移；实机编译副本尚待重新部署验证。 | 0.5–1h | 当前 `main`。 | 包版本、Node 报告版本和 Release 标签一致；增加回归检查。 |
| P0-02 | P0 | **进行中**：完成 Windows 三模式 Composer/设置/背景信息窗口视觉 smoke；本轮已取得管理器和当前 Codex Composer 的只读证据。 | 2–4h | 可运行的目标 Codex 版本、Node 授权。 | 记录安装、授权、按钮、三模式、主题、快捷栏、重启、停用截图/日志；无宿主启动异常。 |
| P0-03 | P0 | 验证宿主 `ui.settingsSections` 存在/缺失两种能力矩阵。 | 1–2h | 至少两个宿主版本或 mock adapter。 | 原生设置可用时正常注册，缺失时 fallback；任何异常不传播到宿主启动层。 |
| P0-04 | P0 | 引入最小 CI：`node --check`、`npm test`、文档和 manifest 检查。 | 2–3h | GitHub Actions 权限和 Node 矩阵选择。 | PR/推送自动给出可复现通过/失败结果；不上传 Key。 |
| P0-05 | P0 | 补齐公开 Release 与提交映射，核对 `v0.1.4/.1.5/.1.7`。 | 1–2h | GitHub Release/Tag 历史。 | 手册能准确说明每个公开版本；不修改历史标签。 |
| P1-01 | P1 | 建立 Composer DOM fixtures，覆盖空输入、ChatGPT/Codex/工作模式、context 开关、命令浮层。 | 3–5h | P0-02 的宿主 DOM 采样。 | 测试证明不会选中菜单/历史编辑器/设置输入框，且锚点稳定。 |
| P1-02 | P1 | 建立协议契约测试服务器和响应样本。 | 3–5h | Node 测试框架现有工具。 | 三协议、`/v1` 回退、BOM、已知 SSE、HTTP 错误、非法 JSON 和超时都有可重复样本。 |
| P1-03 | P1 | 完成设置页键盘、焦点、窄窗口和主题回归。 | 2–4h | P0-02。 | 亮/暗主题下布局居中、可读、可操作；模型选择和 API Key 显示状态稳定。 |
| P1-04 | P1 | 增加预览面板多分辨率视觉基线。 | 3–5h | 可用截图/视觉工具。 | 面板不遮挡 Composer，拖动/缩放有边界，快捷栏滚动不改变位置。 |
| P1-05 | P1 | 规范化发布脚本和 Release checklist。 | 2–3h | P0-04、P0-05。 | 版本检查、测试、标签、远端和 Release 状态可逐项验证。 |
| P2-01 | P2 | 增加配置 schema 迁移和失败恢复。 | 4–6h | 明确下一版 schema。 | 旧配置可迁移；写入中断不损坏原文件；迁移有测试和备份策略。 |
| P2-02 | P2 | 评估多 Provider 配置和本地服务支持。 | 4–8h | 安全评审、用户需求。 | Key/地址不进入日志、历史或错误；切换 Provider 不污染当前 Composer。 |
| P2-03 | P2 | 评估流式输出与更细粒度取消。 | 5–8h | Provider 契约测试、重复计费风险评审。 | 用户取消不会写回或入历史；断流、重连策略明确且默认关闭。 |

### 7.5 风险提示

- **宿主 DOM 漂移**：当前 Composer 定位依赖语义标记和结构启发式；宿主更新可能改变位置。应优先使用正式插槽或扩展能力。
- **设置扩展兼容**：把可选能力声明为 required 会重现宿主启动风险；任何 manifest 变更都必须在有/无扩展环境测试。
- **Provider 差异**：OpenAI 兼容服务并不保证严格一致的路径和响应；解析必须保持有限、可解释、无重复计费重试。
- **UI 样式泄漏**：未限定 CSS 或直接改宿主 DOM 可能改变模型按钮、背景信息窗口或快捷栏；包根作用域和固定 overlay 是当前护栏。
- **异步上下文污染**：请求完成时 Composer 可能已换会话或换原文；任何写回都必须经过上下文比较。
- **Key 安全**：Key 存储在本机包数据目录，界面默认遮蔽；项目没有宣称操作系统级加密，用户仍需信任本机权限模型。
- **性能**：`MutationObserver`、滚动监听和定时扫描要保持去抖、只观察必要属性，并在停用时全部清理。
- **发布质量**：没有 CI/自动打包时容易把本地辅助分支、未验证视觉修复或版本漂移发布到公开仓库。
- **跨平台证据不足**：Windows 是首发验收平台；macOS 在完成独立视觉测试前不能宣称已验收。

## 8. 新会话使用指南

### 8.1 新 AI 的优先阅读顺序

1. 本手册第 5 章，确认当前分支、提交、未提交文件和已知边界。
2. 本手册第 4 章，避免重做已修复的 Composer、协议和设置启动问题。
3. 本手册第 7 章，选择当前最高优先级且有验收标准的任务。
4. `memory/experience.md`，了解定位、模型下拉、设置扩展和宿主 DOM 的历史教训。
5. `memory/state.md` 和最近的 `memory/task-log/`，确认上一个任务是否已经验证、发布或只停留在本地。
6. `package.json`、`src/index.js`、`src/renderer-core.js`、`src/node.js` 和对应测试，再开始代码修改。

### 8.2 首次继续开发的检查步骤

```powershell
Set-Location D:\Document\Codex\codex-tweaks-prompt-optimizer
git status --short --branch
git fetch origin --prune
git branch --all --verbose --no-abbrev
git log main -5 --oneline --decorate
npm test
npm run check
```

如果工作区不干净，先区分本任务修改和用户已有修改；不要直接 reset、clean 或覆盖。确认当前 `main` 与 `origin/main` 后，再建立本任务分支和回滚点。

若任务涉及发布，额外检查：

```powershell
git diff --check
git tag --list "v*" --sort=-version:refname | Select-Object -First 10
gh auth status
gh repo view TttXxx36/codex-tweaks-prompt-optimizer
```

凭据、API Key、Authorization header 和 Provider 私密地址不得写入提交、测试日志、任务记录或本手册。

### 8.3 如何引用本手册

- 查当前事实：搜索 `main HEAD`、`v0.1.10`、`未提交`、`待补充`。
- 查某个问题：搜索 `BUG-`、问题关键词或相关提交哈希。
- 查接口：搜索 `RPC`、`openaiResponses`、`list-models`、`dataDirectory`。
- 查后续工作：搜索 `P0-`、`P1-`、`P2-`。
- 查设计决策：阅读第 9 章 ADR。
- 查术语：阅读第 10 章。

新会话的所有结论都应区分“源码/测试已证明”“远端状态已证明”“需要宿主实机验证”三类；没有证据时沿用 `【待补充】`，不要根据历史对话猜测。

## 9. ADR（架构决策记录）

### ADR-001：采用独立 Codex Tweaks API v3 包

- **状态**：已采用。
- **决策**：源码、仓库和稳定包 ID 独立命名；Renderer 和 Node 通过 API v3 生命周期运行。
- **原因**：避免修改宿主源码，便于安装、停用、回滚和公开发现。
- **代价**：必须适配宿主动态 DOM 和 API 能力差异。

### ADR-002：Node 是网络、Key 和持久化边界

- **状态**：已采用。
- **决策**：Renderer 不持有明文 Key；Node 负责用户指定 API 请求、配置/历史写盘和脱敏。
- **原因**：最小化 Renderer 暴露面，集中处理取消、超时、日志和原子写入。
- **代价**：Node 权限必须由用户授权；真实 Provider 行为需要 Node 测试。

### ADR-003：设置扩展优先、包内设置回退

- **状态**：已采用，当前 manifest 使用可选设置扩展。
- **决策**：如果 `ui.settingsSections` 存在则注册；不存在或注册失败则使用包内设置对话框；不让可选扩展异常阻断宿主。
- **原因**：不同宿主版本能力不一致，required 误用曾造成启动失败。
- **代价**：包需要维护一套 fallback UI；未来若宿主保证该扩展，再重新评估是否提高约束。

### ADR-004：包按钮使用固定覆盖层，不直接插入宿主 Composer

- **状态**：已采用。
- **决策**：包控件只挂在包根宿主，通过当前稳定 Composer 锚点的视口矩形定位。
- **原因**：避免宿主 React 重排、背景信息窗口损坏、命令快捷栏滚动继承和 CSS 污染。
- **代价**：必须持续处理视口、滚动、重挂载和有效坐标检查。

### ADR-005：上下文最小化与写回保护

- **状态**：已采用。
- **决策**：只发送当前提示词和用户明确填写的澄清回答；异步完成时若 Composer/会话/原文变化，则不写回。
- **原因**：隐私、可预测性和避免把旧结果写进新会话。
- **代价**：用户可能需要重新点击优化；历史和恢复逻辑更复杂。

### ADR-006：模型列表使用真实 select，同时保留手动输入

- **状态**：已采用。
- **决策**：获取模型后渲染真实下拉选项，手动模型名仍可填写。
- **原因**：早期 datalist 在宿主样式环境中不能可靠显示。
- **代价**：需要处理草稿值与远端选项的同步，且 Provider 不支持 `/models` 时仍需清晰降级。

### ADR-007：端点回退有限且不自动重试付费请求

- **状态**：已采用。
- **决策**：仅在兼容性 404/HTML 响应时尝试 `/v1` 变体；优化请求不做无界重试。
- **原因**：兼容 API 常有路径差异，但重复计费和隐藏请求不可接受。
- **代价**：某些非标准 Provider 仍需用户手动调整 base URL。

### ADR-008：首版使用完整响应，不使用流式

- **状态**：已采用。
- **决策**：请求设置 `stream: false`，先完成完整响应解析、取消和上下文一致性。
- **原因**：降低首版状态复杂度和半成品写回风险。
- **代价**：长响应需要等待完整请求；流式能力列入长期评估。

## 10. 术语表

| 术语 | 定义 |
| --- | --- |
| 原始提示词 | 用户当前 Composer 中、点击优化前读取的文本。 |
| 优化结果 | Provider 根据原始提示词和指令返回的可直接使用文本。 |
| 优化会话 | 一次从读取原文到生成、预览、应用/复制或取消的完整流程。 |
| 澄清轮次 | 澄清模式中一次提出最多 3 个问题并接收回答的循环。 |
| 恢复快照 | 当前页面生命周期内保留的最近一次原文/上下文信息，用于恢复，不等同于持久历史。 |
| Provider 配置 | 协议、base URL、Key、模型和默认指令组成的用户配置。 |
| Composer | Codex/ChatGPT/工作模式中用户输入提示词的当前编辑区域。 |
| 操作锚点 | 用于放置包按钮的稳定 Composer 操作区元素，通常是上下文窗口、模型选择器或提交按钮。 |
| 瞬态浮层 | 命令快捷栏、建议列表、菜单、弹窗等短生命周期 DOM，不可作为 Composer 锚点。 |
| 原生设置入口 | 宿主通过 `ui.settingsSections` 暴露的个人设置区域。 |
| 包内设置回退 | 宿主设置扩展不可用时，由包自己显示的设置对话框。 |
| `dataDirectory` | 宿主传给 Node 的包数据目录，用于配置和历史文件。 |
| API v3 包生命周期 | 通过 `activate` 启动，使用 `onCleanup`/dispose 清理资源，并由宿主管理启停的功能包运行模型。 |
| 有限回退 | 只在明确的兼容性错误下尝试一次备用端点，不进行任意路径猜测或无限重试。 |

## 11. 交接结论

项目已经形成可安装的 Codex Tweaks API v3 提示词优化包，公开 `v0.1.11` Release 和自动化测试构成当前基线；当前开发分支包含 P0-01 版本统一、Windows 视觉取证辅助和相关记录。`P0-01` 的实机编译副本尚未重新部署验证；`P0-02` 已取得部分 Windows 只读证据，完整三模式视觉验收仍未完成。

最重要的维护边界如下：

> **不要直接修改宿主 Composer DOM，不要把可选宿主 UI 扩展声明为 required，不要把未验证的视觉结果写成已完成，也不要在日志或文档中记录 Key。**

本手册自身为本轮新增文档，已随当前代码和测试纳入 `v0.1.11` Release；后续版本仍需重新执行版本、审阅和发布流程。
