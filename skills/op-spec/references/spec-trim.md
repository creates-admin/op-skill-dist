# op-spec: trim (正本を細くする)

大きさの上限を超えた正本 1 本を、`_schema.md`「書くもの・書かないもの」の A〜F に沿って細くする。1 正本 1 PR。

1. 対象正本を 1 本選び、`references/spec-expert-spawn-template.md` で `mode: trim` の spec-expert を spawn して `trim_plan[]` を受け取る。
2. `trim_plan[]` を段落ごとの A〜F 表 (節 / 抜粋 / 区分 / action / 移し先) で見せる。
3. D・F は削除、E は移し先 (`move_to`) を示す。移し先への追記は本 skill ではしない。
4. A・B は 6 節の形に並べ直すだけで、文言は変えない。
5. `ask` の段落と、区分に異論が出た段落は人に聞いて決める。A は人の確認なしに削らない。
6. 消える文言の一覧 (原文・区分・移し先) を必ず見せ、承認を得てから write する。
7. write 後に `op spec-patrol list-specs --json` で対象正本の `chars` / `over_by` を確かめる。

## PR

- branch は `auto/spec-trim-<feature>-<YYYYMMDD-HHMMSS>` (`_shared/worktree-ops.md`)。1 正本の変更だけを 1 PR にまとめる。
- `op pr create`。本文に前後の字数、消える文言の一覧 (原文・区分・移し先)、人に聞いて決めた段落を書く。
- マージは `/op-skill:op-merge` または人間が GitHub で行う。
