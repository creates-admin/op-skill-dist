# Architecture Debt

<!--
機能概要: 一度の op-run で安全に直せない巨大構造負債を ignored_noise にせず、
         architecture_debt / staged_refactor / needs_human_decision として
         追跡し、段階的に改善する schema と policy を集約する。
作成意図: 巨大負債を「直せないから捨てる」ではなく「分解して追跡する」へ。
         seen_count / risk_trend / affected_paths で腐敗度を計測し、
         新規実装による悪化を blocking finding として止める。
注意点: architecture_debt は direct apply しない。safe_first_step だけ
       op-run で実行可能。Issue 化時は needs:triage / op:architecture-debt
       ラベルを付与する。
-->

## Policy

巨大な構造負債を `ignored_noise` にしない。

一度の op-run で安全に直せない refactor finding は、以下に分類する。

```text
A. immediate_refactor       小〜中規模、挙動非変更で op-run できる
B. staged_refactor          数段階に分ければ安全に直せる
C. architecture_debt        一発では直せないが、放置すると悪化する
D. needs_spec_decision      仕様・保存形式・API・ディレクトリ方針の判断が必要
```

---

## Classification

### A. immediate_refactor

`finding_type: "immediate_refactor"`
`execution_mode: "direct_apply"`
`direct_apply_safe: true`

- 同一 feature 内の god function 分解
- 同一 feature 内の scattered token の共通化
- 単一ファイル内の large function の guard clause 化
- public API / serialized format / IPC contract に影響しない

### B. staged_refactor

`finding_type: "staged_refactor"`
`execution_mode: "staged_refactor"`
`direct_apply_safe: false`

- 数段階に分ければ安全に直せる
- 各 stage は immediate_refactor 相当に分解可能
- `safe_first_step` を必ず提示する
- `proposed_stages` を順序付きで列挙する

例:

```text
stage 1: feature 内 literal を inventory する
stage 2: feature-local path contract を作る (移動なし)
stage 3: frontend literals を contract 経由に置換
stage 4: Tauri command literals を contract 経由に置換
stage 5: file open behavior を adapter に抽出
stage 6: 重複 helper を削除
```

### C. architecture_debt

`finding_type: "architecture_debt"`
`execution_mode: "staged_refactor"`
`direct_apply_safe: false`

- 一発では直せない
- 複数 feature / 複数 layer に跨る
- 仕様・保存形式・directory 方針の合意が必要
- 放置すると悪化する

### D. needs_spec_decision

`finding_type: "needs_spec_decision"`
`execution_mode: "needs_human_decision"`
`direct_apply_safe: false`
`needs_human_decision.required: true` (構造化 block。`decision_type: "spec"` または `"boundary"`、`options[]` / `blocked_actions[]` ほか正規スキーマ必須項目を全て埋める)

- 仕様判断が必要
- public API 変更 / serialized format 変更 / IPC contract 変更を伴う
- ディレクトリ方針の決定が必要
- refactor-expert 単独では実行しない

---

## Severity Exception for Architecture Debt

`architecture_debt` は、**現在の破壊度だけでなく**、以下を加味して High に昇格できる:

- 変更頻度が高い feature に存在する
- 新規実装が同じ負債を悪化させている
- file IO / path / IPC / config / storage / serialized data に絡む
- 依存逆流により複数 feature へ波及している
- `seen_count >= 3`
- `affected_paths` が増加している
- shared / common / utils に feature 固有責務が漏れている

---

## Required Fields (architecture_debt)

architecture_debt finding には以下を必ず含める。

| field | 説明 |
|-------|------|
| `direct_apply_safe` | 必ず `false` |
| `why_not_direct_apply` | 一発で直せない理由 (1〜2 文) |
| `affected_paths` | 影響範囲のパス glob 配列 |
| `first_detected_at` | 初回検出日 (ISO 8601 date) |
| `last_seen_at` | 最終検出日 (ISO 8601 date) |
| `seen_count` | 検出回数 (op-patrol が累積する) |
| `risk_trend` | `stable` / `worsening` / `spreading` |
| `proposed_stages` | 順序付き stage 配列 |
| `safe_first_step` | 最初の stage で安全に実行できる作業 |
| `needs_human_decision` | 構造化 block。判断不要なら省略可。`required: true` の場合は `_shared/invocation-mode.md` の必須項目 (`reason` / `decision_type` / `options[]` / `recommended_option` / `safest_default` / `blocked_actions[]` / `can_continue_without_decision` / `next_safe_action`) を全て埋める |
| `human_decision_points` | 判断点の自然文配列 (refactor 固有の補助) |

---

## Tracking Policy (Phase 1)

architecture_debt の追跡は **GitHub Issue 本文の `op-refactor-debt-key`
(優先順位 1) と `op-fingerprint` (優先順位 2) を正本** とする。
Patrol Ledger に専用 index は持たせない (Phase 2 検討)。
op-refactor-debt-key の仕様および優先順位の詳細は本ドキュメント下部
「Issue 本文の追跡 marker」節を参照。

### 役割分担 (重要)

```text
agent (refactor-expert):
  finding を canonical schema + refactor 固有 field で返す。
  first_detected_at / seen_count / risk_trend は「今回の検出での暫定値」のみ
  (seen_count=1 / first_detected_at=<spawn prompt の today> / risk_trend=stable など) を返す。
  推測で seen_count を 3 にしたりしない。
  日付は op-scan / op-patrol が spawn prompt の【実行日】節に注入した値を使用する
  (agent 側で `date` 実行 / 推測しない)。

op-patrol:
  finding の fingerprint で既存 Issue を検索し、
  既存 Issue があれば finding の値を上書きして seen_count / last_seen_at を更新する。
  既存 Issue が無ければ新規起票する。
```

### op-patrol による seen_count / last_seen_at 更新フロー

1. refactor-expert が `architecture_debt` finding を返す
2. op-patrol は **以下の優先順位で既存の `op:architecture-debt` ラベル付き Issue を検索**:

   ```text
   優先順位 1: op-refactor-debt-key 完全一致
              `refactor:<bulk_group>:<root_path>:<symbol_or_boundary>`
   優先順位 2: op-fingerprint 完全一致
              `<domain>:<normalized_title>:<primary_file>:<symbol>` (共通仕様)
   優先順位 3: affected_paths 類似 + bulk_group 一致 + symbols 類似 (タイブレーカ)
   ```

   最初に一致したものを「同一 debt」と判定する。
3. **既存 Issue がある場合**:
   - 新規 Issue を起票しない
   - 既存 Issue 本文の `seen_count` を +1
   - `last_seen_at` を今日に更新
   - `affected_paths` が増えていれば本文に追記し、`risk_trend` を `spreading` に更新
   - 同じ `affected_paths` 内で新規 violation が増えていれば `risk_trend` を `worsening` に
   - 何も変わっていなければ `risk_trend = stable`
   - 必要なら `needs:triage` ラベルを追加
   - 新規 detection の概要をコメントに残す
4. **既存 Issue がない場合**:
   - 新規 Issue を起票
   - Issue 本文に **`op-fingerprint` と `op-refactor-debt-key` の 2 つの marker** を埋める
   - `first_detected_at = last_seen_at = today`
   - `seen_count = 1`
   - `risk_trend = stable`

### risk_trend の判定 (op-patrol による更新ルール)

```text
stable     : affected_paths が前回と同じ、新規 violation 検出なし
worsening  : 同じ affected_paths 内で新規 literal / new violation が増えた
spreading  : affected_paths が増加した (別 feature / 別 layer に波及)
```

### needs:triage の付与条件 (op-patrol が判定)

以下のいずれかを満たしたら op-patrol が `needs:triage` ラベルを付与する。

- `seen_count >= 3`
- `affected_paths` が増加した (前回比)
- `risk_trend` が `worsening` または `spreading`

agent 側は `needs:triage` を付与しない (op-patrol の責務)。

### 新規実装による悪化の扱い

- 新規変更 (今回のスキャン対象 PR / 変更ファイル) が既存 debt を悪化させる場合、
  refactor-expert は finding に **`blocking: true`** + `blocking_reason` を付与して返す
- severity 判定とは独立 (`blocking` は orthogonal な flag)
- op-run / op-merge は blocking finding を解消するまで進めない

```text
既存負債は staged
新規悪化は block
```

---

## Labels

architecture_debt / staged_refactor 起票時のラベル
(`_shared/pr-templates.md` のラベルカタログと一致):

```text
op:architecture-debt           ← finding_type=architecture_debt の必須
op:staged-refactor             ← finding_type=staged_refactor の場合
op:blocking-finding            ← blocking=true の場合 (op-run / op-merge を止める)
needs:triage                   ← op-patrol が seen_count >= 3 / affected_paths 増加時に付与
needs:human-decision           ← needs_human_decision.required: true (構造化 block) の場合
needs:human-decision-followup  ← needs_human_decision.required: true かつ can_continue_without_decision: true
                                 かつ finding_type != needs_spec_decision の opt-out フラグ。
                                 op-run はこの両ラベルが付いた Issue を manual_review_bucket に
                                 落とさず通常 apply に流し、apply 担当は safe_first_step のみ実行する
needs:boundary-decision        ← 境界判断が必要な場合 (decision_type: "boundary"。単独では apply を止めない)
needs:spec-decision            ← finding_type=needs_spec_decision の場合
severity:critical|high         ← severity に応じて (severity:* 完全形式)
auto-report                    ← op-scan / op-patrol 共通
pro-refactor-expert            ← apply 担当 (必須)
pro-security-expert            ← post_check_expert=security-expert の場合のみ
pro-ux-ui-audit-expert         ← post_check_expert=ux-ui-audit-expert の場合のみ
```

`pro-compatibility-expert` / `pro-release-expert` / `pro-test-expert` /
`pro-designer-expert` は refactor finding の post-check ラベルとして付与しない (Phase 1)。
これらの follow-up が必要な場合は `recommended_followup_experts` で記録する。

---

## op-run / apply での扱い

architecture_debt finding が op-run に渡された場合:

- **direct apply しない**
- `safe_first_step` のみを実行対象にする
- `proposed_stages` は参考情報として PR description に含める
- 1 PR で複数 stage を実行しない (1 stage = 1 PR を厳守)

`needs_human_decision.required: true` (構造化 block) を含む場合の分岐:

| 条件 | op-run の扱い | apply での挙動 |
|------|--------------|--------------|
| `can_continue_without_decision: false` | `manual_review_bucket` に分離 (apply しない) | apply expert 起動なし。司令官が判断後に再投入 |
| `can_continue_without_decision: true` かつ `finding_type != needs_spec_decision` | `needs:human-decision-followup` ラベル付与 → 通常 apply (opt-out) | `safe_first_step` のみ実行。`blocked_actions[]` 厳守。`needs_human_decision` block を完了報告 / PR 本文「残存リスク / follow-up」節に転記 |
| `finding_type == needs_spec_decision` | 常に `manual_review_bucket` に分離 (仕様判断は blocking) | apply expert 起動なし |

opt-out 経路で safe_first_step を実行しても、途中で更に判断が必要になった場合は、
apply 担当は実行を止めて `can_continue_without_decision: false` に格上げした報告を返す
(中途半端な実装で merge しない)。

---

## Issue 本文の追跡 marker (op-fingerprint + op-refactor-debt-key)

architecture_debt / staged_refactor / needs_spec_decision の finding を Issue 化するときは、
**op-fingerprint と op-refactor-debt-key の 2 つを Issue 本文に埋め込む**。
op-patrol はこの 2 つの marker を使って既存 Issue を検索する。

```markdown
<!-- op-fingerprint: refactor:report-feature-cross-cutting:src/features/report:report -->
<!-- op-refactor-debt-key: refactor:refactor-boundary-mixing:src/features/report:report-feature-cross-cutting -->
```

### op-fingerprint (共通仕様)

`_shared/dedup-policy.md` の共通仕様 (`<domain>:<normalized_title>:<primary_file>:<symbol>`)
に従う。op-scan / op-patrol が自動生成する。**変更しない**。

### op-refactor-debt-key (refactor 専用補助キー)

debt 追跡安定化のための namespace。形式:

```text
refactor:<bulk_group>:<root_path>:<symbol_or_boundary>
```

| 部品 | 意味 |
|------|------|
| `bulk_group` | finding の `bulk_group` をそのまま (例: `refactor-boundary-mixing`) |
| `root_path` | `affected_paths` の最小共通祖先 (LCA) ディレクトリ |
| `symbol_or_boundary` | 具体 symbol が立てば `symbols[0]`、feature 単位なら抽象名 |

例:

```text
refactor:refactor-boundary-mixing:src/features/report:report-feature-cross-cutting
refactor:refactor-utils-dumping-ground:src/shared/utils:utils-bag
refactor:refactor-scattered-tokens:src/features/auth:auth-routes
```

`affected_paths` が広いほど `symbol_or_boundary` は抽象化される
(具体的なファイル名でなく boundary 名にする)。

### op-patrol が既存 Issue を検索する優先順位

```text
1. op-refactor-debt-key 完全一致
2. op-fingerprint 完全一致
3. affected_paths 類似 + bulk_group 一致 + symbols 類似 (タイブレーカ)
```

最初に一致したものを「同一 debt」と判定する。詳細は `_shared/dedup-policy.md`
の「architecture_debt 補助 marker」節を参照。

---

## 例: architecture_debt finding (json)

architecture_debt の累積値 (`seen_count` / `risk_trend` / `last_seen_at`) は agent と op-patrol で
担当が違うため、**例を 2 本立て** で示す。同じ debt を時系列で追ったときの 2 つの状態に対応する。

### A. agent (refactor-expert) が **新規検出時に返す finding** の例

agent は **過去の検出履歴を知らない**。必ず以下の暫定値を返す。op-patrol が既存 Issue を
突合して累積値に上書きする。

```json
{
  "domain": "refactor",
  "severity": "high",
  "title": "Report feature mixes UI, path construction, Tauri command calls, and file open behavior",
  "finding_type": "architecture_debt",
  "execution_mode": "staged_refactor",
  "direct_apply_safe": false,
  "why_not_direct_apply": "Directory and dependency movement crosses frontend and Tauri boundaries and would be risky as a single op-run.",
  "bulk_group": "refactor-boundary-mixing",
  "subtype": "feature-boundary-bleeding",
  "affected_paths": [
    "src/features/report/**",
    "src-tauri/src/commands/report.rs"
  ],
  "first_detected_at": "2026-05-05",
  "last_seen_at": "2026-05-05",
  "seen_count": 1,
  "risk_trend": "stable",
  "needs_human_decision": {
    "required": true,
    "reason": "Path contract location crosses frontend (TS) and Tauri (Rust) runtimes; the choice fixes the boundary semantics for all subsequent stages.",
    "decision_type": "boundary",
    "options": [
      {
        "id": "A",
        "label": "Feature-local TS contract + mirrored Rust constants",
        "consequence": "Lower coupling but two sources of truth; drift risk remains, mitigated by lint/test."
      },
      {
        "id": "B",
        "label": "Single source of truth generated for both sides (build step)",
        "consequence": "One source of truth but introduces a build dependency between TS and Rust."
      }
    ],
    "recommended_option": "A",
    "safest_default": "A",
    "blocked_actions": [
      "Moving directories",
      "Changing the actual output path value",
      "Changing Tauri command signatures",
      "Creating a new path contract module on either side (deferred until boundary decision)",
      "Replacing frontend or Tauri literals (deferred until boundary decision)"
    ],
    "can_continue_without_decision": true,
    "next_safe_action": "Execute safe_first_step only (inventory of literals and call sites); do not create any new contract module until the boundary decision is resolved"
  },
  "human_decision_points": [
    "Where should the report path contract live?",
    "Should frontend and Tauri share a generated contract or keep parallel constants?"
  ],
  "proposed_stages": [
    "Inventory current literals and call sites",
    "Create feature-local path contract without moving directories",
    "Replace frontend literals",
    "Replace Tauri command literals",
    "Extract file open behavior behind a small adapter",
    "Remove duplicate helpers"
  ],
  "safe_first_step": "Inventory current literals and call sites for report path construction across frontend and Tauri sides. Record findings in the Issue body. Do not create a new contract or change any literal until the boundary decision is resolved.",
  "recommended_runner": "refactor-expert",
  "post_check_expert": null,
  "recommended_followup_experts": [
    {
      "expert": "test-expert",
      "reason": "Existing tests for the report flow are thin; staged refactor will benefit from regression coverage",
      "scope": "follow-up Issue"
    }
  ]
}
```

`first_detected_at = last_seen_at = today` / `seen_count = 1` / `risk_trend = "stable"` が
agent 出力の **絶対条件**。`seen_count` を 2 以上で返したり、`risk_trend = worsening / spreading`
を agent 側で確定するのは推測扱いとして禁止。

### B. op-patrol が再検出時に **既存 Issue を突合して上書きした後** の例

`affected_paths` が前回 (`src/features/report/**`, `src-tauri/src/commands/report.rs`) と同じで
新規 violation も増えなかったため `risk_trend = "stable"`、`seen_count` は +1 されて 2、
`last_seen_at` は今日に更新。`first_detected_at` は既存 Issue 側の値を維持。

```json
{
  "...": "(他フィールドは A と同じ)",
  "first_detected_at": "2026-05-04",
  "last_seen_at": "2026-05-05",
  "seen_count": 2,
  "risk_trend": "stable"
}
```

`seen_count >= 3` になったり `affected_paths` が増加した場合、op-patrol は **`needs:triage`
ラベル** を追加し、`risk_trend` を `worsening` / `spreading` に更新する (本ドキュメント
上部「risk_trend の判定」節と「needs:triage の付与条件」節を参照)。

> 注: 上記は省略形の例。canonical schema の必須フィールド (severity_reason / files / symbols /
> summary / evidence / evidence_grade / hypothesis / scope_in / scope_out / recommendation /
> verification_steps / success_criteria / gotchas / confidence / requires_dynamic_verification)
> は実際の起票時には **すべて埋める**。完全例は `report-schema.md` の architecture_debt finding schema を参照。

---

## Principle

```text
既存負債は staged
新規悪化は block
```

巨大負債の存在を **観測** し続けることが第一目的。
腐敗度 (seen_count / risk_trend / affected_paths) を計測することで、
人間判断のタイミングを失わない。
