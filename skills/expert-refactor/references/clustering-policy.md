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

## Current Phase Guard (重要 - 最初に読む)

**Phase 1 では、本ドキュメントの Basic Rule / Good Clustering Examples は
op-run の同一 PR クラスタリングには適用しない。**
現行運用は **1 refactor finding = 1 Issue = 1 PR を厳守** する
(`_shared/clustering.md` の「category = refactor の特例」および本ドキュメント下部
「Phase 1: batch 全面禁止」と一致)。

本章の clustering 条件は、refactor finding schema に `root_path` / `rollback_unit` /
`verification_key` が正式追加された Phase 2 以降での **設計候補** として記載している
(下部「Phase 2 以降での batch 化検討」節を参照)。

Phase 1 で参照する目的:

- 「なぜ 1 finding = 1 Issue を厳守するのか」の判断基準を理解する
- finding を Issue 化する際の **同一 root_path / 同一 rollback unit / 同一 verification**
  という単位感覚を、scope_in / scope_out 設計時の参考にする

実際の op-run / op-scan 動作については、以下を必ず参照:

- `_shared/clustering.md`「category = refactor の特例 (Phase 1: 1 Issue = 1 PR を厳守 / 例外なし)」
- 本ドキュメント下部「op-scan / op-patrol の bulk Issue 化との関係 / Phase 1: batch 全面禁止」

---

## Basic Rule

refactor clustering を許可する条件 (**すべて満たす場合のみ**):

- 同一 `bulk_group`
- 同一 `root_path`
- 同一責務境界
- 同一 verification command
- 同一 rollback unit
- public API 変更なし
- serialized format 変更なし
- config format 変更なし
- migration 変更なし
- UI / backend / infra を無理に跨がない

**まとめてよい refactor は、失敗時に 1 revert で安全に戻せる単位に限る**。

---

## Good Clustering Examples

### 同じ Tauri command 群の validation 抽出

```text
target:
  - src-tauri/src/commands/report_export.rs
  - src-tauri/src/commands/report_open.rs
  - src-tauri/src/commands/report_delete.rs
bulk_group: refactor-god-function
root_path: src-tauri/src/commands/
verification: cargo check && cargo test commands
```

### 同じ Vue feature 配下の duplicated composable 統合

```text
target:
  - src/features/auth/useLogin.ts
  - src/features/auth/useLogout.ts
  - src/features/auth/useSession.ts
bulk_group: refactor-duplicate-logic
root_path: src/features/auth/
verification: vue-tsc --noEmit && vitest run features/auth
```

### 同じ Rust module 内の guard clause 化

```text
target: src-tauri/src/services/export_service.rs (1 ファイル内 5 関数)
bulk_group: refactor-god-function
root_path: src-tauri/src/services/
verification: cargo check && cargo test export_service
```

### 同じ domain type 周辺の変換関数統合

```text
target:
  - src/domain/job/converters.ts
  - src/domain/job/job_state.ts
bulk_group: refactor-duplicate-logic
root_path: src/domain/job/
verification: vue-tsc --noEmit && vitest run domain/job
```

### 同じ feature 内の path literal を feature-local contract に寄せる

```text
target:
  - src/features/report/export.ts
  - src/features/report/open.ts
  - src/features/report/list.ts
bulk_group: refactor-scattered-tokens
subtype: paths
root_path: src/features/report/
verification: vue-tsc --noEmit && grep "reports/html" remaining count
```

---

## Bad Clustering Examples

### Rust backend と Vue UI の同時大規模整理

```text
理由: rollback unit が異なる、verification が分かれる、影響範囲が広すぎる
対処: 別 Issue / 別 PR に分割
```

### file IO と UI state の同時整理

```text
理由: file IO は security-expert / compatibility-expert post-check が必要、
     UI state は ux-ui-audit-expert post-check が必要 → 複数 post-check 必要 = 分割候補
対処: 2 つの Issue に分割し、それぞれ単一 post-check で完結させる
```

### refactor と bug fix の混在

```text
理由: refactor-expert の不変則 (no-behavior-change) を破る
対処: bug fix は debug-expert に別 Issue 化
```

### refactor と performance optimization の混在

```text
理由: optimize-expert は Before/After benchmark が必要、refactor は no-behavior-change
対処: optimize は別 Issue 化 (op-scan の domain=optimize で起票)
```

### public API / serialized format / DB schema に影響する変更

```text
理由: 仕様変更を伴う、refactor-expert の範囲外
対処: needs_spec_decision finding として返し、人間判断を仰ぐ
```

### directory structure を複数 feature 横断で一気に変える

```text
理由: 1 revert で戻せない、import 影響範囲が広すぎる
対処: staged_refactor / architecture_debt として記録し、stage 単位で PR 分割
```

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

Phase 1 ではすべての refactor finding を **1 finding = 1 Issue** にする。

### Phase 2 以降での batch 化検討 (現在は適用しない)

将来 batch 化する場合は、refactor finding schema に以下を追加する:

```json
{
  "root_path": "src/features/report",
  "rollback_unit": "report-path-contract",
  "verification_key": "vue-tsc-and-report-path-grep"
}
```

これらが **すべて完全一致** する場合のみ batch 化を許可する設計を検討する。
Phase 1 では本フィールドは導入せず、batch 化も行わない。

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
