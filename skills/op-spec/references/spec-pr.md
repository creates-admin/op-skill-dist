# op-spec: 正本の PR

正本を write した後の PR 手順。

- branch は `auto/spec-<mode>-<feature>-<YYYYMMDD-HHMMSS>` (`<mode>` は 1-0 で選んだ entry mode、`_shared/worktree-ops.md`)。1 正本の変更 (lazy 構築なら `_index.md` の機能地図の行の更新・追加を含む) だけを 1 PR にまとめる。
- consolidate は 1 機能の移し先の正本と移し元の層の正本 (と `_index.md` の機能地図の行) を 1 PR にまとめ、本文に正本ごとの前後の字数を書く。
- `op pr create`。本文に前後の字数と変わる文言の一覧 (原文・変更後。削除と移動は区分・移し先)、人に聞いて決めた箇所を書く。
- マージは `/op-skill:op-merge` または人間が GitHub で行う。
