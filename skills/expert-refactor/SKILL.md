---
name: expert-refactor
description: refactor-expert agent の方法論教科書。挙動非変更を絶対条件として、散乱 token / god function / large file / large component / 責務境界混線 / ディレクトリ構造劣化 / 依存逆流 / 重複ロジック / dead code / architecture debt の検出・段階改善・追跡手順とパターンを集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
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
| apply (op-run) | `verification-ladder.md` + `report-schema.md` |
| `architecture_debt` / `staged_refactor` を返す | `architecture-debt.md` |
| canonical doc (markdown) の圧縮・再構成 | `doc-refactor-guard.md` |
| post_check_expert の選択 | `post-check-policy.md` |
| refactor finding の batch / cluster 判断 | `clustering-policy.md` |
| ディレクトリ構造・依存方向 | `directory-structure.md` |

---

## Technology Profile

- 通常対象: Rust / Tauri v2 / Vue 3 (Composition API + Pinia + Vuetify) / TypeScript / Dart / Flutter。
- React / Go: `scope_in` に明示された場合か op-run の変更差分に含まれる場合のみ対象。それ以外は `ignored_noise`。

---

## Severity Policy (報告閾値)

報告は **Critical / High のみ**。共通骨格は `_shared/severity-rubric.md`「scan 報告ルール (共通)」節 (scan / patrol 前に Read)。

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

### blocking フラグ (severity と独立)

以下のいずれかで `blocking: true` + `blocking_reason` を付ける。Critical = blocking ではない。

- 新規変更 (今回の scan 対象 PR / 変更ファイル) が既存 architecture_debt を悪化させている
- public API / IPC contract / serialized format / file location に近接する変更が refactor PR 内で進行し、scope_out を踏もうとしている
- Critical 級だが、まず本 PR を止めて人間判断を仰ぎたい

`blocking: true` は `op:blocking-finding` ラベルで起票され、op-run が最優先・単独で実行する。

### Medium / Low

報告しない (`ignored_noise`)。好み / formatter 問題 / 2 箇所程度の軽微な重複を含む。

---

## Modes

### scan モード (op-scan)

- Read / Grep / Glob のみ。コードを変更しない。
- 出力は「Canonical Schema Contract」節。`bulk_group` 必須、subtype は必要に応じて。
- 一度で直せない巨大負債は捨てず `architecture_debt` finding にする。

### patrol モード (op-patrol)

巡回対象を決める前に `references/structure-health.md`「Patrol Sampling 優先度」節を Read し、risk-weighted に巡回する。出力契約は scan と同じ。

### apply モード (op-run、worktree 隔離)

- Issue の `scope_in` に閉じる。仕様変更 / bug fix / performance 最適化 / feature 実装を混ぜない。
- 変更前に Grep で参照元を確認する (inbound-ref grep は repo 全体が対象)。
- 小さな単位で抽出・移動・統合する。既存テストを維持し、新規テスト設計は test-expert に委ねる。
- 変更後に verification ladder Level 0〜2 を行い、検証不能な箇所は `residual_risk` に書く。
- push / PR 作成は司令官が行う。

#### apply 時の不変則

保護対象は「Apply Report」節の `contract_preservation`。file location の変更が避けられない場合は移動せず `staged_refactor` で計画化する。
UI 見た目 / UX flow / DOM 構造 / props / emit / class / key / focus / state も変えない。

#### Mechanical Refactor Guard (apply 時の禁止事項)

- grep 結果を見ずに一括置換する
- 同名 literal をすべて同じ意味とみなす
- 完全一致だけで機械的に置換する
- 型が通ることだけを根拠に責務を移動する
- public export を整理目的で削除する
- import path の循環確認なしにファイル移動する
- Rust module 分割時に visibility を広げてごまかす
- Vue / Flutter component 分割時に DOM 構造 / props / emit / class / key / focus / state を不用意に変える
- UI component 分割時に visual design / UX flow を変える

#### Doc 圧縮・再構成時の安全ガード

canonical doc (`skills/**/*.md` / `docs/**` / `agents/*.md` 等) を圧縮・再構成する refactor では、編集前に `references/doc-refactor-guard.md` を Read する。

---

## Canonical Schema Contract

scan / patrol の出力は `_shared/expert-spawn.md`「scan 出力 envelope 契約」節の envelope (`{"findings": [...]}`) で返す。
payload の正本は `op help payload refactor-finding --json`。

- domain: `"refactor"` / recommended_runner: `"refactor-expert"`
- post_check_expert: `ux-ui-audit-expert` | `security-expert` | `null` の 3 値のみ (原則 `null`、選択基準は `post-check-policy.md`)
- `ignored_noise` は finding として返さない

---

## Refactor Execution Control

refactor Issue では Issue 本文の `## 🧱 Refactor Execution Control` 節 (`_shared/pr-templates.md`) を source of truth とする。本節はその意味と実行ルール。

### Issue 本文 / scan finding から確認する項目

- `finding_type` ∈ `immediate_refactor` / `staged_refactor` / `architecture_debt` / `needs_spec_decision`
- `execution_mode` ∈ `direct_apply` / `staged_refactor` / `needs_human_decision`
- `direct_apply_safe` (boolean)
- `safe_first_step` / `proposed_stages` (architecture_debt / staged_refactor で必須)
- `forbidden_stage_actions` (本 PR で禁止する具体行為)
- `blocking` / `blocking_reason`
- `needs_human_decision` (`_shared/invocation-mode.md` の構造化 block。`required: true` なら apply せず block 全体を完了報告に返す。
  refactor で多用する `decision_type` は `scope` / `behavior` / `boundary` / `spec`)
- `human_decision_points` (判断点の補助配列)

### 実行ルール

| finding_type | direct_apply_safe | 本 PR で実行する |
|---|---|---|
| `immediate_refactor` | `true` | scope_in 範囲で recommendation 全体を直接適用 |
| `immediate_refactor` | `false` | 着手しない (設定不整合。`needs:triage` で人間判断) |
| `staged_refactor` | `false` | `safe_first_step` のみ |
| `architecture_debt` | `false` | `safe_first_step` のみ |
| `needs_spec_decision` | `false` | 実装せず `needs_human_decision` block (`required: true`, `decision_type: spec` または `boundary`) を返す |

`needs:human-decision-followup` ラベル付きの扱いは `architecture-debt.md`「op-run / apply での扱い」。

### 不変則

- 挙動非変更。保護対象 (`contract_preservation`) を破らざるを得ない場合は実装せず `needs_spec_decision` として返す。
- `forbidden_stage_actions` を実行しない。
- `proposed_stages` の 2 つ目以降を実行しない (1 stage = 1 PR)。
- 新規変更が既存 debt を悪化させた場合は finding に `blocking: true` + `blocking_reason` を付けて返す (今回の変更起点の判定。過去回数の推測ではない)。

---

## Architecture Debt Tracking

巨大な構造負債を `ignored_noise` にしない。分類は `architecture-debt.md`「Classification」。

| finding_type | execution_mode |
|---|---|
| `immediate_refactor` | `direct_apply` |
| `staged_refactor` | `staged_refactor` |
| `architecture_debt` | `staged_refactor` |
| `needs_spec_decision` | `needs_human_decision` |

- `affected_paths` は `architecture_debt` / `staged_refactor` / `needs_spec_decision` で必須 (追跡キーの LCA 計算に使う)。
- 返す前に `references/architecture-debt.md` を Read する。
- agent が返す累積値は固定: `seen_count: 1` / `risk_trend: "stable"` / `first_detected_at = last_seen_at = 【実行日】`。
- 禁止: `seen_count >= 2` を推測で返す / `risk_trend = worsening / spreading` を確定する / 既存 Issue を読んで累積値を計算する。
- 累積値の更新と `needs:triage` 付与は op-patrol の責務。

```text
既存負債は staged / 新規悪化は block
```

---

## Verification Ladder

Level 0=静的確認 / 1=軽量静的チェック / 2=変更範囲の既存テスト / 3=統合寄り smoke / 4=重い統合検証 / 5=実機・installer・updater。
refactor-expert は 0〜2 必須。詳細は `references/verification-ladder.md`。

---

## Apply Report

apply 完了報告の共通フィールドは `_shared/apply-completion-checklist.md` / `op help payload apply-report`。refactor 固有:

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

---

## 実装完了後の code-review invoke

手順は `_shared/apply-completion-checklist.md`。skip 条件なし (apply 後は必ず invoke)。

---

## CLAUDE.md 規約との整合

共通骨格は `_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節 (apply で最初のファイルを編集する前に Read)。refactor 固有:

- refactor 後にネストを増やさない (ガード節優先)
- 構造変更の意図をコメント 1 行で書く
- directory 階層を不必要に深くしない

---

## 参照ドキュメント

| Path | 用途 |
|---|---|
| `~/.claude/skills/_shared/runtime-contract.md` | runtime spawn 境界 / apply 可否 |
| `~/.claude/skills/_shared/expert-spawn.md` | canonical schema / scan 出力 envelope / apply 入力契約 |
| `~/.claude/skills/_shared/apply-completion-checklist.md` | apply の完了手順 |
| `~/.claude/skills/_shared/common-setup.md` | Explore 委譲プロトコル (大規模 repo の広域探索) |
| `~/.claude/skills/_shared/read-economy.md` | 再 Read 抑制 (R1〜R5) |
| `~/.claude/skills/_shared/dedup-policy.md` | fingerprint / bulk fingerprint (CLI 生成) |
| expert-ux-ui-audit skill の `references/a11y-checklist.md` | component 分割時の a11y 不変確認 |

---

## Direct Expert Run (直接実行時の対話型入口)

refactor-expert agent の同名節を参照。
