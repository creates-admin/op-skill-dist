# report-schema.md — refactor-expert payload schema

- scan / patrol finding: `op help payload refactor-finding --json`。debt 系の分類と追跡値は `architecture-debt.md`
- apply 完了報告: `~/.claude/skills/_shared/expert-report-schemas.md`「修正完了報告 schema」+ 下の「Apply Report」の refactor 固有フィールド

## Canonical Schema Contract

scan / patrol の出力は `_shared/expert-report-schemas.md`「scan 出力 envelope 契約」節の envelope (`{"findings": [...]}`) で返す。
payload の正本は `op help payload refactor-finding --json`。

- domain: `"refactor"` / recommended_runner: `"refactor-expert"`
- post_check_expert の選択基準は `post-check-policy.md`
- fingerprint 文字列は finding に埋めない。`files` / `symbols` / `bulk_group` / `affected_paths` を正確に埋めれば op-scan / op-patrol が CLI で生成する

## Apply Report

refactor 固有:

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
