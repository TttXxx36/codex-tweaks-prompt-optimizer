# 2026-08-31 GitHub main 备份与发布

## Understanding

用户要求先备份 GitHub 仓库当前 `main`，再把已验证的 Composer 命令面板修复推送到 `main`；不要求创建 Release。

## Acceptance

- 新备份分支精确指向发布前的远端 `main`。
- 发布更新不强推、不丢失远端历史，并保留本地修复内容。
- 发布前在集成树上通过现有自动测试、语法检查和 diff 检查。
- 发布后从 GitHub API 核对 `main` 与备份分支指针。

## Decisions and evidence

- Triage：L3，原因是外部 GitHub 发布；用户已明确授权备份并推送。
- 远端基线：`main=094367ce57f2e14eba798317e7b9e7f73fe15413`。
- 备份分支：`backup/main-before-composer-command-palette-fix-20260831`，创建后仍指向 `094367ce`。
- 本地与远端历史存在分叉，因此从远端 `main` 创建集成分支并干净重放本地修复，集成提交为 `277fba1`；未使用 force push。
- 远端 Git refs 与 Git push 的快进规则参考 [GitHub REST Git references](https://docs.github.com/en/rest/git/refs) 和 [git-push](https://git-scm.com/docs/git-push)。

## Result

- Git smart-HTTP 因当前 Schannel/凭据环境无错误正文失败；改用已登录的 GitHub CLI Git Data API 创建树和提交，不暴露 Token。
- GitHub API 已创建发布树 `0b9d7ba3` 和提交 `0e90f4a8`，待本次审计记录提交后一起快进更新 `main`。
- 不创建 Release。
