---
name: op-sweep
description: auto/* prefix の squash-merge 済み branch を grace period (デフォルト 7 日) 後に local + remote 一括削除する branch hygiene 専任 skill。dry-run デフォルト、--apply で実行。「sweep」「branch掃除」「ブランチ片付け」「auto ブランチ削除」等のキーワードで起動。
---

<!--
schema_version: 1
last_breaking_change: 2026-05-18
notes: v1 (2026-05-18) 初版。ADR-0003 (op-sweep skill 新設) に基づく新規作成。
       op-tools primitive (op branch sweep-candidates / op branch sweep) は実装済み (PR #186/#187 由来)。
       フェーズ1/3 は op CLI primitive を default path として使用する。
-->

<!--
機能概要: auto/* prefix の squash-merge 済み branch を grace period (デフォルト 7 日) 後に
         local + remote 一括削除する branch hygiene 専任 skill。
         op-tools primitive (op branch sweep-candidates / op branch sweep) を呼び出す。
         dry-run デフォルト、--apply で実際に削除を実行する。
作成意図: squash-merge 運用では git branch --merged で merged branch が拾えない構造的問題がある。
         65 個超の remote auto/* branch が累積した状況を解消するため、
         ADR-0003 の「D 案: 独立 skill op-sweep」として branch hygiene を専任化した。
         op-patrol の mutation 禁止 (不変則 7) を維持したまま branch 掃除を完結させる。
注意点: 本 skill は CLAUDE.md 不変則 7 例外として「機械判定 housekeeping mutation」専任。
        対象は auto/* prefix のみ (ADR-0002 命名統一前提)。
        worktree-agent-* は auto/* prefix ではないため対象外。
        op-tools primitive (op branch sweep-candidates / op branch sweep) は実装済み (PR #186/#187 由来)。
        op-sweep は Sweep Ledger Issue を持たない (状態は git 側で完結)。
-->

# op-sweep: auto/* branch 一括掃除

/**
 * 機能概要: squash-merge 済みの auto/* branch を grace period 後に local + remote から削除する
 *           branch hygiene 専任 skill。dry-run が default 動作。
 * 作成意図: git branch --merged では squash-merge を拾えないため、
 *           PR の merged_at タイムスタンプから grace period を計算して削除対象を決定する。
 *           op-patrol に mutation を持たせず、専任 skill に切り出すことで不変則 7 を維持する。
 * 注意点: --apply を明示しない限り削除は実行しない。Sweep Ledger は持たない。
 */

---

## 不変則 7 例外宣言 (ADR-0003)

> **CLAUDE.md 不変則 7 (Review / Apply / Post-check の責務分離) に以下の例外を宣言する。**
>
> op-sweep skill は「機械判定 housekeeping mutation」専任として例外的に mutation 責務を持つ。
> 「人間判断を要する finding」と「機械的に確定する apply」を混ぜないという不変則 7 の本質は
> 守られる (sweep は完全な機械判定で、人間判断は最終承認 gate のみ介在する)。
> 他 OP skill は引き続き不変則 7 に従い、audit と apply を分離する。

この例外宣言により、op-patrol を mutation 化する将来圧力を構造的に断ち切る。
op-sweep という専任 skill が存在することで、housekeeping mutation の集約先が明確になる。

---

## op-merge との責務境界

| 処理 | 担当 |
|------|------|
| 特定 PR の head branch (`auto/<task-id>`) の **即削除** (grace なし) | **op-merge** (merge 成功直後に実行) |
| **全 auto/* branch の grace period 後の一括掃除** | **op-sweep** (本 skill) |
| worktree cleanup の提案 | op-merge (当該 PR worktree のみ) |

op-merge は 1 PR ずつ即削除する。op-sweep は一定期間後に全体をまとめて掃除する。
両者は補完関係にあり、op-merge 未実行の branch も op-sweep がカバーする。

---

## 起動コマンド

```
/op-sweep                       # dry-run: 削除候補を表示するだけ (実際には削除しない)
/op-sweep --apply               # 候補を表示してユーザー承認後に削除実行
/op-sweep --older-than 14       # grace period を 14 日に変更 (デフォルト: 7 日)
/op-sweep --older-than 3        # grace period を 3 日に変更
/op-sweep --include-source run  # 将来: source filter (現在は全 auto/* が対象)
```

---

## 実行モード表

| オプション | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| *(なし)* | — | — | dry-run: 候補を表示、削除しない |
| `--apply` | flag | false | ユーザー承認後に local + remote 削除を実行 |
| `--older-than <N>` | integer | `7` | grace period (merged_at からの経過日数、単位: 日) |
| `--include-source <src>` | string | *(未実装予約)* | source 識別子でフィルタ (例: `run` / `architect`) |
| `--dry-run` | flag | true | 明示的 dry-run (デフォルト動作と同じ) |

> `--include-source` は ADR-0003 で interface 予約のみ確保。初版では実装しない。

---

## 参照ドキュメント

| ファイル | 役割 | バージョン要件 |
|---------|------|--------------|
| `skills/_shared/worktree-ops.md` | worktree / branch ライフサイクル契約、task-id / branch 命名規則 | `(>=2)` |
| `skills/_shared/markers/labels-and-markers.md` | hidden marker の名前と semantics | `(>=7)` |
| `skills/_shared/runtime-contract.md` | runtime spawn 境界 / merge-blocking state | `(>=2)` |
| `skills/_shared/version-check.md` | schema_version pin チェック手順 | `(>=3)` |
| `docs/adr/0002-op-skill-branch-naming.md` | auto/* branch 命名統一規約 (Accepted) | — |
| `docs/adr/0003-op-sweep-skill.md` | op-sweep 設計判断 / 責務分離 (Accepted) | — |

起動時 (フェーズ0) に `skills/_shared/version-check.md` の手順に従い、
上記 `(>=N)` 条件を満たすか確認する。mismatch は warning 表示して続行可否を確認する。

---

## フェーズ0: 環境確認

```
1. gh 認証状態確認
   $ gh auth status
   → エラーの場合は中断して認証を促す

2. git 状態確認
   $ git status
   → uncommitted changes がある場合は warning を表示 (中断は不要、sweep 対象は別 branch)

3. git remote 確認
   $ git remote -v
   → origin が設定されていない場合は remote 削除をスキップする旨を表示

4. _shared/*.md schema_version チェック (version-check.md >=3 に従う)
   → 参照ドキュメント節の (>=N) 条件を Read で確認、mismatch は warning 表示
```

---

## フェーズ1: 候補列挙

### op-tools primitive 呼び出し

```bash
# op-tools primitive (op branch sweep-candidates) で候補を取得 (実装済み)
# 出力: JSON 形式の branch リスト + 保護理由

op branch sweep-candidates --older-than "${OLDER_THAN:-7}"
```

> `--older-than` は整数 (日数) を受け取る。JSON 出力に candidates / protected / summary が含まれる。
> `--include-source` は M4 向け予約 flag のため、現バージョンでは warn + 無視される。

---

## フェーズ2: 候補表示 + ユーザー承認 gate

```
1. フェーズ1 の結果を分類して表示:

   --- 削除候補 ---
   auto/feat-xxx-20260510-120000-c1  (merged_at: 2026-05-10, 8 日経過)
   auto/fix-yyy-20260511-093000-c2   (merged_at: 2026-05-11, 7 日経過)

   --- 保護中 (skip) ---
   auto/docs-zzz-20260517-180000-c3  [worktree_in_use]
   auto/feat-aaa-20260518-090000-c4  [within_grace: merged 2 日前]

2. dry-run の場合 (--apply なし):
   「上記 N 件が削除候補です。削除するには --apply を付けて再実行してください。」と表示して終了。

3. --apply の場合:
   「上記 N 件を local + remote から削除します。よろしいですか？ [y/N]」と確認を求める。
   - y: フェーズ3 へ進む
   - N または Enter (デフォルト): 「キャンセルしました。」と表示して終了
   - 候補が 0 件: 「削除候補はありませんでした。」と表示して終了
```

---

## フェーズ3: apply 実行

### op-tools primitive 呼び出し

```bash
# op-tools primitive (op branch sweep) で削除を実行 (実装済み)
# フェーズ1 の候補を再評価して delete 実行、結果を JSON 出力

op branch sweep --older-than "${OLDER_THAN:-7}" --apply
```

> `--apply` を省略すると dry-run として動作し、削除は実行されない。
> エラー発生時は `git reflog` (local 復元) または GitHub `restore branch` API (remote 復元, 90 日以内) で復元可能。

---

## フェーズ4: 結果報告

```
=== op-sweep 実行結果 ===

削除完了: N 件
  - auto/feat-xxx-20260510-120000-c1
  - auto/fix-yyy-20260511-093000-c2

失敗 / スキップ: M 件
  - auto/docs-zzz-20260517-180000-c3  [worktree_in_use]

残存 auto/* branch: K 件 (grace period 内または保護中)

次回 sweep 推奨: 7 日後 (oldest grace 期限に合わせる)
===========================================
```

`--apply` を付けずに実行した場合 (dry-run):

```
=== op-sweep dry-run 結果 ===

削除候補: N 件
  - auto/feat-xxx-20260510-120000-c1  (8 日経過)
  - auto/fix-yyy-20260511-093000-c2   (7 日経過)

保護中 / skip: M 件
  - auto/docs-zzz-20260517-180000-c3  [worktree_in_use]

実際に削除するには: /op-sweep --apply
===========================================
```

---

## 安全実行ルール / 例外条件

### 保護条件 (削除しない)

以下の条件を **いずれか 1 つ** 満たす branch は削除しない:

| # | 条件 | 確認方法 |
|---|------|---------|
| 1 | `auto/*` prefix ではない | branch 名の prefix 確認 |
| 2 | worktree で使用中 | `git worktree list` に branch 名が含まれる |
| 3 | open PR で参照中 | `gh pr list --head <branch> --state open` |
| 4 | merged_at が grace period 以内 (デフォルト 7 日) | PR の `mergedAt` タイムスタンプを確認 |
| 5 | open Issue で参照中 | `gh issue list --state open --search <branch>` |
| 6 | tag 起点 | `git tag --contains origin/<branch>` |

### 削除事故時の復元方法

| 対象 | 復元方法 |
|------|---------|
| local branch | `git reflog` → `git checkout -b <branch> <SHA>` |
| remote branch | GitHub UI の "Restore branch" (90 日以内) |

### worktree-agent-* の扱い

`worktree-agent-*` は `auto/*` prefix ではないため **本 skill の対象外**。
`git worktree list` での使用中チェックは `auto/*` に限定して行う。

---

## CLI インターフェース仕様 (op-tools 実装済み)

op-tools primitive (`op branch sweep-candidates` / `op branch sweep`) の
インターフェース仕様。Rust 側実装 (PR #186/#187 由来) の参照仕様として利用する。

### `op branch sweep-candidates` (read-only)

```
USAGE:
    op branch sweep-candidates [OPTIONS]

OPTIONS:
    --older-than <N>         grace period (デフォルト: 7、単位: 日)
    --include-source <src>   source filter (予約, 初版未実装)
    --format <fmt>           出力形式: json | text (デフォルト: json)
    --repo <owner/repo>      対象リポジトリ (デフォルト: origin から自動検出)

OUTPUT (JSON):
{
  "candidates": [
    {
      "branch": "auto/feat-xxx-20260510-120000-c1",
      "merged_at": "2026-05-10T12:00:00Z",
      "elapsed_days": 8,
      "pr_number": 42,
      "pr_title": "feat(xxx): ...",
      "has_local": true
    }
  ],
  "protected": [
    {
      "branch": "auto/docs-zzz-20260517-180000-c3",
      "reason": "worktree_in_use",
      "detail": "path: /home/user/cwork/worktrees/..."
    }
  ],
  "summary": {
    "candidate_count": 2,
    "protected_count": 1,
    "grace_days": 7,
    "evaluated_at": "2026-05-18T21:34:00Z"
  }
}
```

### `op branch sweep` (apply)

```
USAGE:
    op branch sweep [OPTIONS]

OPTIONS:
    --older-than <N>         grace period (デフォルト: 7、単位: 日)
    --include-source <src>   source filter (予約, 初版未実装)
    --format <fmt>           出力形式: json | text (デフォルト: json)
    --repo <owner/repo>      対象リポジトリ (デフォルト: origin から自動検出)
    --dry-run                削除せず候補表示のみ (デフォルト: false)

BEHAVIOR:
    sweep-candidates の結果を再評価してから削除を実行する。
    候補列挙と削除の間に保護条件が変化しても safety-net が機能する。

OUTPUT (JSON):
{
  "deleted": [
    {
      "branch": "auto/feat-xxx-20260510-120000-c1",
      "deleted_local": true,
      "deleted_remote": true
    }
  ],
  "failed": [
    {
      "branch": "auto/broken-yyy-20260509-000000-c0",
      "error": "remote delete failed: 403 Forbidden"
    }
  ],
  "summary": {
    "deleted_count": 2,
    "failed_count": 0,
    "remaining_auto_count": 3
  }
}
```

### branch 命名規則との整合 (ADR-0002)

本 primitive は `auto/*` glob のみを対象とし、手動 branch (`fix/*`, `feat/*` 等) には
一切触れない。ADR-0002 の「OP skill 自動生成 branch は `auto/` prefix 必須」に基づく設計。

---

## 定期実行 (schedule skill による自動化) — option

`schedule` skill で週次 `op-sweep --apply` を自動実行することは **option** として記録する。
デフォルトでは設定しない。user トリガ (週 1 回 `op-sweep` を打つ) で十分な運用が想定される。

設定例 (参考):

```
/schedule "毎週月曜 AM 9:00 に op-sweep --apply を実行"
cron: "0 9 * * 1"
command: /op-sweep --apply
```

schedule を設定する場合は、grace period が実際の PR ペースに合っているか事前に dry-run で確認すること。
