# hooks/ — op-skill plugin hooks

`hooks/hooks.json` (plugin root で auto-discover) の SessionStart hook。どちらも fail-open (`exit 0`)。

## 1. 旧 staged workflow の削除

`workflows/op-*.js` は plugin component として読まれ、`Workflow({name: "op-skill:<name>"})` で解決される。
以前 `~/.claude/workflows/` へ staging した同名 copy (`op-scan-audit` / `op-patrol-audit` / `op-spec-patrol-audit` /
`op-survey` / `op-run-discover`) を名前指定で消す。それ以外のユーザー workflow には触れない。

## 2. `skills/_shared/` の staging

`${CLAUDE_PLUGIN_ROOT}/skills/_shared/` を `~/.claude/skills/_shared/` へ全消し + 再 copy する。
`_shared` は SKILL.md を持たず auto-load されないため、SKILL.md / spawn prompt 内の
`~/.claude/skills/_shared/*.md` 参照はこの staging で解決する。

## 配布

`hooks/` と `workflows/` は `sync-dist.yml` で public ミラー (op-skill-dist) に同期され、Cloud の plugin にも同梱される。
