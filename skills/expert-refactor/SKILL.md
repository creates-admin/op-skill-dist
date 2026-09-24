---
name: expert-refactor
description: refactor-expert に preload される方法論。
---

# expert-refactor: refactor-expert の知識ベース

挙動を変えずに、構造的負債を減らす。

```text
安全に直せる構造負債は直す
一度で直せない負債は分解して追跡する
境界判断が必要なものは人間に返す
新規悪化だけは止める
```

### mode 別必読 references

| mode / 状況 | Read する references |
|---|---|
| scan (op-scan) | `refactor-taxonomy.md` + `scattered-tokens.md` |
| patrol (op-patrol) | `structure-health.md`「Patrol Sampling 優先度」節 |
| apply (op-run / op-prune) | `verification-ladder.md` |
| `architecture_debt` / `staged_refactor` を返す | `architecture-debt.md` |
| canonical doc (markdown) の圧縮・再構成 | `doc-refactor-guard.md` |
| post_check_expert の選択 | `post-check-policy.md` |
| ディレクトリ構造・依存方向 | `directory-structure.md` |

React / Go は `scope_in` に明示された場合か op-run の変更差分に含まれる場合のみ対象にする。

---

## Severity Policy (報告閾値)

報告ルールは `_shared/severity-rubric.md`「scan 報告ルール (共通)」節 (scan / patrol 前に Read)。

```text
行数 = scan trigger
責務混在 = Issue 化の根拠
```

### Critical (限定的)

- public API / IPC contract / serialized format / DB schema の同期境界が現に崩壊している (build 破壊か実行時 silent 破壊を確認済み)
- ビルド破壊または実行時破壊に直結している循環依存
- file IO / permission / shell 周辺の構造悪化が進行中で、現バージョンの本番 build に影響している

「悪化のリスクがある」だけでは Critical にしない。

### High (主たる起票対象)

- 同じ意味の literal / token / path / key が 3 箇所以上に散り、2 つ以上の layer / module / feature を跨ぐ
- god function / large file / large component が複数責務を抱え、変更理由が複数化している
- import 方向の逆流 / shared が domain を import / utils 配下に feature 固有処理が漏れている
- active path と紛らわしい dead code が残り、新規実装が誤再利用するリスクがある
- 既存 architecture_debt の腐敗度が上がっている (条件は `architecture-debt.md`「Severity Exception」)

好み / formatter 問題 / 2 箇所程度の軽微な重複は報告しない。

### blocking フラグ (severity と独立)

以下のいずれかで `blocking: true` + `blocking_reason` を付ける。Critical = blocking ではない。

- 新規変更 (今回の scan 対象 PR / 変更ファイル) が既存 architecture_debt を悪化させている (今回の変更起点の判定。過去回数の推測ではない)
- public API / IPC contract / serialized format / file location に近接する変更が refactor PR 内で進行し、scope_out を踏もうとしている
- Critical 級だが、まず本 PR を止めて人間判断を仰ぎたい

---

## Modes

### scan / patrol モード

- 出力は「Canonical Schema Contract」節。`bulk_group` 必須、subtype は必要に応じて。
- 一度で直せない巨大負債は捨てず `architecture_debt` finding にする。返す前に `references/architecture-debt.md` を Read する。
- patrol では巡回対象を決める前に `references/structure-health.md`「Patrol Sampling 優先度」節を Read する。

### apply モード (op-run / op-prune、worktree 隔離)

- Issue の `scope_in` (op-prune では承認 items) に閉じる。仕様変更 / bug fix / performance 最適化 / feature 実装を混ぜない。
- 変更前に Grep で参照元を repo 全体から確認する。
- 小さな単位で抽出・移動・統合する。既存テストを維持し、新規テスト設計は test-expert に委ねる。
- 保護対象は「Apply Report」節の `contract_preservation`。UI 見た目 / UX flow / DOM 構造 / props / emit / class / key / focus / state も変えない。
  file location の変更が避けられない場合は移動せず `staged_refactor` で計画化する。
- 1 PR は失敗時に 1 revert で戻せる単位にする: commit は 1〜3 程度、変更ファイルは責務境界の単位に揃え複数 boundary を跨ぐ移動をしない、
  staged_refactor の stage を連続実行して 1 PR にしない。
- 検証は `references/verification-ladder.md`。検証不能な箇所は `residual_risk` に書く。
- コメントは `_shared/project-profile.md`「コメント作法」(構造変更の意図は commit message に書く)。directory 階層を不必要に深くしない。

#### Mechanical Refactor Guard (apply 時の禁止事項)

- grep 結果を見ずに一括置換する
- 同名 literal をすべて同じ意味とみなす
- 完全一致だけで機械的に置換する
- 型が通ることだけを根拠に責務を移動する
- public export を整理目的で削除する
- import path の循環確認なしにファイル移動する
- Rust module 分割時に visibility を広げてごまかす
- Vue / Flutter component 分割時に DOM 構造 / props / emit / class / key / focus / state や visual design / UX flow を変える
  (確認観点は expert-ux-ui-audit skill の `references/a11y-checklist.md`)

#### Doc 圧縮・再構成時の安全ガード

canonical doc (`skills/**/*.md` / `docs/**` / `agents/*.md` 等) を圧縮・再構成する refactor では、編集前に `references/doc-refactor-guard.md` を Read する。

---

## Canonical Schema Contract

scan / patrol の出力は `_shared/expert-spawn.md`「scan 出力 envelope 契約」節の envelope (`{"findings": [...]}`) で返す。
payload の正本は `op help payload refactor-finding --json`。

- domain: `"refactor"` / recommended_runner: `"refactor-expert"`
- post_check_expert の選択基準は `references/post-check-policy.md`
- fingerprint 文字列は finding に埋めない。`files` / `symbols` / `bulk_group` / `affected_paths` を正確に埋めれば op-scan / op-patrol が CLI で生成する

---

## Refactor Execution Control

refactor Issue では Issue 本文の `## 🧱 Refactor Execution Control` 節 (`_shared/pr-templates.md`) を source of truth とする。本節はその意味と実行ルールの正本。

### Issue 本文 / scan finding から確認する項目

- `finding_type` ∈ `immediate_refactor` / `staged_refactor` / `architecture_debt` / `needs_spec_decision`
- `execution_mode` ∈ `direct_apply` / `staged_refactor` / `needs_human_decision`
- `direct_apply_safe` (boolean)
- `safe_first_step` / `proposed_stages` (architecture_debt / staged_refactor で必須)
- `forbidden_stage_actions` (本 PR で禁止する具体行為)
- `blocking` / `blocking_reason`
- `needs_human_decision` (`required: true` なら apply せず block 全体を完了報告に返す。refactor で多用する `decision_type` は `scope` / `behavior` / `boundary` / `spec`)
- `human_decision_points` (判断点の補助配列)

節が無い Issue は指示書節とこの SKILL から最低限の実行制御を再構築してから着手する (推測で direct apply しない)。

### 実行ルール

| finding_type | direct_apply_safe | 本 PR で実行する |
|---|---|---|
| `immediate_refactor` | `true` | scope_in 範囲で recommendation 全体を直接適用 |
| `immediate_refactor` | `false` | 着手しない (設定不整合。`needs:triage` で人間判断) |
| `staged_refactor` | `false` | `safe_first_step` のみ |
| `architecture_debt` | `false` | `safe_first_step` のみ |
| `needs_spec_decision` | `false` | 実装せず `needs_human_decision` block (`required: true`, `decision_type: spec` または `boundary`) を返す |

`needs:human-decision-followup` ラベル付きの扱いは `architecture-debt.md`「op-run / apply での扱い」。

- 保護対象 (`contract_preservation`) を破らざるを得ない場合は実装せず `needs_spec_decision` として返す。
- `forbidden_stage_actions` を実行しない。`proposed_stages` の 2 つ目以降を実行しない (1 stage = 1 PR)。

---

## Apply Report

apply 完了報告の共通フィールドは `_shared/expert-spawn.md`「修正完了報告 schema」。refactor 固有:

- `behavior_change_claim`: `"no_behavior_change"`
- `structural_change_summary`: 構造的変更の要約 (意味レベル)
- `contract_preservation` (保護対象の正本。1 つでも true が必要なら実装せず `needs_spec_decision`):
  `public_api_changed` (trait / interface の signature・引数順・戻り値型を含む) / `serialized_format_changed` / `db_schema_changed` /
  `migration_changed` / `config_format_changed` / `ipc_contract_changed` / `tauri_command_names_changed` / `event_names_changed` /
  `permission_names_changed` / `path_values_changed` / `key_values_changed` / `file_locations_changed` / `status_values_changed` /
  `error_codes_changed` / `env_vars_changed`
- `stage_executed`: `safe_first_step` / `direct_apply` / `N/A`
- `forbidden_actions_respected`: `forbidden_stage_actions` を実行していないことの確認
- `verification_performed` / `verification_not_run` / `residual_risk`
- `recommended_post_check_expert` / `recommended_followup_experts` (`post-check-policy.md`)

scattered token の apply では、実値が変更前後で変わっていないことを明記する。
