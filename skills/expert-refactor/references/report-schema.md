# report-schema.md — refactor-expert payload schema (pointer)

## 正本

- scan / patrol finding (`finding_type` で immediate_refactor と architecture_debt を分岐): `op help payload refactor-finding --json`
  (Rust types: `op-core::payload::refactor_finding`)
- apply report: `op help payload apply-report --json`。refactor 固有フィールド (`contract_preservation` 等) は SKILL.md「Apply Report」節

schema 違反 (必須フィールド欠落 / enum 不正値) は immediate fail。

## 補足

- architecture_debt の累積値は agent が暫定値 (`seen_count: 1` / `risk_trend: "stable"` / `first_detected_at = last_seen_at = today`) のみ返す
  (`architecture-debt.md`「Tracking Policy」)。
- fingerprint 文字列は finding に埋めない。`files` / `symbols` / `bulk_group` / `affected_paths` を埋めれば op-scan / op-patrol が CLI で生成する。
