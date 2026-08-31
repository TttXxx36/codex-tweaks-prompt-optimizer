# 2026-08-31 P0-01 版本字段统一

## Understanding

用户要求执行交接手册中的 `P0-01`：统一 `package.json` 与 `src/node.js` 的版本来源，避免 Node 运行时 `User-Agent` 继续报告旧版本；本轮不推送、不发布、不修改宿主 Codex。

## Triage

- 等级：L2。修改范围预计跨 Node 源码和 Node 回归测试，风险低且可逆。
- 模式：正常模式。用户的“执行 P0-01”已确认任务边界；当前没有需要暂停确认的方向性疑问。
- 回滚点：目标文件在开始修改前无未提交差异；基线 HEAD 为 `c61a168b52e43bcd920727bdbb8ae310030bce55`。交接手册、任务记录和 `memory/state.md` 的既有未提交修改属于前序任务，保留不动。

## Acceptance

1. `src/node.js` 不再硬编码独立的包版本，Node 请求 `User-Agent` 使用根目录 `package.json` 的 `version`。
2. 回归测试能在真实 Node 请求路径中证明 `User-Agent` 与包清单版本一致。
3. `npm test`、`npm run check` 和 `git diff --check` 通过。
4. 只修改 P0-01 所需源码、测试和任务记录；不提交、不推送、不发布。

## Workflow records

### Step 1-3：任务 essence 与本地事实

- 任务 essence：让 Node 运行时从项目唯一权威包清单读取版本，消除 `0.1.8` 与 `0.1.10` 漂移。
- `package.json:3` 的版本为 `0.1.10`；`src/node.js:53` 原为独立常量 `0.1.8`。
- `src/node.js:480` 将该常量用于 `User-Agent`；仓库没有构建步骤或第三方依赖。
- 当前本地 Node 为 `v24.20.0`，npm 为 `11.19.0`；目标文件现有差异为空。
- 项目经验记录确认：版本字段不一致会混淆诊断日志和用户反馈，应优先修复并增加测试。

### Step 4：在线方案调查

候选均为 Node 原生、无需引入依赖的成熟方案；Node.js 官方仓库截至调查页面显示约 48,137 次提交、36.6k forks，且有 Current/LTS 发布与安全维护说明，作为项目成熟度信号：

| 候选 | 证据与优点 | 风险/结论 |
| --- | --- | --- |
| `module.createRequire(import.meta.url)` 读取 `../package.json` | Node 官方 `node:module` API，自 v12.2.0 提供；兼容当前 ESM 写法，不新增依赖 | 选用；适合未知宿主 Node 版本范围 |
| ESM JSON import attributes | Node 官方 ESM 能力；语法清晰，JSON 模块在较新 Node 版本稳定 | 需要较新的语法/运行时支持，当前包未声明宿主版本矩阵；不选 |
| `fs.readFileSync(new URL(..., import.meta.url))` + `JSON.parse` | 只使用现有 Node `fs`/URL 能力，路径可随模块定位 | 需要额外同步读取和解析代码；不如 `createRequire` 简洁；不选 |
| `module.findPackageJSON` | Node 官方提供的包定位 API | 自 v22.14.0/v23.2.0 起提供且仍为 Active Development；宿主兼容性证据不足；不选 |
| 保留硬编码常量并增加一致性测试 | 改动最小 | 测试只能发现漂移，不能让运行时真正使用唯一来源；不满足 P0-01；不选 |

参考：[Node `module.createRequire`](https://nodejs.org/api/module.html#modulecreaterequirefilename)、[Node ESM JSON modules](https://nodejs.org/api/esm.html#json-modules)、[Node.js 官方仓库](https://github.com/nodejs/node)。

### Step 5：复用调查

- 产品必要性：版本出现在请求标识中，准确版本有助于 Provider/宿主诊断，必要。
- 平台原生能力：Node 原生 `createRequire` 可直接复用。
- 现有项目能力：项目已使用 ESM 和 Node 内置模块，无组件库或依赖需要引入。
- 依赖复用：不新增 npm 依赖，避免供应链和安装面扩大。
- 最小代码：新增一个 Node 内置导入，并把版本解析绑定到包清单；用现有 HTTP fixture 增加一条行为回归测试。

### Step 6-9：理解、产品审查与详细计划

- 用户体验/产品视角：该改动无可见 UI 变化，直接改善运行时诊断可信度；不改变协议、请求内容、Key 边界或包 ID。
- 工程视角：`package.json` 是包发布时必须存在的清单，也是当前唯一正确的 `0.1.10` 来源；使用相对 `import.meta.url` 的 `createRequire` 可适配包目录移动。
- 风险：若发布包遗漏根目录 `package.json`，Node 模块加载会失败；项目 README 已要求包根保留 `package.json`，因此该风险属于现有打包契约，不另造 fallback 常量。
- 详细计划：修改 `src/node.js` 的版本加载；在 `tests/node.test.mjs` 通过实际 `list-models` 请求捕获 `User-Agent`，读取同一包清单并断言精确匹配；运行基线和修改后验证；审阅仅限目标文件与本任务记录。

## Decision audit

- 现象：`package.json` 为 `0.1.10`，Node 运行时常量为 `0.1.8`。
- 依据：源码定位、现有测试边界、包根目录契约和 Node 官方 API 文档。
- 候选与取舍：JSON import attributes 较新；`findPackageJSON` 仍 Active Development；手写解析更长；硬编码不消除漂移。
- 选择：`package.json` 为唯一权威来源，使用 `createRequire(import.meta.url)("../package.json").version`。
- 影响：Node 的 `User-Agent` 随包清单自动更新；若清单缺失则暴露打包错误，不静默降级为错误版本。
- 运维状态：源码、测试和相关记录已修改；修改后验证通过，仍未提交或发布。

## Arbitration

项目交接手册/用户 P0-01 要求消除版本漂移 vs 现有 `src/node.js` 硬编码 → 遵循包清单作为唯一来源，因为它是已发布包的权威版本字段且无需新增依赖。

## Execution

- `src/node.js` 使用 `createRequire(import.meta.url)("../package.json").version` 作为运行时版本来源。
- `tests/node.test.mjs` 新增真实 `list-models` 请求级测试，捕获并校验 Provider `User-Agent`。
- `DEVELOPMENT_HANDOFF.md`、`memory/state.md` 同步移除 P0-01 的过期待办事实；未改动其他功能逻辑。

## Verification and archive

- `npm test`：48/48 通过（Node 16 项、Renderer 32 项）。
- `npm run check`：通过（`src/index.js`、`src/node.js`）。
- `git diff --check`：通过；对新增/变更文件的尾随空白扫描通过。
- 版本交叉核对：`package.json` 为 `0.1.10`，HEAD 为 `c61a168b52e43bcd920727bdbb8ae310030bce55`，当前标签为 `v0.1.10`；回归测试证明 Node User-Agent 使用 `0.1.10`。
- 当前工作区仍保留前序未提交的交接手册与 `memory/state.md`；本任务新增/修改文件也尚未提交。未推送 GitHub，未创建 Release。
- 后续未完成项：`P0-02` Windows 三模式实机视觉 smoke、CI 和宿主兼容矩阵；这些不由本任务的自动化测试证明。
- 本任务不会创建 Git 提交；提交/推送/Release 仍由后续明确任务决定。
