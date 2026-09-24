---
name: op-sweep
description: auto/* prefix の squash-merge 済み branch を grace period (デフォルト 7 日) 後に local + remote 一括削除する branch hygiene 専任 skill。dry-run デフォルト、--apply で実行。「sweep」「branch掃除」「ブランチ片付け」「auto ブランチ削除」等のキーワードで起動。
---

# op-sweep: auto/* branch 一括掃除

## 不変則9 例外宣言

op-sweep は「機械判定 housekeeping mutation」専任として例外的に branch 削除の責務を持つ (CLAUDE.md 不変則9 の例外)。
削除対象は CLI が決定論的に確定し、人間は最終承認 gate にのみ介在する。

## 対象範囲

- 対象は `auto/*` branch のみ。手動 branch (`fix/*` / `feat/*` 等) には触れない。
- squash-merge 済みかどうか・grace 経過は CLI が PR の `mergedAt` から判定する (`git branch --merged` は使わない)。
- worktree / PR / Issue の後始末は op-cleanup。branch 命名規約は `~/.claude/skills/_shared/worktree-ops.md`。

### worktree-agent-* の扱い

`auto/*` prefix ではないため対象外。

## 起動

```
/op-skill:op-sweep                  # dry-run: 削除候補を表示するだけ
/op-skill:op-sweep --apply          # 候補を表示 → 承認後に local + remote 削除
/op-skill:op-sweep --older-than 14  # grace period (mergedAt からの日数、デフォルト 7)
```

## フェーズ0: 環境確認

`~/.claude/skills/_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」に従う (gh channel で未認証なら中断)。
GitHub 操作は `~/.claude/skills/_shared/github-channel.md` の channel 判定に従う。origin が無ければ remote 削除をスキップする旨を表示する。

## フェーズ1: 候補列挙 (read-only)

```bash
op branch sweep-candidates --older-than "${OLDER_THAN:-7}"
```

`candidates[]` が削除候補、`protected[]` が保護中 (`reason`: `age_below_grace` / `worktree_in_use` / `open_pr_ref` /
`open_issue_ref` / `tag_origin` / `protected_branch_list`)。

## フェーズ2: 候補表示 + 承認 gate

```
--- 削除候補 ---
auto/feat-xxx-20260510-120000-c1  (merged 8 日前, PR #42)
--- 保護中 (skip) ---
auto/docs-zzz-20260517-180000-c3  [worktree_in_use]
```

- dry-run: 「削除するには `/op-skill:op-sweep --apply`」と表示して終了。
- 候補 0 件: 「削除候補はありませんでした。」で終了。
- `--apply`: 「上記 N 件を local + remote から削除します。よろしいですか？ [y/N]」。N / Enter はキャンセルして終了。

## フェーズ3: apply

```bash
op branch sweep --older-than "${OLDER_THAN:-7}" --apply
```

## フェーズ4: 結果報告

JSON の `deleted[]` / `failed[]` (`error` 付き) / `summary.remaining_auto_count` をそのまま要約して報告する。

## 削除事故時の復元方法

| 対象 | 復元 |
|------|------|
| local branch | `git reflog` → `git checkout -b <branch> <SHA>` |
| remote branch | GitHub UI の "Restore branch" (90 日以内) |
