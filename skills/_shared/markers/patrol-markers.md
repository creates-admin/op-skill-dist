# Patrol Markers

Patrol Ledger Issue (label `op-patrol` + `op-state` + `do-not-close`、常に open) の **body 全体が巡回 state 文書**。
読み書きは `op patrol ledger pull` / `push` / `init` / `to-flags` だけで行い、手編集しない。コメントは機械が読まない。

## `<!-- op-patrol-ledger-state -->` block schema

body は「prose ヘッダ → marker 行 → JSON fence」(CLI が生成する形):

````markdown
このIssueの本文は op-patrol の機械 state です。手動で編集しないでください。

<!-- op-patrol-ledger-state -->
## op-patrol ledger state

```json
{
  "schema_version": 2,
  "type": "ledger_state",
  "updated_at": "2026-07-23T10:00:00+09:00",
  "last_run_id": "run-2026-07-23-001",
  "state_rev": 42,
  "area_state": {
    "src-tauri/src/commands/export": {
      "last_scanned_at": "2026-05-28T10:00:00+09:00",
      "scan_count_total": 8,
      "experts_used_recent": ["security-expert", "debug-expert"],
      "findings_count_total": { "critical": 1, "high": 7 },
      "created_issues": [125, 126, 140],
      "skipped_duplicates_total": 4,
      "failed_experts_total": 0,
      "last_run_id": "run-2026-05-28-001"
    }
  },
  "next_candidates": [
    { "area": "crates/job_queue", "score_hint": 70 }
  ]
}
```
````

## 更新と冪等性

- `op patrol ledger push --issue N --run-id <run-id> --previous-state <pull 出力 | auto> --updated-area <area>=<RFC3339>`。
  同じ `--run-id` の再送は no-op。
- `state_rev` は push ごとに +1 する楽観ロック (真の CAS ではない)。単一 actor 前提で運用する。
- marker の無い body は `op patrol ledger init --adopt-v2` で v2 skeleton にする。
