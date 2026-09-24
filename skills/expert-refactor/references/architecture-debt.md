# Architecture Debt

一度の op-run で安全に直せない構造負債を `ignored_noise` にせず、分解して追跡する。
`architecture_debt` は direct apply しない (`safe_first_step` のみ op-run で実行可)。
field と shape の正本は `op help payload refactor-finding --json`。

## Classification

| finding_type | execution_mode | direct_apply_safe | 条件 |
|---|---|---|---|
| `immediate_refactor` | `direct_apply` | `true` | 同一 feature 内の god function 分解 / scattered token 共通化 / 単一ファイル内の guard clause 化など。public API / serialized format / IPC contract に影響しない |
| `staged_refactor` | `staged_refactor` | `false` | 数段階に分ければ安全に直せる。各 stage は immediate_refactor 相当。`safe_first_step` と順序付き `proposed_stages` を必ず出す |
| `architecture_debt` | `staged_refactor` | `false` | 一発では直せない / 複数 feature・layer に跨る / 仕様・保存形式・directory 方針の合意が要る / 放置すると悪化する |
| `needs_spec_decision` | `needs_human_decision` | `false` | public API / serialized format / IPC contract 変更やディレクトリ方針の決定が要る。`needs_human_decision.required: true` (`decision_type: "spec"` または `"boundary"`)。refactor-expert 単独では実行しない |

`proposed_stages` の例: `feature 内 literal を inventory する` → `feature-local path contract を作る (移動なし)` → `frontend literals を contract 経由に置換` → `重複 helper を削除`。

## Severity Exception

`architecture_debt` は現在の破壊度に加え、以下のいずれかで High に昇格できる:

- 変更頻度が高い feature に存在する
- 新規実装が同じ負債を悪化させている (`blocking: true` も付ける)
- file IO / path / IPC / config / storage / serialized data に絡む
- 依存逆流により複数 feature へ波及している
- `seen_count >= 3` (op-patrol が渡す値をそのまま当てはめる。新規検出時は常に 1 なので該当しない)
- `affected_paths` が増加している
- shared / common / utils に feature 固有責務が漏れている

## Tracking Policy

- agent が返す累積値は固定: `seen_count: 1` / `risk_trend: "stable"` / `first_detected_at = last_seen_at = 【実行日】`。
  日付は spawn prompt の【実行日】を使う (`date` を実行しない)。累積値の更新は op-patrol の責務。
- agent は GitHub Issue を読まず、過去回数を推測しない。`risk_trend` を `worsening` / `spreading` に確定しない。ラベルを付けない。
- `affected_paths` は `architecture_debt` / `staged_refactor` / `needs_spec_decision` で必須。追跡キーの LCA 計算に使うので、実際の影響範囲だけを列挙する
  (広いほど LCA が浅くなる)。

## op-run / apply での扱い

`proposed_stages` は PR 本文に参考として書く (1 stage = 1 PR)。`needs_human_decision.required: true` を含む場合の apply での挙動:

| 条件 | apply での挙動 |
|---|---|
| `can_continue_without_decision: false` | apply しない |
| `can_continue_without_decision: true` かつ `finding_type != needs_spec_decision` (`needs:human-decision-followup` ラベル) | `safe_first_step` のみ。`blocked_actions[]` を実行しない。block を完了報告と PR 本文「残存リスク / follow-up」節に転記 |
| `finding_type == needs_spec_decision` | apply しない |

`safe_first_step` の途中で更に判断が必要になったら、実行を止めて `can_continue_without_decision: false` に格上げして返す。
