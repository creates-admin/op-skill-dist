# Patrol Markers

Patrol Ledger Issue (label `op-patrol` + `op-state` + `do-not-close`、常に open) の **body 全体が巡回 state 文書**。
読み書きは `op patrol ledger pull` / `push` / `init` / `to-flags` だけで行い、手編集しない。コメントは機械が読まない。
型の正本は `op-core::patrol::ledger`、CLI 挙動は `op-tools/docs/specs/patrol-ledger.md`。

## `<!-- op-patrol-ledger-state -->` block schema

body は「prose ヘッダ → marker 行 → JSON fence」(`render_ledger_state` が生成する形):

````markdown
このIssueの本文は op-patrol の機械 state です。**手動で編集しないでください**。

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

| field | 意味 |
|---|---|
| `schema_version` | `2` |
| `type` | `"ledger_state"` |
| `updated_at` | 最終更新 (RFC3339) |
| `last_run_id` | 直近に適用した run (`run-<YYYY-MM-DD>-<NNN>`)。初期値 `null` |
| `state_rev` | push ごとに +1 (楽観ロック) |
| `area_state[<area>]` | `last_scanned_at` (RFC3339) / `scan_count_total` / `experts_used_recent` / `findings_count_total` (severity 別) / `created_issues` / `skipped_duplicates_total` / `failed_experts_total` / `last_run_id` |
| `next_candidates[]` | `{ area, score_hint }` (次回の区画選定の参考) |

## 更新と冪等性

- `op patrol ledger push --issue N --run-id <run-id> --previous-state <pull 出力 | auto> --updated-area <area>=<RFC3339>`:
  previous state の `last_run_id` が `--run-id` と同じなら no-op (`decision: warn`)。
- 並行書き込みは `state_rev` 照合で検出する (真の CAS ではない。単一 actor 前提)。
- marker の無い body は warning + 空 state (`op patrol ledger init --adopt-v2` へ誘導)。marker はあるが JSON が壊れている場合は block。
- `op-state` の Ledger が複数ある場合は最古の Issue を使う。
