# op-spec: 正本の PR

正本を write した後の PR 手順。

- branch は `auto/spec-<mode>-<feature>-<YYYYMMDD-HHMMSS>` (`<mode>` は 1-0 で選んだ entry mode、`_shared/worktree-ops.md`)。1 正本の変更 (lazy 構築なら constitution Part 3 の行の更新を含む) だけを 1 PR にまとめる。
- `op pr create`。本文に前後の字数と変わる文言の一覧 (原文・変更後。削除と移動は区分・移し先)、人に聞いて決めた箇所を書く。
- マージは `/op-skill:op-merge` または人間が GitHub で行う。
