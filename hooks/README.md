# hooks/ — op-skill plugin hooks

`hooks/hooks.json` (plugin root で auto-discover) の SessionStart hook が 2 つの staging を行う。
どちらも fail-open (失敗しても `exit 0`、session 起動を阻害しない)。

## 1. Dynamic Workflow の staging

`${CLAUDE_PLUGIN_ROOT}/workflows/op-*.js` を `~/.claude/workflows/` へ `cp -f` する。
workflow は plugin component 型に無く、`Workflow({name: "op-*"})` の named 解決は `~/.claude/workflows/` を探すため。

- `op-*.js` だけを上書きし、`~/.claude/workflows/` を `--delete` しない (ユーザー個人の workflow を消さない)。
- 削除済み workflow (`op-enrichment` / `op-plan-judge` / `op-architect-judge` / `op-run-judge-clustering` /
  `op-explore-render`) の staging 残骸は名前指定で消す。
- 毎 session 上書きする。session 途中の plugin 更新は次の session から反映される。

## 2. `skills/_shared/` の staging

`${CLAUDE_PLUGIN_ROOT}/skills/_shared/` を `~/.claude/skills/_shared/` へ全消し + 再 copy する。
`_shared` は SKILL.md を持たず auto-load されないため、SKILL.md / spawn prompt 内の
`~/.claude/skills/_shared/*.md` 参照はこの staging で解決する。

## 配布

`hooks/` と `workflows/` は `sync-dist.yml` で public ミラー (op-skill-dist) に同期され、Cloud の plugin にも同梱される。
詳細: ADR-0023。
