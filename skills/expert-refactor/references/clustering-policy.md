# Refactor Clustering Policy

<!--
機能概要: refactor finding の clustering / 同 PR まとめ条件を定義する。
作成意図: refactor は小さく分けすぎると PR が散り、依存衝突が増える。
         逆にまとめすぎると 1 revert で安全に戻せなくなる。
         「失敗時に 1 revert で戻せる単位」を clustering の最小条件にする。
注意点: refactor と他 domain (debug / optimize / feature) を絶対に
       cluster しない。public API / serialized format / IPC contract に
       影響する変更は cluster しない。
-->

## 現行規則 (Phase 1: 1 finding = 1 Issue = 1 PR を厳守)

`domain: "refactor"` の finding は **クラスタリング (同 PR まとめ) をしない**。例外なし。
(`_shared/clustering.md`「category = refactor の特例」と一致。詳細理由は下部
「op-scan / op-patrol の bulk Issue 化との関係」節を参照)

- 同一 `bulk_group` であっても複数 finding を 1 PR にまとめない
- 異なる domain (debug / optimize / feature) とは絶対に cluster しない
- public API / serialized format / IPC contract に影響する変更を含む finding は
  `needs_spec_decision` として人間判断に回す (cluster 対象にしない)
- directory structure を複数 feature 横断で一気に変える提案は `architecture_debt` /
  `staged_refactor` として記録し、stage 単位で PR 分割する

> Phase 2 以降で `root_path` / `rollback_unit` / `verification_key` を条件にした batch 化を
> 検討する設計案 (Basic Rule / Good・Bad Clustering Examples) はここから削除した。
> 詳細は git 履歴 (本ファイルの当該コミット以前) を参照。

---

## op-scan / op-patrol の bulk Issue 化との関係

### Phase 1: batch 全面禁止

`_shared/expert-spawn.md` には「同 bulk_group 5 件以上で batch Issue」という汎用ルールがあるが、
**`domain: "refactor"` は Phase 1 では batch 化しない** (op-scan / op-patrol の特例)。

理由:

- refactor の `bulk_group` (`refactor-scattered-tokens` / `refactor-god-function` 等) は粗く、
  異なる feature / layer / rollback unit が同 bulk_group に集まりやすい
- 異なる責務境界をまたぐ batch 化は revert 不能を生む
- public API / IPC contract / serialized format / file location に近接する refactor が混入すると、
  1 PR 内の事故影響範囲が広がる

Phase 1 ではすべての refactor finding を **1 finding = 1 Issue** にする
(Phase 2 設計案は上部「現行規則」節の note の通り削除済み。git 履歴を参照)。

---

## op-run での実行順序

clustering された refactor Issue を op-run で実行する場合:

1. **architecture_debt の `safe_first_step` を最優先**
2. 次に immediate_refactor
3. staged_refactor は 1 stage = 1 PR で順次

複数 cluster を並列実行する場合:

- 同一 root_path の clusters は **直列実行** (worktree が同じになる可能性 / import 衝突)
- 異なる root_path の clusters は並列実行可

---

## 1 PR / 1 revert 原則

refactor PR は **失敗時に 1 revert で安全に戻せる** ことを最低条件にする。

- 1 PR の commit 数は 1〜3 程度に抑える
- 1 PR の変更ファイル数は責務境界の単位に揃える
- 1 PR で複数の boundary を跨ぐ移動をしない
- staged_refactor の各 stage を 1 PR にする (stage 連続実行で 1 PR にしない)
