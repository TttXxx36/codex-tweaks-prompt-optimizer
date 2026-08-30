# Composer overlay clearance

- Scope: move only the prompt optimizer button group farther left from its existing Composer anchor; do not mutate host Composer DOM or alter button/menu actions.
- Risk: L2, reversible renderer-core and renderer-test change. Rollback point: clean worktree at `6739efa`.
- Acceptance: the entire main-button/menu group keeps a 24px gap from its anchor, the menu remains adjacent to the main button, and the existing test suite remains green.
- Decision: use a single named geometric clearance rather than a host-specific selector or a hard-coded background-information DOM assumption. This preserves behavior in Codex, Work, and ChatGPT composers.
- Arbitration: user request vs. speculative host-DOM fix -> follow the requested layout-only change because no live host DOM capture is available and the button must retain its behavior.
- Result: changed `getComposerButtonPosition` default clearance from 6px to 24px. Added red-then-green geometry coverage and overlay pointer-event assertions. `npm test` passed 41/41; `npm run check` and `git diff --check` passed. No commit or publication requested.
