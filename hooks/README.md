<!--
機能概要: op-skill plugin の hooks/ ディレクトリ。SessionStart hook で Dynamic Workflow を staging する。
作成意図: workflow は plugin component 型に存在せず、named 解決 (Workflow({name:"op-*"})) は
         ~/.claude/workflows/ 探索前提のため、plugin 同梱の workflows/ を session 開始時に
         home の探索パスへ冪等 copy して既存の named 契約を無改変で成立させる (ADR-0023)。
注意点: hooks/hooks.json は plugin root で auto-discovered (plugin.json 宣言不要)。
       SessionStart は matcher 不要。command は fail-open (常に exit 0) で session 起動を阻害しない。
-->

# hooks/ — op-skill plugin hooks

## SessionStart: Dynamic Workflow の staging

`hooks/hooks.json` の SessionStart hook が、plugin 同梱の
`${CLAUDE_PLUGIN_ROOT}/workflows/op-*.js` を `~/.claude/workflows/` へ冪等 copy する。

**なぜ必要か**: Claude Code plugin は skills / agents / hooks / bin 等を提供できるが
**Dynamic Workflow は plugin component 型に存在しない**。一方 skill 群は
`Workflow({name: "op-*"})` の named 解決で workflow を呼び、named 解決は
`~/.claude/workflows/` (または project `.claude/workflows/`) の探索を前提とする。
plugin の workflow は `${CLAUDE_PLUGIN_ROOT}/workflows/` にあり探索パス外のため、
SessionStart で home の探索パスへ staging して名前解決を成立させる。詳細は
`op-tools/docs/adr/0023-workflow-plugin-distribution.md`。

## 契約

- **fail-open**: staging 失敗 (権限 / 未配置) は `2>/dev/null; exit 0` で握り、session 起動を阻害しない。
- **非破壊**: `op-*.js` のみ copy し `~/.claude/workflows/` を `--delete` しない
  (ユーザ個人 workflow を消さない)。
- **冪等**: `cp -f` で毎 session 上書き staging。新規 session で常に plugin 同梱の最新へ揃う
  (session 内 hot-reload はしない = ADR-0010 §named 解決の stale 注意と同じ運用)。

## 配布

`hooks/` は `sync-dist.yml` の同期対象に含まれ、public ミラー (op-skill-dist) 経由で
Cloud plugin に同梱される。`workflows/` も同時に同期対象へ追加済み (ADR-0023)。

## 検証待ち (ADR-0023 Proposed)

plugin SessionStart hook が **Cloud/web session で fire するか**は docs 未記載のため
実機検証で確定する (ADR-0023「検証チェックリスト」)。否認時は Workflow の `scriptPath`
経路 (Option B) へ切替える。
