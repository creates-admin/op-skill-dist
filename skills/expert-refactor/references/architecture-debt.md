# Architecture Debt

一度の op-run で安全に直せない構造負債を `ignored_noise` にせず、分解して追跡する。
`architecture_debt` は direct apply しない (`safe_first_step` のみ op-run で実行可)。

## Classification

| finding_type | execution_mode | direct_apply_safe | 条件 |
|---|---|---|---|
| `immediate_refactor` | `direct_apply` | `true` | 同一 feature 内の god function 分解 / scattered token 共通化 / 単一ファイル内の guard clause 化など。public API / serialized format / IPC contract に影響しない |
| `staged_refactor` | `staged_refactor` | `false` | 数段階に分ければ安全に直せる。各 stage は immediate_refactor 相当。`safe_first_step` と順序付き `proposed_stages` を必ず出す |
| `architecture_debt` | `staged_refactor` | `false` | 一発では直せない / 複数 feature・layer に跨る / 仕様・保存形式・directory 方針の合意が要る / 放置すると悪化する |
| `needs_spec_decision` | `needs_human_decision` | `false` | public API / serialized format / IPC contract 変更やディレクトリ方針の決定が要る。`needs_human_decision.required: true` (`decision_type: "spec"` または `"boundary"`)。refactor-expert 単独では実行しない |

`proposed_stages` の例:

```text
stage 1: feature 内 literal を inventory する
stage 2: feature-local path contract を作る (移動なし)
stage 3: frontend literals を contract 経由に置換
stage 4: Tauri command literals を contract 経由に置換
stage 5: file open behavior を adapter に抽出
stage 6: 重複 helper を削除
```

## Severity Exception

`architecture_debt` は現在の破壊度に加え、以下のいずれかで High に昇格できる:

- 変更頻度が高い feature に存在する
- 新規実装が同じ負債を悪化させている (`blocking: true` も付ける)
- file IO / path / IPC / config / storage / serialized data に絡む
- 依存逆流により複数 feature へ波及している
- `seen_count >= 3` (op-patrol が渡す値をそのまま当てはめる。新規検出時は常に 1 なので該当しない)
- `affected_paths` が増加している
- shared / common / utils に feature 固有責務が漏れている

## Required Fields (architecture_debt)

| field | 説明 |
|---|---|
| `direct_apply_safe` | 必ず `false` |
| `why_not_direct_apply` | 一発で直せない理由 (1〜2 文) |
| `affected_paths` | 影響範囲のパス glob 配列 (`staged_refactor` / `needs_spec_decision` でも必須) |
| `first_detected_at` / `last_seen_at` | ISO 8601 date |
| `seen_count` | 検出回数 |
| `risk_trend` | `stable` / `worsening` / `spreading` |
| `proposed_stages` | 順序付き stage 配列 |
| `safe_first_step` | 最初の stage で安全に実行できる作業 |
| `needs_human_decision` | 判断不要なら省略可。`required: true` なら `_shared/invocation-mode.md` の必須項目をすべて埋める |
| `human_decision_points` | 判断点の自然文配列 |

canonical 必須フィールドと shape の正本は `op help payload refactor-finding --json`。

## Tracking Policy

### tracking owner

| field | agent (refactor-expert) | op-patrol (再検出時) |
|---|---|---|
| `first_detected_at` | 【実行日】 | 既存 Issue の値を維持 |
| `last_seen_at` | 【実行日】 | 今日に更新 |
| `seen_count` | 必ず `1` | +1 |
| `risk_trend` | 必ず `stable` | affected_paths 比較で `worsening` / `spreading` に更新 |

- agent は GitHub Issue を読まず、過去回数を推測しない。日付は spawn prompt の【実行日】を使う (`date` を実行しない)。
- `needs:triage` 付与・ラベル付与は op-scan / op-patrol の責務。agent はラベルを付けない。
- agent に残る責務は、新規変更が既存 debt を悪化させた場合に `blocking: true` + `blocking_reason` を付けること
  (既存 `affected_paths` との突き合わせによる現在時点の判定)。

### 追跡キー

同一 debt の判定キーは `op-fingerprint-bulk` (優先 1) と `op-fingerprint` (優先 2)。
`op-fingerprint-bulk` は `op core fingerprint-bulk --domain refactor --bulk-group <bulk_group> --primary-dir <affected_paths の LCA> --plain` で
op-scan / op-patrol が生成する (手書きしない)。agent は fingerprint 文字列を finding に埋めず、`files` / `symbols` / `bulk_group` / `affected_paths` を正確に埋める。
`affected_paths` が広いほど LCA は浅くなるため、実際の影響範囲だけを列挙する。

既存 Issue の検索・更新手順は op-patrol skill の「architecture_debt の追跡方式 (Phase 1)」節。

## op-run / apply での扱い

- direct apply しない。`safe_first_step` のみ実行し、`proposed_stages` は PR 本文に参考として書く (1 stage = 1 PR)。

`needs_human_decision.required: true` を含む場合:

| 条件 | op-run の扱い | apply での挙動 |
|---|---|---|
| `can_continue_without_decision: false` | `manual_review_bucket` に分離 | apply しない |
| `can_continue_without_decision: true` かつ `finding_type != needs_spec_decision` | `needs:human-decision-followup` ラベル付きで通常 apply | `safe_first_step` のみ。`blocked_actions[]` を実行しない。block を完了報告と PR 本文「残存リスク / follow-up」節に転記 |
| `finding_type == needs_spec_decision` | 常に `manual_review_bucket` | apply しない |

`safe_first_step` の途中で更に判断が必要になったら、実行を止めて `can_continue_without_decision: false` に格上げして返す。

## 出力骨格 (新規検出時)

```json
{
  "domain": "refactor",
  "finding_type": "architecture_debt",
  "execution_mode": "staged_refactor",
  "direct_apply_safe": false,
  "why_not_direct_apply": "<一発では直せない理由>",
  "bulk_group": "<refactor-*>",
  "affected_paths": ["<path>/**"],
  "first_detected_at": "<today>",
  "last_seen_at": "<today>",
  "seen_count": 1,
  "risk_trend": "stable",
  "proposed_stages": ["<stage 1>", "..."],
  "safe_first_step": "<最初の stage で安全に実行できる作業>",
  "needs_human_decision": { "required": false },
  "recommended_runner": "refactor-expert",
  "post_check_expert": null
}
```

```text
既存負債は staged
新規悪化は block
```
