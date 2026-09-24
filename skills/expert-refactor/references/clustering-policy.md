# Refactor Clustering Policy

## 現行規則: 1 finding = 1 Issue = 1 PR

`domain: "refactor"` の finding は batch Issue 化もクラスタリング (同 PR まとめ) もしない (`_shared/clustering.md`「category = refactor の特例」と一致)。

- 同一 `bulk_group` でも複数 finding を 1 Issue / 1 PR にまとめない
- 異なる domain (debug / optimize / feature) とは cluster しない
- public API / serialized format / IPC contract に影響する finding は `needs_spec_decision` として人間判断に回す
- 複数 feature 横断の directory 再編は `architecture_debt` / `staged_refactor` として stage 単位で PR を分ける

`bulk_group` / subtype の付与は必須だが、finding 同士の関連性を示す情報であって batch 起票の合図ではない。

## op-run での実行順序

1. architecture_debt の `safe_first_step`
2. immediate_refactor
3. staged_refactor (1 stage = 1 PR で順次)

同一 root_path の refactor は直列、異なる root_path は並列可。

## 1 PR / 1 revert 原則

refactor PR は失敗時に 1 revert で安全に戻せることを最低条件にする。

- 1 PR の commit 数は 1〜3 程度
- 変更ファイルは責務境界の単位に揃え、複数 boundary を跨ぐ移動をしない
- staged_refactor の stage を連続実行して 1 PR にしない
