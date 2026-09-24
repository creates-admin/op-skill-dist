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

| field | 制約 |
|---|---|
| `task_id` | worktree task-id `<verb>-<short>-YYYYMMDD-HHMMSS-<cluster-id>` (`worktree-ops.md`) |
| `acquired_at` | ISO8601、タイムゾーン必須 |
| `ttl_seconds` | 既定 `14400` (4h) |
| `schema_version` | `1` |

未知 field は parse error。

## CLI

| 操作 | コマンド | 結果 |
|---|---|---|
| 取得 | `op claim acquire` (cluster 確定後・plan gate 前) | exit 0 = 自分が owner / 1 = 他 instance が owner (その Issue は skip) / 2 = API error |
| 解放 | `op claim release` (PR open / 失敗 / abort 時) | label と marker を削除 |
| 確認 | `op claim status` | 診断用 |
| 掃除 | `op claim sweep` (定期実行) | TTL 超過の claim を解放 |

- 二重 claim の勝者は `task_id` の辞書順最小 (決定論)。
- TTL 超過 = `acquired_at + ttl_seconds < 現在時刻`。
- mcp channel では `op claim` は使えない (op-run は claim を skip する)。

## 除外条件

次の Issue には claim しない: `op-state` / `do-not-close` 付き (Ledger 等の永続 Issue)、`op:in-progress` 付き (他 instance が占有中)、closed。
op-run の Issue 取得は `-label:op:in-progress -label:op-state -label:do-not-close` で除外する。
