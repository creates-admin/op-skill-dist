---
name: op-cleanup
description: >
  失敗 worktree / 失敗 run 残骸 / stale PR / stale auto-report Issue の後始末を行う独立 OP skill。
  two-tier 設計 (Tier1=機械判定 auto / Tier2=人間 gate) で stale 資産を集約する。
  branch は扱わない (op-sweep に委譲)。dry-run デフォルト、--apply で Tier1 を実行。
  「op-cleanup」「stale 資産掃除」「worktree 掃除」「放置 PR」「陳腐化 Issue」等のキーワードで起動。
---

<!--
schema_version: 1
last_breaking_change: 2026-06-21
notes: v1 (2026-06-21) 初版。ADR-0006 (op-cleanup skill 新設) に基づく新規作成。
       op-sweep (ADR-0003) と補完関係にある two-tier 設計。
       Tier1 は機械判定 housekeeping mutation (op-sweep 同様の例外)。
       Tier2 は人間 gate を必須とし不変則 7 normal 遵守 (新たな例外を作らない)。
       op-tools primitive (op cleanup *-candidates) は別 Issue で段階実装予定。
-->

<!--
機能概要: OP 運用で増える stale 資産 (失敗 worktree / 失敗 run 残骸 / stale PR / stale auto-report Issue)
         の後始末を行う独立 OP skill。two-tier 設計で資産の risk tier を分けて処理する。
作成意図: op-sweep は auto/* branch 専任で、それ以外の stale 資産 (失敗 worktree / stale PR / Issue) の
         入口が存在しなかった。ADR-0006 の two-tier 設計に従い、机械判定で安全なもの (Tier1) は
         op-sweep 同様に auto、人間判断が必要なもの (Tier2: PR/Issue close) は人間 gate に置く。
         op-sweep の「pure mechanical, 人間 gate なし」保証を壊さないため独立 skill として新設した。
注意点: 本 skill は branch を扱わない。auto/* branch の掃除は op-sweep を使うこと。
        Tier2 (PR/Issue close) は人間 gate を必須とし、機械 close は絶対に行わない。
        worktree ライフサイクルの正本は skills/_shared/worktree-ops.md を参照すること (再定義禁止)。
        不変則 7 の例外は Tier1 (worktree/残骸の機械削除) のみ。Tier2 は normal 遵守。
-->

# op-cleanup: stale 資産の two-tier 後始末

/**
 * 機能概要: 失敗 worktree / 残骸 / stale PR / stale auto-report Issue を two-tier 設計で後始末する
 * 作成意図: op-sweep では対処できない branch 以外の stale 資産を集約し、
 *           リスクに応じた判定 (機械 vs 人間 gate) を適用する。
 * 注意点: Tier1 は機械判定 (dry-run デフォルト + --apply で削除)。
 *         Tier2 は候補列挙のみ。close は必ず per-item 人間承認を経る。
 */

---

## 不変則 7 例外宣言 (ADR-0006)

> **CLAUDE.md 不変則 7 (Review / Apply / Post-check の責務分離) に以下の例外を宣言する。**
>
> op-cleanup skill の **Tier1 (失敗 worktree / 失敗 run 残骸 / orphaned worktree dir)** は
> 「機械判定 housekeeping mutation」として例外的に mutation 責務を持つ。
> 機械的に確定できる削除 (fs mtime + grace の決定論) のみを対象とし、人間判断は介在しない。
> op-sweep と同質の安全な機械判定に限定されるため、不変則 7 の本質は守られる。
>
> **Tier2 (stale PR close / stale auto-report Issue close) はこの例外に含まない。**
> Tier2 は per-item 人間承認を必須とする不変則 7 の通常モデルに従う。
> 「op-cleanup が追加されたので PR/Issue を機械 close してよい」という解釈を禁止する。
>
> 他 OP skill は引き続き不変則 7 に従い、audit と apply を分離する。

この例外宣言により、ADR-0003 §却下-A が警告する「例外の滲み出し」を構造的に断ち切る。
Tier1 と Tier2 の境界 = 「機械判定で確定できるか否か」が不変則 7 例外を scoped に保つ根拠。

---

## op-sweep との責務境界

| 処理 | 担当 |
|------|------|
| `auto/*` prefix の squash-merge 済 branch の grace 後一括削除 | **op-sweep** (branch 専任) |
| 失敗 worktree / 失敗 run 残骸 / orphaned worktree dir の grace 後削除 | **op-cleanup Tier1** |
| stale PR (放置 open / reviewed_head_sha 古い) の close | **op-cleanup Tier2 (人間 gate)** |
| stale auto-report Issue (起票後に陳腐化) の close | **op-cleanup Tier2 (人間 gate)** |

op-cleanup で `auto/*` branch が掃除すべき状態だと気づいた場合は、
`/op-sweep` を実行するよう案内し、自分では branch を触らない。

---

## two-tier 設計

| Tier | 対象 | 判定 | 実行 | 不変則 7 |
|------|------|------|------|---------|
| **Tier1 (機械判定)** | 失敗 worktree (`~/cwork/worktrees-failed/`) / 失敗 run 残骸 / orphaned worktree dir | fs mtime + grace の決定論 | dry-run デフォルト、`--apply` で機械削除 | ADR-0006 機械判定例外 (scoped) |
| **Tier2 (人間 gate)** | stale PR (reviewed_head_sha 古い / 放置 open) の close / stale auto-report Issue の close | 候補列挙のみ (機械判定しない) | dry-run report → per-item 人間承認 → close | 不変則 7 **normal 遵守** (新たな例外なし) |

worktree ライフサイクル (失敗隔離 path の定義・パス規則・task-id 命名) は
`skills/_shared/worktree-ops.md` を参照する (本 skill 内に再定義しない。Single Canonical Source Rule)。

---

## 起動コマンド

```
/op-cleanup                          # dry-run: Tier1/Tier2 の候補を表示するだけ
/op-cleanup --apply                  # Tier1 の候補を表示 → ユーザー承認 → 削除実行 (Tier2 は人間 gate)
/op-cleanup --older-than 14          # grace period を 14 日に変更 (デフォルト: 7 日)
/op-cleanup --tier tier1             # Tier1 のみ実行 (worktree/残骸のみ)
/op-cleanup --tier tier2             # Tier2 のみ実行 (PR/Issue 候補表示 + 承認)
/op-cleanup --older-than 3 --apply   # grace 3 日、Tier1 機械削除
```

---

## 実行モード表

| オプション | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| *(なし)* | — | — | dry-run: Tier1/Tier2 の候補を表示、削除・close はしない |
| `--apply` | flag | false | Tier1: ユーザー承認後に削除実行。Tier2: per-item 人間承認後に close |
| `--older-than <N>` | integer | `7` | grace period (mtime / 起票日からの経過日数、単位: 日) |
| `--tier <tier>` | enum | `all` | `all` / `tier1` / `tier2` で対象 tier を絞る |
| `--dry-run` | flag | true | 明示的 dry-run (デフォルト動作と同じ) |

---

## 参照ドキュメント

| ファイル | 役割 | バージョン要件 |
|---------|------|--------------|
| `skills/_shared/worktree-ops.md` | worktree ライフサイクル / 失敗隔離 path の正本 | `(>=2)` |
| `skills/_shared/runtime-contract.md` | runtime spawn 境界 / merge-blocking state | `(>=2)` |
| `skills/_shared/version-check.md` | schema_version pin チェック手順 | `(>=3)` |
| `docs/adr/0003-op-sweep-skill.md` | op-sweep 設計判断 / 不変則 7 例外宣言の前例 | — |
| `docs/adr/0006-op-cleanup-skill.md` | op-cleanup 設計判断 / two-tier 責務分離 (Accepted) | — |
| `docs/adr/0002-op-skill-branch-naming.md` | auto/* branch 命名統一規約 (op-sweep 境界の前提) | — |

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
   → uncommitted changes がある場合は warning を表示 (cleanup 対象は別資産なので続行可)

3. git remote 確認
   $ git remote -v
   → origin が設定されていない場合は Tier2 (PR/Issue) をスキップする旨を表示

4. repo 名の確認 (失敗 worktree パスの <repo-name> 解決)
   $ basename $(git rev-parse --show-toplevel)

5. _shared/*.md schema_version チェック (version-check.md >=3 に従う)
   → 参照ドキュメント節の (>=N) 条件を Read で確認、mismatch は warning 表示
```

---

## フェーズ1: 候補列挙

### Tier1 (失敗 worktree / 残骸) — read-only

```bash
# op-tools primitive (op cleanup worktree-candidates) で候補を取得 (別 Issue で実装予定)
# primitive 未実装時は bash 代替:

REPO=$(basename "$(git rev-parse --show-toplevel)")
FAILED_DIR="${HOME}/cwork/worktrees-failed/${REPO}"
OLDER_THAN="${OLDER_THAN:-7}"
CUTOFF=$(date -d "-${OLDER_THAN} days" +%s 2>/dev/null || date -v "-${OLDER_THAN}d" +%s)

if [ -d "${FAILED_DIR}" ]; then
  find "${FAILED_DIR}" -maxdepth 1 -mindepth 1 -type d | while read -r dir; do
    mtime=$(stat -c %Y "$dir" 2>/dev/null || stat -f %m "$dir")
    if [ "$mtime" -lt "$CUTOFF" ]; then
      echo "CANDIDATE: $dir ($(( ($(date +%s) - mtime) / 86400 )) 日経過)"
    else
      echo "PROTECTED: $dir (grace period 内)"
    fi
  done
else
  echo "失敗 worktree ディレクトリ未存在: ${FAILED_DIR}"
fi
```

> op-tools primitive `op cleanup worktree-candidates` が実装された後は、
> そちらを優先して使用する (op-sweep が `op branch sweep-candidates` を使うのと同型)。

### Tier2 (stale PR / stale auto-report Issue) — read-only

```bash
# stale PR 候補: auto/* ブランチが head の open PR のうち、
#   - reviewed_head_sha と現在の head SHA が乖離しているもの
#   - updatedAt が古いもの (--older-than 閾値を超えるもの)
OLDER_DATE=$(date -d "-${OLDER_THAN:-7} days" +%Y-%m-%d 2>/dev/null \
             || date -v "-${OLDER_THAN:-7}d" +%Y-%m-%d)

gh pr list --state open --json number,title,headRefName,updatedAt,url \
  --jq ".[] | select(.headRefName | startswith(\"auto/\")) \
           | select(.updatedAt < \"${OLDER_DATE}\")"
```

```bash
# stale auto-report Issue 候補: op-source: op-scan / op-patrol / op-report 由来の
#   open Issue で、updatedAt が閾値より古いもの
gh issue list --state open \
  --label "op-source" \
  --json number,title,updatedAt,url \
  --jq ".[] | select(.updatedAt < \"${OLDER_DATE}\")"
```

> Tier2 は候補を **表示するだけ**。close コマンドは実行しない。
> `op cleanup pr-candidates` / `op cleanup issue-candidates` primitive は別 Issue で実装予定。

---

## フェーズ2: 候補表示 + ユーザー承認 gate

```
1. フェーズ1 の結果を分類して表示:

   === Tier1: 失敗 worktree / 残骸 ===

   削除候補:
   ~/cwork/worktrees-failed/op-skill/feat-xxx-20260610-120000/ (12 日経過)
   ~/cwork/worktrees-failed/op-skill/fix-yyy-20260611-093000/ (11 日経過)

   保護中 (skip):
   ~/cwork/worktrees-failed/op-skill/docs-zzz-20260618-180000/ (3 日経過、grace 内)

   === Tier2: stale PR / Issue (候補のみ、close は per-item 承認) ===

   stale PR:
   #701  feat: xxx (8 日間更新なし)  https://github.com/.../701
   #698  fix: yyy  (12 日間更新なし) https://github.com/.../698

   stale auto-report Issue:
   #631  [op-scan] zzz の問題 (10 日間更新なし) https://github.com/.../631

2. dry-run の場合 (--apply なし):
   「上記が候補です。削除・close するには --apply を付けて再実行してください。」と表示して終了。
   「auto/* branch の掃除が必要な場合は /op-sweep を実行してください。」を併記する。

3. --apply の場合:
   Tier1 と Tier2 で別の承認フローを実行 (次フェーズ参照)。
   候補が 0 件: 「掃除候補はありませんでした。」と表示して終了。
```

---

## フェーズ3a: Tier1 apply (機械削除)

```
「上記 N 件の失敗 worktree を削除します。よろしいですか？ [y/N]」と確認を求める。
- y: 一括削除を実行する
- N または Enter (デフォルト): 「Tier1 をキャンセルしました。」と表示して Tier2 へ進む
```

```bash
# op-tools primitive (op cleanup worktree) が実装された後はそちらを使用。
# 暫定 bash 代替:

REPO=$(basename "$(git rev-parse --show-toplevel)")
FAILED_DIR="${HOME}/cwork/worktrees-failed/${REPO}"
OLDER_THAN="${OLDER_THAN:-7}"
CUTOFF=$(date -d "-${OLDER_THAN} days" +%s 2>/dev/null || date -v "-${OLDER_THAN}d" +%s)

find "${FAILED_DIR}" -maxdepth 1 -mindepth 1 -type d | while read -r dir; do
  mtime=$(stat -c %Y "$dir" 2>/dev/null || stat -f %m "$dir")
  if [ "$mtime" -lt "$CUTOFF" ]; then
    rm -rf "$dir"
    echo "削除: $dir"
  fi
done
```

> 削除事故時の復元: 失敗 worktree の内容は branch `auto/<task-id>` に push 済のことが多い。
> `git reflog` または GitHub UI の "Restore branch" (90 日以内) で復元可能。

---

## フェーズ3b: Tier2 apply (per-item 人間承認)

```
Tier2 は候補ごとに承認を求める。一括 close は絶対に行わない。

PR/Issue ごとに:
  「PR #701 を close しますか？」
  「  タイトル: feat: xxx」
  「  最終更新: 8 日前」
  「  URL: https://github.com/.../701」
  「  [y/N/s(kip)]: 」

- y: close 実行
    $ gh pr close 701 --comment "長期放置のため op-cleanup でクローズ。再開時は Issue を再開してください。"
- N: close しない (保留)
- s: 残りをすべてスキップして終了

Issue についても同様の per-item 確認を行う。
```

> **Tier2 の機械 close は絶対禁止**。
> 「grace period が長ければ auto close してよい」という解釈を認めない (ADR-0006 判断 B 却下理由)。
> 判断を要する資産は、どれだけ放置されていても人間が close を決定する。

---

## フェーズ4: 結果報告

```
=== op-cleanup 実行結果 ===

Tier1 (失敗 worktree 削除):
  削除完了: N 件
    - ~/cwork/worktrees-failed/op-skill/feat-xxx-20260610-120000/
  失敗 / スキップ: M 件
    - ~/cwork/worktrees-failed/op-skill/docs-zzz-20260618-180000/ [grace 内]

Tier2 (stale PR / Issue close):
  close 完了: K 件
    - PR #701 feat: xxx
  スキップ / 保留: L 件
    - PR #698 fix: yyy (スキップ)
    - Issue #631 (N を選択)

auto/* branch の残存が気になる場合:
  → /op-sweep で auto/* branch を掃除してください。

===========================================
```

dry-run の場合:

```
=== op-cleanup dry-run 結果 ===

Tier1 (失敗 worktree) 削除候補: N 件
  - ~/cwork/worktrees-failed/op-skill/feat-xxx-20260610-120000/ (12 日経過)

保護中 / skip: M 件
  - ~/cwork/worktrees-failed/op-skill/docs-zzz-20260618-180000/ [grace 内]

Tier2 stale PR 候補: K 件
  - PR #701 feat: xxx (8 日間更新なし)

Tier2 stale auto-report Issue 候補: L 件
  - Issue #631 [op-scan] zzz の問題 (10 日間更新なし)

実際に実行するには: /op-cleanup --apply
===========================================
```

---

## 安全実行ルール

### Tier1 保護条件 (削除しない)

以下の条件を **いずれか 1 つ** 満たす失敗 worktree は削除しない:

| # | 条件 | 確認方法 |
|---|------|---------|
| 1 | `~/cwork/worktrees-failed/` 配下ではない | パス確認 |
| 2 | mtime が grace period 以内 (デフォルト 7 日) | `stat` で mtime 確認 |
| 3 | ディレクトリが現在 open PR で参照中 | `gh pr list --state open` で branch 確認 |

> worktree パス規則 (`~/cwork/worktrees-failed/<repo-name>/<task-id>-<timestamp>/`) は
> `skills/_shared/worktree-ops.md` が正本。本 skill では再定義しない。

### Tier2 原則 (機械 close 禁止)

- open PR / Issue の close は **必ず per-item 人間承認** を経る
- grace period は「候補に挙げる閾値」のみ (close の根拠にはならない)
- 「まだ有効かもしれない」 finding / review 途中 PR を消す事故を構造的に防ぐ

### 削除事故時の復元方法

| 対象 | 復元方法 |
|------|---------|
| 失敗 worktree (Tier1) | branch `auto/<task-id>` が push 済なら `git checkout` で再生成可能 |
| 失敗 worktree (push 前) | 削除前の `git stash` / `git bundle` を推奨 (--apply 前に表示) |
| close した PR (Tier2) | GitHub UI の "Reopen" または `gh pr reopen <number>` |
| close した Issue (Tier2) | GitHub UI の "Reopen" または `gh issue reopen <number>` |

---

## op-tools primitive 化 (別 Issue で段階実装)

ADR-0006 に従い、以下の read-only primitive を op-tools に外出しする (本 skill の bash 代替を置換する):

| primitive | 用途 | 状態 |
|-----------|------|------|
| `op cleanup worktree-candidates` | 失敗 worktree の候補列挙 (read-only) | 別 Issue で実装予定 |
| `op cleanup worktree-apply` | 失敗 worktree の機械削除 (Tier1 apply) | 別 Issue で実装予定 |
| `op cleanup pr-candidates` | stale PR の候補列挙 (read-only) | 別 Issue で実装予定 |
| `op cleanup issue-candidates` | stale auto-report Issue の候補列挙 (read-only) | 別 Issue で実装予定 |

> apply primitive は Tier1 (worktree 削除) のみ。Tier2 の close は人間承認後に
> `gh pr close` / `gh issue close` の既存コマンドを使う (op-cleanup 専用 apply primitive を作らない
> = 機械 close を構造的に防ぐ)。
>
> op-tools primitive が実装された後は本 SKILL.md の bash フェンスを CLI 化する
> (`op-tools/docs/implementation-order.md` の wave に従う)。

---

## 定期実行 (schedule skill による自動化) — option

`schedule` skill で定期的に dry-run を自動実行し、候補を報告させることは option として記録する。
Tier1 の `--apply` を自動化することは **推奨しない** (うっかり削除防止)。
Tier2 の自動 close は **禁止** (ADR-0006 判断 B 却下理由、不変則 7 normal 遵守)。

設定例 (dry-run 候補通知のみ):

```
/schedule "毎週月曜 AM 9:00 に op-cleanup (dry-run) を実行"
cron: "0 9 * * 1"
command: /op-cleanup
```
