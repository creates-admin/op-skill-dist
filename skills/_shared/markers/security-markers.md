<!--
schema_version: 1
last_breaking_change: 2026-05-06
notes: v1 (2026-05-06) — Marker schema 分割 (followup #20) で `pr-templates.md` から
       security 系 marker (`op-security-post-check` / `op-security-requires-aux-post-check`) の
       detailed schema を切り出した正本ファイル。共通 post-check meta (`op-post-check-meta`) は
       `post-check-markers.md` を参照。
       marker 名 / owner / consumer / core meaning は引き続き `labels-and-markers.md` が正本。

機能概要:
  security-expert が apply 後に出力する post-check marker の detailed schema を集約する。
  usable_security / threat_model 拡張フィールド、aux post-check 連携 (UI / workflow 影響時の
  ux-ui-audit-expert spawn)、`needs_human_decision` 判定の semantics を含む。

作成意図:
  pr-templates.md に分散していた security domain 固有の post-check schema を独立した正本に切り出す
  (Single Canonical Source Rule)。op-merge gate 14〜18 / op-run のフェーズ 3.5-B が参照する
  field 仕様を 1 箇所に集約する。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Post-check / Gate Markers 節が正本。
  - 共通 metadata (post_check_expert / post_check_result / post_checked_head_sha / post_check_round)
    は `post-check-markers.md` を参照。本ファイルは security 固有フィールドのみを定義する。
  - bash gh コマンドや PR comment 本文の具体例は `pr-templates.md` を参照する。
-->

# Security Markers — Detailed Schema

security-expert が apply 後に出力する post-check marker の detailed schema 正本。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Post-check / Gate Markers** 節が canonical。

共通 post-check metadata (`post_check_expert` / `post_check_result` / `post_checked_head_sha` /
`post_check_round`) の schema は `skills/_shared/markers/post-check-markers.md` を参照。本ファイルは
**security 固有フィールド** (usable_security / threat_model / aux post-check 連携) の正本。

PR comment / bash gh HEREDOC 形式の実テンプレートは `skills/_shared/pr-templates.md` の
「op-run: Security Post-check Result」節を参照する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` |
| 共通 post-check metadata block | `skills/_shared/markers/post-check-markers.md` |
| security-expert の post-check 8 観点 / threat_model / usable_security 方法論 | `skills/expert-security/SKILL.md` および `skills/expert-security/references/post-check-policy.md` / `report-schema.md` |
| op-merge gate 14〜18 (security 影響 PR の post-check 通過判定) | `skills/op-merge/SKILL.md` |
| op-run フェーズ 3.5-B (apply 後 security post-check spawn) | `skills/op-run/SKILL.md` |
| Needs Human Decision の構造化 schema | `skills/_shared/invocation-mode.md` |
| PR comment テンプレ (bash gh HEREDOC) | `skills/_shared/pr-templates.md` |

---

## `<!-- op-security-post-check -->` block schema

security domain finding の post-check 結果を表現する marker。直後に `<!-- op-post-check-meta -->`
を並べて、共通フィールド + security 固有フィールドを 1 ブロックで出力する。

### 出力構造

```text
<!-- op-security-post-check -->
<!-- op-post-check-meta -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
audited_at: <ISO8601>
auditor: security-expert
post_check_expert: security-expert
post_check_result: pass | pass_with_notes | block | needs_human_decision
post_checked_head_sha: <sha>
post_check_round: <integer>
blocking_count: <BLOCK 時の Required Changes 件数 (0 なら 0)>
notes_count: <PASS_WITH_NOTES 時の Notes 件数 (0 なら 0)>

security_result: pass | block
finding_resolved: true | false
new_attack_surface_introduced: true | false
scope_out_violation: true | false
secret_or_path_leak_detected: true | false

workflow_preservation_result: pass | block | not_applicable
legitimate_workflow_preserved: true | false
ux_impact: none | low | medium | high
affected_user_capability: <CSV (例: save_as,open_file,export)>

requires_aux_post_check: true | false
aux_post_check_experts: <CSV (例: ux-ui-audit-expert) | none>
aux_post_check_reason: <短い理由 | empty>
aux_post_check_status: not_required | required_pending | pass | block | skipped | stale
<!-- /op-post-check-meta -->
```

### 共通 post-check meta フィールド

`post_check_expert` / `post_check_result` / `post_checked_head_sha` / `post_check_round` の semantics は
`skills/_shared/markers/post-check-markers.md` を参照。本ファイルでは **security 固有値** のみ追加で説明する。

### header 系フィールド

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `audit_result` | enum | ✓ | `PASS` / `PASS_WITH_NOTES` / `BLOCK` (UPPER CASE)。`post_check_result` (lower_case) と意味的に整合させる |
| `audited_at` | string | ✓ | ISO8601 (判定確定時刻) |
| `auditor` | string | ✓ | 必ず `security-expert` |
| `blocking_count` | integer | ✓ | `BLOCK` 時の Required Changes 件数 (0 なら 0) |
| `notes_count` | integer | ✓ | `PASS_WITH_NOTES` 時の Notes 件数 (0 なら 0) |

### `audit_result` ↔ `post_check_result` の対応

| `audit_result` | `post_check_result` |
|---|---|
| `PASS` | `pass` |
| `PASS_WITH_NOTES` | `pass_with_notes` |
| `BLOCK` | `block` |
| (NEEDS_HUMAN_DECISION 表記は本文側のみ) | `needs_human_decision` |

`post_check_result == needs_human_decision` の場合、`audit_result` は `BLOCK` を入れ、判定本文 +
`needs_human_decision` YAML block で人間判断要素を構造化する (詳細は `invocation-mode.md`)。

---

## Security 固有フィールド

### Threat model 系

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `security_result` | enum | ✓ | `pass` / `block` (security 判定の本体) |
| `finding_resolved` | boolean | ✓ | 元 finding (Issue success_criteria) が解消されたか |
| `new_attack_surface_introduced` | boolean | ✓ | 修正で別の攻撃面が増えていないか |
| `scope_out_violation` | boolean | ✓ | Issue scope_out 違反 (redesign 混入) があるか |
| `secret_or_path_leak_detected` | boolean | ✓ | エラーメッセージ / ログ等で secret / path が漏洩していないか |

### Usable security 系 (workflow preservation)

security mitigation が **正当なユーザー操作** を破壊していないかを判定するフィールド。
capability 全体禁止 (例: `save_as` を完全削除) のような **過剰封鎖** を防ぐ。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `workflow_preservation_result` | enum | ✓ | `pass` / `block` / `not_applicable` |
| `legitimate_workflow_preserved` | boolean | ✓ | 正当な user capability が維持されているか |
| `ux_impact` | enum | ✓ | `none` / `low` / `medium` / `high` |
| `affected_user_capability` | string (CSV) | ✓ | 影響を受けた capability 一覧 (例: `save_as,open_file,export`)。なければ空 |

### `workflow_preservation_result` の判定ルール

| 値 | 条件 |
|---|---|
| `pass` | 元の workflow が維持され、capability 全体禁止が発生していない |
| `block` | capability 全体禁止 / 出力先固定 / UI 削除など、ユーザー操作の本質を破壊する mitigation が混入 |
| `not_applicable` | mitigation が UI / workflow に触れない (例: pure backend validation の追加のみ) |

### Aux post-check 連携 (UI / workflow 影響時の ux-ui-audit-expert spawn)

security mitigation が UI / workflow に影響する場合、op-run が auxiliary post-check として
ux-ui-audit-expert を追加 spawn する。その判定 hint と実行状態を以下のフィールドで記録する:

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `requires_aux_post_check` | boolean | ✓ | aux post-check が必要かどうか。`true` ならば op-run が ux-ui-audit-expert を spawn する |
| `aux_post_check_experts` | string (CSV) | ✓ | aux 担当 expert (現在は `ux-ui-audit-expert` 一択)。不要なら `none` |
| `aux_post_check_reason` | string | △ | 短い理由 (UI 文言変更 / 出力先制限 等)。`requires_aux_post_check: false` のときは empty |
| `aux_post_check_status` | enum | ✓ | aux post-check の実行状態 (下記 state machine 参照) |

### `aux_post_check_status` state machine

```
not_required ─────────────────────────────────────────────────► (UI 影響なし)
              │
              └─ (UI 影響あり、aux 必要)
                     ↓
              required_pending ─────► pass
                     │       │
                     │       └────► block
                     │
                     ├──────────► skipped (spawn 失敗 / planned)
                     │
                     └──────────► stale (head sha が進んだ)
```

| 状態 | 意味 | op-merge gate 18 の判定 |
|---|---|---|
| `not_required` | UI / workflow 影響なし。aux 不要 | 通過 |
| `required_pending` | security post-check 完了、ux-ui-audit-expert post-check 待ち | 不通過 (要 aux post-check) |
| `pass` | aux post-check 通過 | 通過 |
| `block` | aux post-check で BLOCK | 不通過 (apply 担当 expert 再 spawn) |
| `skipped` | aux post-check spawn 失敗 / planned skip | 不通過 (再実行 or manual override 必要) |
| `stale` | aux post-check 完了後に commit が積まれた | 不通過 (再 aux post-check 必要) |

詳細な遷移ルールと op-merge の gate 14〜18 は `skills/op-merge/SKILL.md` および
`skills/expert-security/references/post-check-policy.md` を参照。

---

## 観点別チェック (8 観点)

security post-check は以下 8 観点を必ず確認する (PR comment 本文の表に記述):

| # | 観点 | 紐付くフィールド |
|---|---|---|
| 1 | 元 finding の解消 (Issue success_criteria 達成) | `finding_resolved` |
| 2 | 修正で別の攻撃面が増えていないか | `new_attack_surface_introduced` |
| 3 | 入力検証 (path / encoding / canonicalization / size limit) | (本文記述のみ) |
| 4 | 認可 / capability の境界 (IPC / shell / file IO) | (本文記述のみ) |
| 5 | エラーパスでの情報漏洩 / 失敗時挙動 (TOCTOU / privilege drop) | `secret_or_path_leak_detected` |
| 6 | Issue scope_out 違反 (redesign の混入) | `scope_out_violation` |
| 7 | 正当なユーザー操作維持 | `legitimate_workflow_preserved` / `workflow_preservation_result` |
| 8 | UX/UI auxiliary post-check 必要性 | `requires_aux_post_check` / `aux_post_check_*` |

詳細な判定基準と各観点で見るべき具体項目は `skills/expert-security/SKILL.md` および
`skills/expert-security/references/post-check-policy.md` を正本とする。

---

## `post_check_result == needs_human_decision` の使用条件

security domain で **UX impact high** / **capability 全体禁止が必要** など、自動判断が
不能な場合に使用する 4 番目の result。

### 使用条件 (AND)

- security risk と usable workflow のトレードオフが高い
- 自動判断 (`pass` / `block`) で結論を出すと user 操作を不当に破壊する / 攻撃を残す のいずれか
- 構造化された options で人間判断材料を提示できる

### op-run の動作

- `pro-security-needs-fix` + `needs:human-decision` ラベルを PR に付与
- 人間判断待ち (op-merge は merge 不可)
- 本文に `needs_human_decision` YAML block を埋め込む (`invocation-mode.md` の正規 schema)

詳細は:
- `skills/expert-security/references/post-check-policy.md`
- `skills/_shared/invocation-mode.md`

---

## `<!-- op-security-requires-aux-post-check -->` marker schema

security finding 起票時に **UI / workflow 影響を伴う mitigation を予告する** hidden marker。
Issue 本文冒頭の hidden marker block に埋め、op-run の auxiliary post-check spawn 判定の hint にする。

### 使用方法

Issue 本文の hidden marker block 内に、`op-domain == security` の Issue でのみ次のいずれかの値で出力:

```text
<!-- op-security-requires-aux-post-check: false -->
<!-- op-security-requires-aux-post-check: ux-ui-audit-expert -->
```

| 値 | 意味 |
|---|---|
| `false` | UI / workflow 影響なし (apply 後の security post-check で実 mitigation 内容を見て確定) |
| `ux-ui-audit-expert` | UI / workflow 影響を伴う mitigation を想定。op-run は apply 後の post-check で ux-ui-audit-expert auxiliary post-check を spawn |

### 制約

- `op-domain == security` の Issue でのみ使用する。他 domain では出力してはならない。
- 通常は `false` で起票し、apply 後の security post-check で実 mitigation 内容を見て
  `requires_aux_post_check` フィールドで確定する (本 marker は **予告 hint** にすぎない)。
- 本 marker が立っているのに aux post-check が `required_pending` / `block` / `skipped` / `stale` /
  forge のままでは merge 不可 (op-merge gate 18)。

---

## Lint Regression Examples

`op-tools/crates/op-core/tests/prose_examples.rs` が parse + lint clean を assert する canonical。
Rust struct schema 変更時に同期する (silent fork 防止、ADR-0003)。

<!-- op-security-post-check -->
audit_result: PASS
audited_at: 2026-05-09T10:00:00Z
auditor: security-expert
post_check_expert: security-expert
post_check_result: pass
post_checked_head_sha: 1234567890abcdef1234567890abcdef12345678
post_check_round: 1
blocking_count: 0
notes_count: 0
security_result: pass
finding_resolved: true
new_attack_surface_introduced: false
scope_out_violation: false
secret_or_path_leak_detected: false
workflow_preservation_result: not_applicable
legitimate_workflow_preserved: true
ux_impact: none
affected_user_capability:
requires_aux_post_check: false
aux_post_check_experts: none
aux_post_check_reason:
aux_post_check_status: not_required
