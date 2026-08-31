# 设置页 UI 重构 Design QA

## Comparison target

- Source visual truth: `C:\Users\XT\AppData\Local\Temp\codex-clipboard-a4526c07-b5bd-41c4-856d-3892157379b4.png`
- Implementation screenshot: unavailable; the package is hosted inside Codex Tweaks and this task did not reload, install, or change the user's active package state.
- Source pixel dimensions: 1849 × 4010 (the chat preview was resized to 944 × 2048).
- Implementation pixel dimensions / CSS viewport / density: not captured.
- State: Chinese “提示词优化” settings page, dark host theme, custom anime background, empty diagnostic JSON, configured Provider fields, and populated optimization history.

## Comparison evidence

- Full-view comparison: blocked because the matching post-change host screen is unavailable. The supplied source screenshot was inspected as the reference, but a source-only view is not a QA comparison.
- Focused regions: not run for the same reason. The intended regions are the page header, basic/debug cards, Provider grid, diagnostic textarea, and history item actions.

## Required fidelity surfaces

- Fonts and typography: source uses a compact sans-serif settings hierarchy. The implementation keeps the existing system-font stack and adjusts title/heading weight, line-height, and hint readability; visual wrapping and rendering remain unverified.
- Spacing and layout rhythm: implementation adds card padding, section separation, a two-column desktop Provider grid with long fields spanning both columns, a shorter diagnostic viewport, and single-column narrow-screen fallback; actual geometry remains unverified.
- Colors and visual tokens: implementation adds light/dark card and control tokens, stronger borders, focus rings, and a solid accent switch state; contrast against the host's custom background remains unverified.
- Image quality and asset fidelity: no image asset was added, replaced, cropped, or synthesized. The host-provided background remains outside this package's ownership; its post-change crop and treatment remain unverified.
- Copy and content: existing settings labels, hints, Provider actions, history actions, and privacy wording were preserved.

## Findings

- [P1] Matching rendered implementation is unavailable.
  Location: Codex Tweaks-hosted settings page.
  Evidence: the source screenshot exists, but the current task has no post-change host screenshot at the same viewport, theme, content, and density.
  Impact: visual hierarchy, text wrapping, card contrast, and responsive behavior cannot be conclusively accepted from source inspection and automated tests alone.
  Fix: after the package is reloaded in the target Codex Tweaks host, capture the same settings state at the source viewport and repeat the full-view and focused-region comparison.

## Comparison history

- Pass 0: no comparison run; blocked before the first source/implementation pair because the host package was not reloaded.

## Implementation checklist

- [x] Preserve existing settings DOM behavior, Provider protocols, privacy wording, and host background.
- [x] Add readable surface grouping and stable field rhythm.
- [x] Keep long URL, Key, and model rows full width while allowing mode/protocol to share a desktop row.
- [x] Limit diagnostic output height and make history actions scanable.
- [x] Add narrow-screen layout rules.
- [x] Run source tests, syntax checks, and whitespace checks.
- [ ] Capture and compare the reloaded host UI at the matching viewport/theme/state.

final result: blocked
