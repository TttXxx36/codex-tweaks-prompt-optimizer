# codex-tweaks-prompt-optimizer

为 Codex Composer 提供提示词优化功能的 Codex Tweaks 第三方功能包。

当前包 ID 为 `ct-prompt-optimizer`，当前发布版本为 `v0.1.3`。包只实现 Codex Tweaks API v3 公开生命周期，不复制 Codey 源码，也不依赖 Codey 的私有 bridge。

## 功能

- 在个人设置页提供“提示词优化”配置。
- 在 Composer 的模型选择器附近提供“优化”按钮。
- 支持直接替换、预览后应用、多轮澄清三种模式。
- 支持 OpenAI Responses、OpenAI Chat Completions、Anthropic Messages 三种非流式协议。
- 支持模型列表探测、HTTPS/本机 HTTP 校验、有限 `/v1` 回退、60 秒超时和有限响应解析（包括 BOM 与已完整收集的标准 SSE `data` 包装）。
- 提供可编辑的默认优化指令、历史记录、历史预览和最近一次恢复快照。

## 隐私与权限

- Renderer 只读取和修改用户当前可见的 Composer 输入框；它不会读取会话历史、项目文件、附件或项目上下文。
- Node 只用于访问用户在设置中明确指定的优化 API，以及在功能包 `dataDirectory` 保存 `config.json` 和 `history.json`。
- 不运行子进程、不访问其他文件、不发送遥测。
- API Key 保存在本机功能包数据目录，界面默认遮蔽。此包不宣称使用操作系统级加密；请按自己的威胁模型选择 API 服务和主机环境。
- 读取设置时永远不会返回明文 Key；地址、Key 和提示词不会写入日志或错误正文。
- 这是非官方第三方扩展，未经过 Codex Tweaks 官方审核。安装前请阅读本 README、权限说明和源码。

## 安装

在 Codex Tweaks 中使用本地目录、压缩包或 Git 安装此仓库，然后按宿主提示完成编译和 Node 权限授权。包安装后还需要在包管理页启用；包内的“启用优化按钮”默认开启。

公开仓库地址：<https://github.com/TttXxx36/codex-tweaks-prompt-optimizer>

建议仓库使用 `codex-tweaks-package` Topic，并使用不可变的 `v<SemVer>` 版本标签发布，例如 `v0.1.0`。命名约定用于社区发现，不代表官方审核或安装限制。

## 设置说明

1. 选择协议，填写用户自己的 HTTPS API 地址、Key 和模型名称。
2. 可用“获取模型”探测 `/models`；服务不支持时仍可手动填写模型。
3. 修改优化指令后点击“保存配置”。草稿配置可用于“测试连接”和“获取模型”，但不会因为测试而落盘。
4. 选择历史保留数量 `0/5/10/20/50`。设置为 `0` 时不持久化历史，但当前页面生命周期仍保留最近一次恢复快照。
5. 卸载前可在“卸载前清理数据”区域执行“清理包数据”，它会清除 Key、历史和已保存 Provider 配置。

三种模式的写回边界：

- 直接替换：优化成功且 Composer 上下文、输入元素和原文均未变化时写回。
- 预览后应用：结果可编辑，只有点击“应用结果”或“复制结果”才会产生明确的接受动作。
- 多轮澄清：最多三轮、每轮最多三个问题；用户可以留空、跳过或取消，最终结果始终先进入预览，不自动写回。

如果请求期间切换会话、Composer 被重新挂载或用户修改了原文，结果不会自动写入新的上下文。

## 开发

此包使用原生 ES modules 和 Node 内置测试工具，没有 npm 运行时依赖。需要 Node.js 运行时：

```text
npm test
npm run check
```

仓库根目录必须保持为一个独立包：`package.json`、`README.md`、`LICENSE` 和 `src/` 位于根目录，不提交 `node_modules`、构建缓存、符号链接或宿主私有文件。

## 已知验收边界

源码包含 Node RPC、Renderer 清理机制、协议测试和 DOM 定位契约测试。正式发布前仍必须在 Windows Codex Tweaks 宿主中完成安装、编译、Node 授权、设置页、模型测试、三种模式、历史恢复、明暗主题、重启重新注入和停用清理的视觉 Smoke。macOS 在完成独立视觉测试前不声明兼容。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
