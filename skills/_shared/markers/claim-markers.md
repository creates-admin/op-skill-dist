# Claim Markers

op-run が Issue を占有 (claim) していることを示す。`op claim acquire` が Issue body に marker を書き、
`op:in-progress` label と同時に付与・削除する (label + marker の AND が claim)。手で書かない。

## `<!-- op-claim: ... -->` block schema

```html
<!-- op-claim:
  task_id: fix-auth-20260516-143052-c1
  acquired_at: 2026-05-16T14:30:52+09:00
  ttl_seconds: 14400
  schema_version: 1
-->
```

`task_id` は worktree task-id (`worktree-ops.md`)、`ttl_seconds` の既定は `14400` (4h)。

## CLI

| 操作 | コマンド | 結果 |
|---|---|---|
| 取得 | `op claim acquire` (cluster 確定後・plan gate 前) | exit 0 = 自分が owner / 1 = 他 instance が owner (その Issue は skip) / 2 = API error |
| 解放 | `op claim release` (PR open / 失敗 / abort 時) | label と marker を削除 |
| 確認 | `op claim status` | 診断用 |
| 掃除 | `op claim sweep` (定期実行) | TTL 超過の claim を解放 |

mcp channel では `op claim` は使えない (op-run は claim を skip する。手順は op-run skill の 1-2-e)。

## 除外条件

次の Issue には claim しない: `op-state` / `do-not-close` 付き (Ledger 等の永続 Issue)、`op:in-progress` 付き (他 instance が占有中)、closed。
