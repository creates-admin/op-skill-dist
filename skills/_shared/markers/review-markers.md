<!--
schema_version: 1
last_breaking_change: 2026-05-06
notes: v1 追記 (2026-07-23, ADR-0024/0027 第六波 6a) — PR body 上の `<!-- op-review-state -->`
       block を additive に予告する節を新設した (ADR-0027「review-state — PR body 型 state 文書への
       再設計」の 6a 基盤 wave)。本節は現行 comment marker 群 (op-review-meta 等) を置き換えない
       (6b で breaking bump するまでは comment marker 群が引き続き正本)。非破壊 additive のため
       schema_version は 1 に据置。
       v1 (2026-05-06) — Marker schema 分割 (followup #20) で `pr-templates.md` から
       review-expert 系 marker の detailed schema (review meta block / review finding block /
       review-finding-direct / review-report / specialist-review-meta) を切り出した正本ファイル。
       marker 名 / owner / consumer / core meaning は引き続き `labels-and-markers.md` が正本。
       本ファイルは review lifecycle 系 block の field 一覧 / enum / null 許可ルール /
       provenance フィールド / Direct Mode 契約 / 集約ルール / reclassification metadata の正本。
       PR comment テンプレ (bash gh HEREDOC) は `pr-templates.md` 側に残る。
       2026-05-07 — `op-review-controller-meta` の detailed field schema を新規追加
       (controller terminal state を `op-review-meta` と独立して記録するための marker。
       marker 名 / owner / consumer / core meaning は labels-and-markers.md が正本)。

機能概要:
  review-expert (global review 専任) と specialist reviewer の出力 marker のフィールド単位 schema、
  enum 値、provenance 検査ルール、null 許可ポリシー、Direct Mode と OP-managed Mode の契約差を
  集約する。

作成意図:
  pr-templates.md が PR body テンプレと marker schema を同時に抱え込んで巨大化していたため、
  review 系 marker の detailed schema を独立した正本に切り出す (Single Canonical Source Rule)。
  pr-templates.md の bash テンプレは marker block を inline 出力として保持するが、フィールドの
  正規仕様はこちらを参照する。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Review Markers 節が正本。本ファイルと
    名前・基本意味で食い違いを生じさせない (重複定義を増やさない)。
  - bash gh コマンドや PR comment 本文の具体例は `pr-templates.md` を参照する。
  - schema_version 変更時は本ファイル → 参照する SKILL.md / agent.md / 関連 references の
    `(>=N)` 表記を確認する。
-->

# Review Markers — Detailed Schema

review-expert (global review 専任) と specialist reviewer 出力 marker の detailed schema 正本。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Review Markers** 節が canonical。本ファイルは
field 単位の schema / enum / 検査ルール / 集約ルール / provenance / Direct Mode 契約に責務を限定する。

PR comment / bash gh HEREDOC 形式の実テンプレートは `skills/_shared/pr-templates.md` の
「op-run: review 結果コメント」「op-run: specialist 判断結果コメント」節を参照する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` |
| review-expert の 7 lens 観点 / 4 review_result の判定基準 | `skills/expert-review/SKILL.md` および `skills/expert-review/references/finding-schema.md` |
| spawn prompt の review 拡張フィールド | `skills/_shared/expert-spawn.md` |
| PR comment テンプレ (bash gh HEREDOC) | `skills/_shared/pr-templates.md` |
| Direct / OP-managed Mode 判定 | `skills/_shared/invocation-mode.md` |

---

## `<!-- op-review-meta -->` block schema

review-expert が **OP-managed Mode** で出力する review lifecycle metadata block。
op-run のフェーズ4 が controller として spawn し、フェーズ4.5-1 で `review_result` を判定する。
op-merge gate 3a〜3i / 5 が SHA 一致と provenance を確認する。

### 必須フィールド

```text
<!-- op-review-meta -->
review_result: approve | needs-fix | needs-specialist-review | blocked
reviewed_head_sha: <sha>
reviewed_at: <ISO8601>
reviewer: review-expert
review_round: <integer>
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: <op-run controller が払い出した id>
review_worktree_head_sha: <review worktree の HEAD SHA>
```

| フィールド | 型 | enum / 制約 | 説明 |
|---|---|---|---|
| `review_result` | enum | `approve` / `needs-fix` / `needs-specialist-review` / `blocked` | review-expert の最終判定。集約ルールは下記 |
| `reviewed_head_sha` | string | 40 桁 SHA-1 | レビュー対象の PR head sha。op-merge は `current PR head == reviewed_head_sha` を要求 |
| `reviewed_at` | string | ISO8601 (例: `2026-05-06T13:24:00+09:00`) | 判定確定時刻 |
| `reviewer` | string | 必ず `review-expert` | 別の expert 名は不可 (specialist reviewer は別 marker) |
| `review_round` | integer | 1 origin の通算試行数 | `1..(max_review_fix_rounds + 1) = 1..3` |
| `max_review_fix_rounds` | integer | 現行 `2` 固定 | Review Fix Loop の最大 fix round 数 |
| `global_review_expert` | string | 必ず `review-expert` | 将来別 expert に分岐した場合の互換 hook |
| `review_comment_origin` | enum | `op-run` 固定 (OP-managed Mode の場合) | op-merge gate 3h が必須化 |
| `op_run_session_id` | string | non-empty かつ `unknown` 以外 | op-merge gate 3i が必須化 |
| `review_worktree_head_sha` | string | 40 桁 SHA-1 | review worktree の HEAD。fork 検出に使用 |

### 任意フィールド (narrow opt-down 観測用)

review-expert narrow opt-down (`model-selection.md` (>=3) §7.1) の観測のため、op-run controller が
spawn 時に渡した model 決定根拠を転写する。**任意 field** であり、controller が渡さなければ省略してよい。
op-merge gate には影響しない (merge 判定には使わない)。

```text
model_used: opus | sonnet
model_decision_reason: narrow-opt-down | default-opus | large-pr-loc | large-pr-file-count | sensitive-path | quality-high | kill-switch | model-degraded
```

| フィールド | 型 | enum / 制約 | 説明 |
|---|---|---|---|
| `model_used` | enum (任意) | `opus` / `sonnet` | 実 spawn に使われた model。controller が `global-review-spawn.md` §4-1-b の `REVIEW_MODEL` を渡す |
| `model_decision_reason` | enum (任意) | `narrow-opt-down` / `default-opus` / `large-pr-loc` / `large-pr-file-count` / `sensitive-path` / `quality-high` / `kill-switch` / `model-degraded` | model 決定根拠。controller が `REVIEW_MODEL_REASON` を渡す。enum semantics は `markers/labels-and-markers.md` の Spawn Metadata Markers 節参照 |

### `review_round` の意味

- **PR 全体の review attempt 通算**として扱う。head SHA でフィルタしない。fix commit で head が変わっても累算する。
- `fix_round = review_round - 1` の関係。
- op-run が spawn prompt 経由で渡す。template 側は `${REVIEW_ROUND}` で展開し、未指定時は `:?` で fail-fast。
  default で 1 に倒すと Review Fix Loop の round 管理が壊れるため。

### 全体 `review_result` の集約ルール

`review_result` は finding 単位の `result` の **最重値** で決定する:

```
blocked > needs-specialist-review > needs-fix > approve
```

詳細は `skills/expert-review/references/finding-schema.md` の集約ルール節を参照。

### op-merge 必須要件 (gate 3a〜3i / 5)

op-merge は以下を必ず確認する。1 つでも欠けると merge 不可:

- `reviewer == review-expert` / `global_review_expert == review-expert`
- trusted author (`TRUSTED_REVIEW_AUTHORS`) からの投稿
- `review_comment_origin == "op-run"` (gate 3h)
- `op_run_session_id` が non-empty かつ `"unknown"` 以外 (gate 3i)
- `reviewed_head_sha == current PR head sha` (head が進んだら `pro-review-stale`)
- `review_result == approve`
- `review_round <= max_review_fix_rounds + 1` (= 3)

詳細は `skills/op-merge/SKILL.md` の op-review-meta gate 節。

---

## `<!-- op-review-report -->` block schema (Direct Mode 専用)

review-expert を **Direct Mode** (人間が `/expert-review` を直接実行) で動かしたときの出力 marker。
canonical `<!-- op-review-meta -->` を **絶対に出してはならない**。op-run / op-merge の自動継続には
組み込まれない (gate 3h/3i を物理的に通せない設計)。

### 必須フィールド

```text
<!-- op-review-report -->
report_result: approve | needs-fix | needs-specialist-review | blocked
reviewed_head_sha: <sha>
reviewed_at: <ISO8601>
reviewer: review-expert
report_origin: direct
```

| フィールド | 型 | enum / 制約 | 説明 |
|---|---|---|---|
| `report_result` | enum | `op-review-meta` と同じ 4 値 | Direct Mode での判定。あくまで参考意見 |
| `reviewed_head_sha` | string | 40 桁 SHA-1 | レビュー時点の sha |
| `reviewed_at` | string | ISO8601 | 判定確定時刻 |
| `reviewer` | string | 必ず `review-expert` | |
| `report_origin` | string | 必ず `direct` | OP-managed の `op-run` と区別 |

### Direct Mode の制約

- `<!-- op-review-meta -->` を出してはならない (op-merge gate に通すと整合性が壊れる)。
- finding は `<!-- op-review-finding-direct -->` を使う (`<!-- op-review-finding -->` ではない)。
- review-expert 自身が judgement (approve / needs-fix / needs-specialist-review / blocked) を返す
  ところは OP-managed と共通だが、op-run / op-merge には連携しない。

### Mode 判定の正本

判定材料・禁止フレーズの完全リストは `skills/_shared/invocation-mode.md` を参照。曖昧なら
**OP-managed 側に倒す** (Direct Mode で誤って canonical block を出すと gate 整合が壊れるため、
OP-managed 側に倒した方が安全)。

---

## `<!-- op-review-finding -->` block schema

review-expert が `needs-fix` / `needs-specialist-review` / `blocked` のとき、各 finding を 1 block として残す
machine-readable finding。op-run の Review Fix Loop が specialist expert に handoff する入力になる。

### 必須フィールド

```text
<!-- op-review-finding
id: RVW-<3 桁ゼロ埋め連番。例: RVW-001, RVW-002>
result: needs-fix | needs-specialist-review | blocked
severity: critical | high | medium | low
lens: Security / Abuse | Workflow / UX | Test | Compatibility | Release | Spec | Refactor
scope: same-pr | new-issue | blocked
recommended_fix_expert: <expert 名 | null>
requires_post_check: ux-ui-audit-expert | security-expert | null
reclassified_from: <元の誤分類 expert 名 | null>
reclassified_to: <再分類後の active expert 名 | needs_human_decision | null>
reclassification_reason: <再分類理由 1 行 | null>
-->

<finding 本文 (3-8 行)>
```

| フィールド | 型 | 必須 | enum / 制約 |
|---|---|---|---|
| `id` | string | ✓ | 形式 `RVW-NNN` (3 桁ゼロ埋め)。1 桁 (`RVW-1`) は不可 |
| `result` | enum | ✓ | `needs-fix` / `needs-specialist-review` / `blocked`。approve のとき finding 自体を出さない |
| `severity` | enum | ✓ | `critical` / `high` / `medium` / `low` |
| `lens` | enum | ✓ | review-expert の 7 lens。`Security / Abuse` / `Workflow / UX` / `Test` / `Compatibility` / `Release` / `Spec` / `Refactor` |
| `scope` | enum | ✓ | `same-pr` / `new-issue` / `blocked` |
| `recommended_fix_expert` | string \| null | △ | `null` 許容範囲は下記 |
| `requires_post_check` | enum | ✓ | `ux-ui-audit-expert` / `security-expert` / `null` |
| `reclassified_from` | string \| null | optional | reclassification 時のみ |
| `reclassified_to` | enum | optional | active expert 名 / `needs_human_decision` / null |
| `reclassification_reason` | string \| null | optional | 1 行で理由 |

### `recommended_fix_expert` の null 許可範囲

| `result` | null 許容 | 理由 |
|---|---|---|
| `needs-fix` | **不可** (必ず apply expert を指定) | フェーズ4.5-2 の apply path に直行するため、apply target が null だと dispatch できない |
| `needs-specialist-review` | **不可** (specialist reviewer 候補を指定) | フェーズ4.5-2A で specialist を spawn するため、候補がないと handoff できない |
| `blocked` | **許容** (null または apply expert 名のいずれでもよい) | 自動修正しない finding に apply target を強制するのは語義矛盾。判断材料がある場合のみ書く |

### apply target に指定してはならない expert

`review-expert` / `ux-ui-audit-expert` は **どの result でも apply target にしてはならない**:

- `review-expert`: 監査専任 (self-review 防止)。
- `ux-ui-audit-expert`: 検出 + post-check 専任 (apply は別の active expert)。

### Reclassification metadata (`reclassified_*` フィールド)

`reclassified_from` / `reclassified_to` / `reclassification_reason` は **optional**。通常 finding では省略してよい。

planned expert (特に `release-expert`) に誤分類された finding を active expert または
`needs_human_decision` に再分類した場合のみ出力する。これは fallback ではなく **reclassification の
audit trail** であり、`recommended_fix_expert` には常に再分類後の値を入れる。

詳細は:
- `skills/_shared/expert-spawn.md` の release-expert 再分類節
- `skills/expert-review/references/finding-schema.md` の reclassification metadata 節

### 最終 spawn 担当の決定

`recommended_fix_expert` は review-expert からの提案にすぎない。最終的な再委任先は op-run の
判定優先順位 1-8 に従って決定する (詳細は `skills/_shared/expert-spawn.md`)。

---

## `<!-- op-review-finding-direct -->` block schema

review-expert が **Direct Mode** で出力する finding の派生形。OP-managed Mode の
`<!-- op-review-finding -->` と区別するため別 marker を使う。

### 必須フィールド

`<!-- op-review-finding -->` と同じ schema を使う。違いは marker 名のみで、Direct Mode 出力で
op-run の finding 抽出 (フェーズ4.5-2-pre) に混入しないようにするための分離。

### 制約

- `evidence_grade: direct` を満たす finding に限定 (推測 / 間接証拠 finding をこの marker で出してはならない)。
- 推測 / 間接証拠 finding は OP-managed Mode の `<!-- op-review-finding -->` 側のみ可。

詳細は `skills/expert-review/references/evidence-policy.md` を参照。

---

## `<!-- op-specialist-review-meta -->` block schema

`needs-specialist-review` finding を受けた specialist expert (security-expert / debug-expert /
designer-expert / feature-expert / test-expert など、active expert のみ) が **修正の前段で**
出す判断結果 marker。

planned expert (`release-expert` / `compatibility-expert` / `env-expert`) は specialist 候補にしない。
`spec-expert` は active だが op-spec 専用 Utility Worker (op-run routing 対象外) であり、
同じく specialist 候補にしない (詳細は `skills/_shared/runtime-contract.md` / `active-expert-registry.md`)。

### 必須フィールド

```text
<!-- op-specialist-review-meta -->
source_finding_id: RVW-<3 桁ゼロ埋め連番>
specialist: <expert 名>
specialist_result: same-pr-fixable | new-issue | blocked
recommended_apply_expert: <expert 名 | null>
requires_post_check: ux-ui-audit-expert | security-expert | null
reviewed_round: <source finding が出た review_round>
reviewed_at: <ISO8601>
reason: <短い理由 (1〜2 文)>
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `source_finding_id` | string | ✓ | handoff された `<!-- op-review-finding -->` の `id` (例: `RVW-001`) と一致 |
| `specialist` | string | ✓ | spawn された specialist expert 名 (例: `security-expert`) |
| `specialist_result` | enum | ✓ | `same-pr-fixable` / `new-issue` / `blocked` |
| `recommended_apply_expert` | string \| null | △ | `same-pr-fixable` のとき修正担当 expert を提案。`new-issue` / `blocked` のときは `null` でよい |
| `requires_post_check` | enum | ✓ | `ux-ui-audit-expert` / `security-expert` / `null` (元 finding の値を踏襲または上書き) |
| `reviewed_round` | integer | ✓ | source finding が出た `review_round`。op-run が round 進行を整合管理するため |
| `reviewed_at` | string | ✓ | ISO8601 (判断確定時刻) |
| `reason` | string | ✓ | 1〜2 文。op-run が後段で blocked / new-issue 化する際の Issue / コメント本文に転載できる粒度 |

### `specialist_result` の意味

| `specialist_result` | op-run の動作 |
|---|---|
| `same-pr-fixable` | フェーズ4.5-2 の判定優先順位 1-8 に戻り、`recommended_apply_expert` を参考に apply expert を決定して再委任 (`review-expert` / `ux-ui-audit-expert` は apply target にしない) |
| `new-issue` | 当該 finding を別 Issue 化。本 PR 上では `blocked` finding 扱い (review_result の集約には影響する) |
| `blocked` | 自動修正不能。`pro-review-blocked` を経由して人間判断待ち |

### `recommended_apply_expert` の null 許可範囲

| `specialist_result` | null 許容 | 理由 |
|---|---|---|
| `same-pr-fixable` | 不可 | 再 spawn target が必要 |
| `new-issue` | **許容** | 別 Issue 化のため当 PR では apply しない |
| `blocked` | **許容** | 自動修正不能 |

### apply target に指定してはならない expert

`recommended_apply_expert` に `review-expert` / `ux-ui-audit-expert` を指定してはならない:

- `review-expert`: 監査専任。
- `ux-ui-audit-expert`: 検出 + post-check 専任。

### 出力ルール

- 本 block は **specialist expert が出す** (review-expert / op-run が代理出力しない)。
- 1 PR コメントに 1 個。複数 finding を同時に handoff したい場合はコメントを分ける
  (1 finding = 1 specialist judgment block を保つ)。
- specialist が **修正までその場で行ってよい** ケース (= apply 権限を持つ expert が specialist を兼ねたケース) でも、
  本 block は **判断の根拠記録として必ず残す**。apply 結果は通常の commit / PR 進行で表現する。

---

## `<!-- op-review-state -->` body block (additive 予告、ADR-0027 6a)

> **本節は予告節**。ADR-0027 (「review-state — PR body 型 state 文書への再設計」) の 6a 基盤 wave
> (op-core::review_state module + `op pr edit-body` / `op review state pull|push` primitive の新設) に
> 対応する additive な記述であり、**現行 comment marker 群 (`op-review-meta` 等、上記各節) を
> 置き換えない**。6a 時点では comment marker 群が引き続き review lifecycle の正本である。

### 正本宣言

state 文書の shape (JSON schema) の正本は **ADR-0027 の「state shape (確定)」節** および
**`op-core::review_state`** (Rust 型)。本節は「PR body 上のどこに置かれるか」という位置規約のみを
予告し、field 単位の detailed schema はここに複製しない (Single Canonical Source Rule)。

### 位置

PR body の末尾 (`_shared/pr-templates.md` の「op-run: PR open テンプレ」footer の後) に、
`<!-- op-review-state -->` marker + ` ```json ` fence の形で置かれる。ADR-0026 の
`<!-- op-patrol-ledger-state -->` (Issue body) と同型の「marker + json fence」機構を PR body に
適用したものであり、body 全体の一部分 (末尾ブロック) として存在する点が Patrol Ledger
(body 全体が state) と異なる。位置規約の詳細は `_shared/pr-templates.md` を参照。

### 6b で予定される破壊的変更 (予告)

6b (全面移行、別 wave) で、既存 comment marker 群 (`op-review-meta` / `op-review-finding` /
`op-review-finding-direct` / `op-review-controller-meta` / `op-specialist-review-meta`) は
**人間向け監査ログ専用へ降格**される (breaking、本ファイルの schema_version を 1→2 へ bump 予定)。
降格後は「機械が読む」ロジック (review_round 導出 / 8 条件判定 / post-check 結果判定等) がすべて
`<!-- op-review-state -->` body 文書側へ移り、comment marker 群は ADR-0026 の
`<!-- op-patrol-run -->` 降格と同じ扱い (parse fallback 削除、schema は記録専用として維持) になる。
6a の間はこの降格を行わない。

---

## 互換性 / Deprecated

現状なし。本ファイルは v1 として新設。既存 review marker (`op-review-meta` / `op-review-finding` /
`op-review-finding-direct` / `op-review-report` / `op-specialist-review-meta`) はいずれも canonical 状態。
`<!-- op-review-state -->` body block は ADR-0027 6a 時点では **予告のみ** (canonical 実装は 6b)。

---

## `<!-- op-review-controller-meta -->` block schema

op-run controller が **Review Fix Loop の terminal state** (review_round 上限超過 / 強制停止)
を残すための machine-readable block。canonical `<!-- op-review-meta -->` (review-expert 出力) と
**独立した別 marker**。

marker 名 / owner / consumer / core meaning / merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Review Markers** 節が正本。本節は
field 単位の schema / enum / canonical schema との関係 / 出力ルールに責務を限定する。

### 必須フィールド

```text
<!-- op-review-controller-meta -->
controller_result: blocked
reason: review_round_over_limit | <他の terminal 理由>
review_round: <integer>
max_review_fix_rounds: 2
controlled_at: <ISO8601>
controller: op-run
```

| フィールド | 型 | enum / 制約 | 説明 |
|---|---|---|---|
| `controller_result` | enum | 現行 `blocked` 固定。将来 terminal 種別が増えたら本 schema に enum を追加 | controller-side の terminal 判定 |
| `reason` | string | `review_round_over_limit` 等。新規理由は本 schema に追加 | terminal stop の理由 |
| `review_round` | integer | 1 origin | terminal 時点の `review_round` |
| `max_review_fix_rounds` | integer | 現行 `2` 固定 (`<!-- op-review-meta -->` と同値) | Review Fix Loop の最大 fix round 数 |
| `controlled_at` | string | ISO8601 | controller が terminal 判定を出した時刻 |
| `controller` | string | 必ず `op-run` | 出力者識別 (review-expert ではない) |

### canonical `<!-- op-review-meta -->` との関係

- `<!-- op-review-meta -->` (review-expert 出力) は **上書き / 偽造しない**。
- controller の terminal 判定は本 marker でのみ表現する。
- op-merge gate 5 は `<!-- op-review-meta -->` の `review_result == approve` を要求するため、
  controller terminal state が成立していても canonical schema は review-expert が最後に出した値の
  まま据え置く (`needs-fix` / `needs-specialist-review` で構わない)。
- 実 merge gate の merge 拒否根拠は `pro-review-blocked` ラベルおよび canonical schema が
  `approve` でないこと。本 marker は **人間 / op-merge / 後追い分析の audit trail** であり、
  単独では merge をブロックしない。

### 出力ルール

- 1 PR / 1 round に最大 1 個。
- controller_result が変化したら追記し、PR コメント時系列の最新値が論理的な terminal state。
- 本 marker は **op-run controller のみ**が出す (review-expert は出さない)。

詳細な op-run 側の出力タイミング (Review Fix Loop の round 上限超過時) は
`skills/op-run/SKILL.md` のフェーズ4 / 4.5 を参照。

---

## Lint Regression Examples

これらは `op-tools/crates/op-core/tests/prose_examples.rs` の regression test が
parse + lint clean を assert する canonical block。Rust struct schema を変更したら
ここを更新する (silent fork 防止、ADR-0003)。テンプレート変数 (`<sha>` 等) を含めてはならない。

<!-- op-review-meta -->
review_result: approve
reviewed_head_sha: 1234567890abcdef1234567890abcdef12345678
reviewed_at: 2026-05-09T10:00:00+09:00
reviewer: review-expert
review_round: 1
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: run-2026-05-09-001
review_worktree_head_sha: abcd1234abcd1234abcd1234abcd1234abcd1234

<!-- op-review-finding -->
id: RVW-001
result: needs-fix
severity: high
lens: Security / Abuse
scope: same-pr
recommended_fix_expert: security-expert
requires_post_check: null

<!-- op-review-finding-direct -->
id: RVW-001
result: needs-fix
severity: high
lens: Security / Abuse
scope: same-pr
recommended_fix_expert: security-expert
requires_post_check: null

<!-- op-specialist-review-meta -->
source_finding_id: RVW-001
specialist: security-expert
specialist_result: same-pr-fixable
recommended_apply_expert: feature-expert
requires_post_check: null
reviewed_round: 1
reviewed_at: 2026-05-09T10:00:00Z
reason: scope violation is fixable in this PR

<!-- op-review-controller-meta -->
controller_result: blocked
reason: review_round_over_limit
review_round: 3
max_review_fix_rounds: 2
controlled_at: 2026-05-09T10:00:00Z
controller: op-run

<!-- op-review-report -->
report_result: approve
reviewed_head_sha: 1234567890abcdef1234567890abcdef12345678
reviewed_at: 2026-05-09T10:00:00+09:00
reviewer: review-expert
report_origin: direct

---
