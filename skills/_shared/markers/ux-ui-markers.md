<!--
schema_version: 2
last_breaking_change: 2026-05-17
notes: v2 (2026-05-17) — audit_result の正本主張を post-check-markers.md (>=2) に委譲し、
       本ファイルは UX/UI 固有フィールド (`blocking_count` / `notes_count` / observation 観点 /
       Applicable States / Design Plan gate) のみを canonical 管理する責務に絞る (SSoT 違反 RVW-001 解消, #110)。
       audit_result 関連記述は pointer に降格。schema_version bump は breaking change として扱う
       (audit_result を正本として参照していた読者は post-check-markers.md (>=2) に切り替える)。
       v1 (2026-05-06) — Marker schema 分割 (followup #20) で `pr-templates.md` から
       UX/UI 系 marker (`op-ux-ui-gate` / `op-ux-ui-audit`) の detailed schema を切り出した
       正本ファイル。共通 post-check meta (`op-post-check-meta`) は `post-check-markers.md` を参照。
       marker 名 / owner / consumer / core meaning は引き続き `labels-and-markers.md` が正本。

機能概要:
  ux-ui-audit-expert が出力する Design Plan gate (op-architect 段階) と apply 後 post-check
  (op-run 段階) の marker block の detailed schema を集約する。UX/UI 固有フィールド
  (blocking_count / notes_count / observation 観点 / Applicable States 判定ルール)、
  aux post-check (security 由来) との連携を含む。
  audit_result enum の canonical schema は `post-check-markers.md (>=2)` を参照 (本ファイルは pointer のみ)。

作成意図:
  pr-templates.md に分散していた UX/UI 系 marker schema を独立した正本に切り出す
  (Single Canonical Source Rule)。op-architect Design Plan gate / op-run フェーズ 3.5 / op-merge
  gate 11〜13 / 18 が参照する field 仕様を 1 箇所に集約する。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Post-check / Gate Markers 節が正本。
  - 共通 post-check metadata (audit_result / post_check_expert / post_check_result /
    post_checked_head_sha / post_check_round) は `post-check-markers.md (>=2)` を参照。
    本ファイルは UX/UI 固有フィールドのみを canonical 定義。audit_result は共通必須フィールドのため
    `post-check-markers.md (>=2)` が正本 (本ファイルは pointer のみ)。
  - bash gh コマンドや PR comment 本文の具体例は `pr-templates.md` を参照する。
-->

# UX/UI Markers — Detailed Schema

ux-ui-audit-expert が出力する UX/UI gate / post-check marker の detailed schema 正本。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Post-check / Gate Markers** 節が canonical。

共通 post-check metadata (`post_check_expert` / `post_check_result` / `post_checked_head_sha` /
`post_check_round`) の schema は `skills/_shared/markers/post-check-markers.md` を参照。本ファイルは
**UX/UI 固有フィールド** (blocking_count / notes_count / observation 観点) の正本。
`audit_result` は共通必須フィールドのため `post-check-markers.md (>=2)` が canonical (本ファイルは pointer のみ)。

PR comment / bash gh HEREDOC 形式の実テンプレートは `skills/_shared/pr-templates.md` の
「op-architect: UX/UI Audit Gate Result」「op-run: UX/UI Post-check Result」節を参照する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` |
| 共通 post-check metadata block (`audit_result` canonical schema 含む) | `skills/_shared/markers/post-check-markers.md (>=2)` |
| ux-ui-audit-expert の Design Plan gate / post-check 方法論 / Applicable States 判定 | `skills/expert-ux-ui-audit/SKILL.md` および `skills/expert-ux-ui-audit/references/gate-criteria.md` / `post-check-criteria.md` / `recovery-and-states.md` |
| op-merge gate 11〜13 / 18 (UX/UI 影響 PR の post-check 通過判定) | `skills/op-merge/SKILL.md` |
| op-run フェーズ 3.5 (apply 後 UX/UI post-check spawn) | `skills/op-run/SKILL.md` |
| op-architect Design Plan gate | `skills/op-architect/SKILL.md` |
| Design Plan の出力テンプレ | `skills/_shared/pr-templates.md` (Design Plan 節) |
| security 由来 aux post-check 連携 | `skills/_shared/markers/security-markers.md` |
| PR comment テンプレ (bash gh HEREDOC) | `skills/_shared/pr-templates.md` |

---

## `<!-- op-ux-ui-gate -->` block schema (Design Plan gate 段階)

ux-ui-audit-expert が op-architect の Design Plan を gate した結果を表現する marker。
**Design Plan 段階** で使い、PR が存在する前のフェーズ (op-architect Architect Mode) に出力する。

判定は PASS / PASS_WITH_NOTES / BLOCK の 3 択。`<!-- op-post-check-meta -->` は **付けない**
(post-check ではなく Design Plan gate のため)。

### 必須フィールド (machine-readable header)

```text
<!-- op-ux-ui-gate -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
auditor: ux-ui-audit-expert
audited_at: <ISO8601>
blocking_count: <BLOCK 時に挙げた Required Changes の件数 (0 なら 0)>
notes_count: <PASS_WITH_NOTES 時に挙げた Notes の件数 (0 なら 0)>
```

| フィールド | 型 | 必須 | enum / 制約 |
|---|---|---|---|
| `audit_result` | enum | ✓ | `PASS` / `PASS_WITH_NOTES` / `BLOCK` |
| `auditor` | string | ✓ | 必ず `ux-ui-audit-expert` |
| `audited_at` | string | ✓ | ISO8601 (判定確定時刻) |
| `blocking_count` | integer | ✓ | `BLOCK` 時の Required Changes 件数 (0 なら 0) |
| `notes_count` | integer | ✓ | `PASS_WITH_NOTES` 時の Notes 件数 (0 なら 0) |

### 司令官 (op-architect) の動作

| `audit_result` | 動作 |
|---|---|
| `PASS` | そのまま op-run に渡す Issue 本文に Design Plan を確定埋め込み |
| `PASS_WITH_NOTES` | Notes を Issue 本文の `## 🎨 Design Plan` 節末尾に追記してから確定 |
| `BLOCK` | designer-expert に Required Changes を渡して Design Plan を再作成させる (3 回 BLOCK 続いたら人間判断) |

### Design Plan gate 段階の特徴

- PR が存在しない (Issue 段階) のため、`post_checked_head_sha` 等の post-check meta は付けない。
- op-merge gate には直接効かない (PR 段階の merge gate には apply 後 post-check で再判定する)。
- 詳細な Design Plan gate 観点 (User Goal / Components / Tokens / Applicable States / Layout 等の
  必須要素) は `skills/expert-ux-ui-audit/references/gate-criteria.md` を参照。

---

## `<!-- op-ux-ui-audit -->` block schema (apply 後 post-check 段階)

apply 後の PR diff を独立に audit した結果を表現する marker。**post-check 段階** で使い、
直後に `<!-- op-post-check-meta -->` を並べて共通フィールドを出力する。

### 出力構造

```text
<!-- op-ux-ui-audit -->
<!-- op-post-check-meta -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
audited_at: <ISO8601>
auditor: ux-ui-audit-expert
post_check_expert: ux-ui-audit-expert
post_check_result: pass | pass_with_notes | block
post_checked_head_sha: <sha>
post_check_round: <integer>
blocking_count: <BLOCK 時の Required Changes 件数 (0 なら 0)>
notes_count: <PASS_WITH_NOTES 時の Notes 件数 (0 なら 0)>
```

### 共通 post-check meta フィールド

`post_check_expert` / `post_check_result` / `post_checked_head_sha` / `post_check_round` の
semantics は `skills/_shared/markers/post-check-markers.md` を参照。

### UX/UI 固有 header フィールド

> **`audit_result` の canonical schema は `skills/_shared/markers/post-check-markers.md (>=2)` を参照。**
> 本ファイルは UX/UI 固有フィールドのみを canonical 定義し、`audit_result` は共通必須フィールドのため
> `post-check-markers.md` が正本 (ここでは参照のみ)。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `audit_result` | enum | ✓ | 共通必須フィールド。canonical schema は `post-check-markers.md (>=2)` 参照。UX/UI では `PASS` / `PASS_WITH_NOTES` / `BLOCK` (UPPER CASE) を使用 |
| `audited_at` | string | ✓ | ISO8601 (判定確定時刻) |
| `auditor` | string | ✓ | 必ず `ux-ui-audit-expert` |
| `blocking_count` | integer | ✓ | `BLOCK` 時の Required Changes 件数 (0 なら 0) — UX/UI 固有 |
| `notes_count` | integer | ✓ | `PASS_WITH_NOTES` 時の Notes 件数 (0 なら 0) — UX/UI 固有 |

### `audit_result` ↔ `post_check_result` の対応

`audit_result` と `post_check_result` の許容対応表 (canonical) および矛盾 marker 検出ルールは
**`skills/_shared/markers/post-check-markers.md (>=2)`** を参照 (本ファイルは pointer のみ)。

UX/UI domain 固有の補足:
- UX/UI post-check では `needs_human_decision` は通常使わない (security domain 専用 result)。
- UX/UI では `audit_result: BLOCK` + `post_check_result: block` を使用する。

### 司令官 (op-run) の動作

| `audit_result` | 動作 |
|---|---|
| `PASS` | review-expert global review (フェーズ4) に進める |
| `PASS_WITH_NOTES` | PR コメントに Notes を残してから review-expert global review に進める |
| `BLOCK` | review-expert global review を呼ばず、**該当クラスタの op-run-expert に戻して** Required Changes を実装させる (`pro-review-needs-fix` 相当のフロー) |

戻し先は `op-run-expert` (= apply 担当) であり、designer-expert に固定されない:

- op-run-expert = `designer-expert` → designer-expert に戻す
- op-run-expert = `feature-expert` (UI 影響あり feature) → feature-expert に戻す

詳細は `skills/op-run/SKILL.md` フェーズ 3.5。

---

## 観点別チェック (post-check 7 観点)

UX/UI post-check は以下 7 観点を必ず確認する (PR comment 本文の表に記述):

| # | 観点 | 判定対象 |
|---|---|---|
| 1 | Design Plan と実装差分が一致 | Plan の Components / Tokens / Layout 通りに実装されているか |
| 2 | Applicable States の実装 (UI 種別ごとに該当する state) | 該当 state がすべて実装されているか / 該当しない state は `not_applicable_reason` 添えで省略されているか |
| 3 | error / loading の実装 (該当する場合) | 非同期 UI で error / loading の表示が抜けていないか |
| 4 | keyboard / focus の保持 | tab 順序 / `:focus-visible` / Esc 復帰等の a11y 退化がないか |
| 5 | 操作のわかりやすさ (クリック数 / 戻る導線) | 主要 task の到達導線が劣化していないか |
| 6 | Issue 範囲外 redesign の混入 | scope_out 違反 (Plan に書いていない見た目変更) |
| 7 | style 変更による UX / a11y 退化 | focus / contrast / keyboard / state visibility 破壊 (hard-coded style / token bypass そのものは designer-expert の post-check 領域) |

詳細な判定基準と各観点で見るべき具体項目は `skills/expert-ux-ui-audit/SKILL.md` および
`skills/expert-ux-ui-audit/references/post-check-criteria.md` を正本とする。

---

## Design Plan gate の観点 (Design Plan 段階 6 観点 + motion 時 観点7)

Design Plan gate は post-check の 7 観点とは別に、Plan の妥当性を 6 観点で判定する。
**Design Plan に `### Motion Strategy` 節がある場合のみ観点7 を additive で適用**する (ADR-0012 Wave4、motion 不在時は N/A):

| # | 観点 | 判定対象 |
|---|---|---|
| 1 | 次の行動が明確 | User Goal が「次の行動」を含んでいるか |
| 2 | Applicable States 網羅 (UI 種別ごとに該当する state) | UI 種別に必要な state が含まれているか / 該当しない state は `not_applicable_reason` |
| 3 | エラー復帰導線 | failure state で「retry / 戻る / 別経路」のいずれかが提示されているか |
| 4 | 業務フロー整合 | 既存の業務シナリオを破壊しないか |
| 5 | accessibility (focus / aria / contrast) | a11y requirements の Plan 内記述があるか |
| 6 | 見た目偏重でない | Components / Tokens / Layout / a11y / States の実装可能性が伴っているか |
| 7 | **motion 安全性 (Motion Strategy 節がある場合のみ)** | 前庭障害トリガ (大きな視差・回転・ズーム) を含まず、`prefers-reduced-motion` fallback と性能ガード (transform/opacity のみ、layout-triggering プロパティを animate しない) を備えるか。motion 節が無ければ N/A |

> 観点7 は **conditional additive**。Motion Strategy 節が無い Plan は従来通り 6 観点のみで PASS/BLOCK を判定する
> (marker block schema `audit_result` / `blocking_count` は不変、6 観点 consumer は forward-compatible)。motion の質的検証
> (timing の自然さ等) は完全静的 gate では検証不能 (`requires_runtime`)。gate が見るのは Static Hard blocker の「有無」のみ。

詳細な判定基準は `skills/expert-ux-ui-audit/references/gate-criteria.md` を参照。

---

## Applicable States の判定ルール

UI 種別 (フォーム / 一覧 / modal / 静的表示等) ごとに必要な state は異なる。**機械的に
loading/success/failure/empty/disabled/focus すべてを必須とすると、過剰実装で BLOCK されやすくなる**。

UI 種別ごとの典型 applicable state (起点。実画面に応じて取捨する):

| UI 種別 | 必須 state |
|---|---|
| 非同期データ取得 (一覧 / 詳細) | loading / failure / empty / focus |
| フォーム送信 | loading / success または遷移 / failure / disabled / focus |
| 破壊操作 (削除等) | confirmation または undo / success / failure / focus |
| modal / drawer | focus / keyboard / Esc close / failure (async 時) |
| 静的表示 (説明 / about / 法務文書) | focus / heading / contrast |
| toast / inline message | success / failure (toast 自体は state を多く持たない) |

該当しない state は省略するか `not_applicable_reason` を 1 行添える (静的表示画面で empty を持たない理由など)。
詳細は `skills/expert-ux-ui-audit/references/recovery-and-states.md` を参照。

---

## op-merge gate ルール (gate 11〜13 / 18)

op-merge は UX/UI 影響 PR について、`<!-- op-ux-ui-audit -->` + `<!-- op-post-check-meta -->` の
audit_result が `PASS` / `PASS_WITH_NOTES` で、かつ `post_checked_head_sha` が current head と
一致することを要求する。

| Gate | 確認内容 | 不通過時の状態 |
|---|---|---|
| 11 | `audit_result == PASS / PASS_WITH_NOTES` | `pro-ux-ui-audit-needs-fix` ラベル / merge 不可 |
| 12 | post-check skip (`pro-ux-ui-audit-skipped`) なら manual override 必須 | merge 不可 (manual override / 再実行) |
| 13 | manual override 時は `<!-- op-manual-override -->` block 必須 | merge 不可 (block 不在は無効) |
| 18 | security 由来 aux post-check が `pass` で current head | aux 系 (`security-markers.md` 参照) |

詳細は `skills/op-merge/SKILL.md` の UX/UI gate 節。

---

## security 由来 aux post-check との連携

security mitigation が UI / workflow に影響する場合、op-run は **auxiliary** ux-ui-audit-expert
post-check を spawn する。本 marker (`<!-- op-ux-ui-audit -->`) を通常の post-check と同じ schema で
出力するが、security post-check 側の `aux_post_check_status` を `pass` / `block` / `stale` 等に
更新する責務は op-run controller にある (詳細は `skills/_shared/markers/security-markers.md` の
`aux_post_check_status` state machine 節を参照)。

---

## 互換性 / Deprecated

| Marker / Label | 状態 | 置換先 / 取り扱い |
|---|---|---|
| `pro-ux-audit` | deprecated (label) | `pro-ux-ui-audit-expert` に統合済み。新規付与禁止 |
| `pro-ui-refactor` | deprecated (label) | `pro-ux-ui-audit-expert` / `pro-designer-expert` に分離済み。新規付与禁止 |
| `pro-ux-ui-audit` | deprecated (短縮形 label) | `pro-ux-ui-audit-expert` を使用。新規付与禁止 |

詳細は `labels-and-markers.md` の Deprecated / Compatibility Labels 節を参照。

---

## Lint Regression Examples

`op-tools/crates/op-core/tests/prose_examples.rs` が parse + lint clean を assert する canonical。
Rust struct schema 変更時に同期する (silent fork 防止、ADR-0003)。

<!-- op-ux-ui-gate -->
audit_result: PASS
auditor: ux-ui-audit-expert
audited_at: 2026-05-09T10:00:00Z
blocking_count: 0
notes_count: 0

<!-- op-ux-ui-audit -->
audit_result: PASS
audited_at: 2026-05-09T10:00:00Z
auditor: ux-ui-audit-expert
post_check_expert: ux-ui-audit-expert
post_check_result: pass
post_checked_head_sha: 1234567890abcdef1234567890abcdef12345678
post_check_round: 1
blocking_count: 0
notes_count: 0
