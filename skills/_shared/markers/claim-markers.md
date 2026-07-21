<!--
schema_version: 1
last_breaking_change: 2026-05-17
notes: v1 (2026-05-17) — op-architect (claim wave) が ADR-0006 §4.3 に基づき新設。
       op-run Issue claim 機構で使用する marker schema の正本ファイル。
       claim 機構は op-run が同一 Issue を複数 instance から同時 pick up する race を防ぐ。
       marker 名 / owner / consumer / core meaning は `labels-and-markers.md` (Claim Markers 節) が正本。
       本ファイルは `op-claim` / `op-cluster-manifest` の詳細 field schema / TTL 規約 / race 調停ルール /
       除外条件 / `op claim` CLI との対応を担当する。
       op-tools Rust 実装 (op-core/src/claim/ + op/src/commands/claim.rs) は別 Issue (C2/C3) で行う。

機能概要:
  op-run が Issue pick up 時に書き込む claim marker と cluster manifest marker の詳細 schema を集約する。
  `op:in-progress` label の付与 / 解除フロー、TTL ルール、race 調停方式、除外条件 (Patrol Ledger 等)
  を 1 箇所に集約する (Single Canonical Source Rule)。

作成意図:
  ADR-0006 §設計の骨子 §4.3 で確定した claim marker schema を prose 正本として固める。
  後続の Rust 実装 (C2) / op binary subcommand (C3) / op-run/SKILL.md 統合 (C4) が
  本ファイルを grep で参照可能にする。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Claim Markers 節が正本。
  - op-run/SKILL.md への claim 呼び出し挿入は別 Issue (C4) が担当。本ファイルは schema / 規約のみ。
  - `op-tools/crates/op-core/src/claim/` の Rust 実装は別 Issue (C2) が担当。
  - Patrol Ledger Issue (#30, `do-not-close` ラベル) および `op-state` ラベル付き永続 Issue は
    claim 対象外。除外条件は本ファイル §除外条件 節を参照。
-->

# Claim Markers — Detailed Schema

op-run が Issue 取得時に書き込む claim 系 marker の detailed schema 正本。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Claim Markers** 節が canonical。

op-run/SKILL.md への claim 呼び出し挿入手順は **C4 Issue 完了後** に追記される (現在未実装)。
op-tools Rust 実装の詳細は `op-tools/docs/specs/claim.md` (C2/C3 Issue 完了後に作成) を参照する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` (Claim Markers 節) |
| `op:in-progress` label の semantics | `skills/_shared/markers/labels-and-markers.md` (Active Issue Routing Labels 節) |
| op-run 運用フェーズ / claim 呼び出し手順 | `skills/op-run/SKILL.md` (C4 Issue 完了後に追記) |
| op claim acquire / release / status / sweep CLI 実装 | `op-tools/crates/op-core/src/claim/` (C2 Issue が担当) |
| claim CLI subcommand (clap) | `op-tools/crates/op/src/commands/claim.rs` (C3 Issue が担当) |

---

## `<!-- op-claim: ... -->` block schema

op-run が Issue を pick up した直後に Issue 本文の hidden marker block へ書き込む claim marker。
`op:in-progress` label の付与と同時に行い、release 時 (PR open / fail / abort) に削除する。

### 書き込み形式

```html
<!-- op-claim:
  task_id: fix-auth-20260516-143052-c1
  acquired_at: 2026-05-16T14:30:52+09:00
  ttl_seconds: 14400
  schema_version: 1
-->
```

### フィールド定義

| フィールド | 型 | 必須 | 制約 / 意味 |
|---|---|---|---|
| `task_id` | string | ✓ | op-run worktree の `<verb>-<short>-YYYYMMDD-HHMMSS-<cluster-id>` 形式。`worktree-ops.md` の task-id 命名規則に準拠 |
| `acquired_at` | string (ISO8601) | ✓ | claim 取得時刻 (+09:00 ローカル基準。타임존付与必須) |
| `ttl_seconds` | integer | ✓ | TTL 秒数。デフォルト `14400` (= 4h)。ADR-0006 §2 で確定 |
| `schema_version` | integer | ✓ | 現行 `1`。互換性管理用。`labels-and-markers.md` の schema_version とは独立 |

### `task_id` 命名規則 (worktree-ops.md 準拠)

```
<verb>-<short>-YYYYMMDD-HHMMSS-<cluster-id>
```

- `<verb>`: 作業の動詞 (例: `fix`, `add`, `refactor`)
- `<short>`: 短縮説明 (kebab-case)
- `YYYYMMDD-HHMMSS`: 秒粒度タイムスタンプ
- `<cluster-id>`: クラスタ ID (例: `c1`, `c2`)

例: `fix-auth-20260516-143052-c1`

---

## `<!-- op-cluster-manifest: ... -->` block schema

op-run が 1 つのクラスタに属する複数 Issue を紐付けるために書き込む manifest marker。
クラスタ内の全 Issue 本文に同じ `cluster_id` が付与される。

### 書き込み形式

```html
<!-- op-cluster-manifest:
  run_id: dbf4665bb7f1-20260516-143052
  cluster_id: c1
  cluster_issues: [42, 43, 44]
  acquired_at: 2026-05-16T14:30:52+09:00
  schema_version: 1
-->
```

### フィールド定義

| フィールド | 型 | 必須 | 制約 / 意味 |
|---|---|---|---|
| `run_id` | string | ✓ | op-run の run 識別子。`OP_RUN_BASE_SHA` 先頭 12 桁 + タイムスタンプ (`<base-sha-12>-<YYYYMMDD-HHMMSS>` 形式) |
| `cluster_id` | string | ✓ | クラスタ ID (例: `c1`, `c2`)。同一 run 内で一意 |
| `cluster_issues` | array<integer> | ✓ | このクラスタに属する Issue 番号の配列。並列実装される Issue 群 |
| `acquired_at` | string (ISO8601) | ✓ | manifest 書き込み時刻 (+09:00 ローカル基準) |
| `schema_version` | integer | ✓ | 現行 `1` |

### `run_id` 命名規則

```
<base-sha-12>-<YYYYMMDD-HHMMSS>
```

- `<base-sha-12>`: `OP_RUN_BASE_SHA` の先頭 12 桁 (base ref の確定 SHA)
- `<YYYYMMDD-HHMMSS>`: run 開始の秒粒度タイムスタンプ
- 例: `dbf4665bb7f1-20260516-143052`

---

## `op claim` CLI との対応 (op-tools C2/C3)

本ファイルの prose schema は Rust 実装 (`op-tools/crates/op-core/src/claim/`) と 1 対 1 で対応する。
CLI インターフェースは ADR-0006 §4.1 で確定済み:

```bash
# 取得試行 (op-run が Issue pick up 直後)
op claim acquire \
  --repo OWNER/NAME --issue 42 \
  --task-id fix-auth-20260516-143052-c1 \
  --ttl 4h
# exit 0 = 自分が owner / exit 1 = 他 instance が owner / exit 2 = API error

# 解放 (PR open / fail / abort 時)
op claim release --repo OWNER/NAME --issue 42 --task-id <task-id>

# 状態確認 (診断・debug 用)
op claim status --repo OWNER/NAME --issue 42

# stale 掃除 (schedule routine で定期実行)
op claim sweep --repo OWNER/NAME --label op:in-progress --ttl 4h
```

CLI 実装詳細は `op-tools/crates/op-core/src/claim/` を参照 (C2 Issue 完了後に実装)。

---

## TTL ルール

| 項目 | 値 | 根拠 |
|---|---|---|
| デフォルト TTL | 4h (14400 秒) | ADR-0006 §2: typical op-run 処理時間 (30分〜2時間) より十分長く、crash 時の deadlock も半日以内に解消 |
| TTL 超過判定 | `acquired_at + ttl_seconds < 現在時刻` | `op claim sweep` が定期実行で検出・解放 |
| sweep 定期実行 | `/schedule` routine で `op claim sweep` を自動実行 | C5 Issue (schedule 設定) が担当 |

TTL 超過で stale 化した claim は `op claim sweep` が `op:in-progress` label を削除し、Issue を再取得可能状態に戻す。

---

## race 調停ルール (ADR-0006 §3.1)

GitHub API には CAS がないため、`gh issue list` → `gh issue edit --add-label` の間で瞬間的な二重取得が起きうる。
最終調停は以下のいずれかを ADR で確定する (現行 pending):

| 案 | 調停方式 | 推奨 |
|---|---|---|
| (A) | 最古の `acquired_at` 勝者 | タイムスタンプ粒度に依存するためリスクあり |
| (B) | lexicographic 最小 task-id 勝者 | 決定論的、tiebreak 確定 (推奨) |
| (C) | N 秒待ち再取得で全 claim 確認、最古なら勝ち | 安全だが遅延発生 |

**重要**: 二重 claim が発生しても **長時間続くことはない** (TTL 4h 以内に掃除)。瞬間的な二重取得は受容済み。
調停方式の最終決定は ADR-0006 で行う (本 issue の prose schema は方式に依存しない)。

---

## 取得失敗時の挙動 (ADR-0006 §3.2)

`op claim acquire` が exit 1 (他 instance が owner) を返した場合の op-run 挙動:

| 案 | 挙動 |
|---|---|
| (A) | 次の Issue へ skip し、クラスタリングから除外 (推奨) |
| (B) | 全 op-run instance を abort |
| (C) | TTL 切れまで待機リトライ |

**現行推奨**: (A) 次 Issue へ skip。Plan mode 前に claim を取ることで、ユーザーが承認した後に claim 失敗する UX 劣化を防ぐ。
最終決定は ADR-0006 および op-run/SKILL.md 統合 Issue (C4) で確定する。

---

## 除外条件 (claim 対象外 Issue)

以下の条件を満たす Issue には `op:in-progress` label を付与せず、claim marker を書き込まない:

| 除外条件 | 理由 |
|---|---|
| `op-state` ラベル付き Issue (Patrol Ledger 等) | state を保持する永続 Issue はライフサイクルが通常 Issue と異なり、claim 対象外 |
| `do-not-close` ラベル付き Issue (Patrol Ledger #30 等) | 永続 Issue に claim marker を書き込むと state 追跡が汚染される |
| `op:in-progress` ラベルが既に付与されている Issue | 他 instance の claim 中。TTL 超過後に sweep で回収 |
| closed な Issue | op-run は open Issue のみを対象とする (ADR-0006 §設計制約 §5) |

**Patrol Ledger Issue (#30) の明示除外**: `do-not-close` / `op-state` ラベルが付与されているため、
`op claim acquire` は本 Issue を自動スキップする。Issue 取得クエリでの除外条件:
`--search "-label:op:in-progress -label:op-state -label:do-not-close"` を `skills/op-run/SKILL.md` (C4) に追加する。

---

## claim ライフサイクル

```
Issue open
    │
    ▼
op claim acquire (gh issue edit --add-label op:in-progress + marker 書き込み)
    │
    ├── exit 0 (自分が owner)
    │       │
    │       ▼
    │   クラスタ内で並列実装進行
    │       │
    │       ├── PR open 成功    → op claim release (label 削除 + marker 削除)
    │       ├── 実装失敗 / abort → op claim release (同上)
    │       └── crash / TTL 超過 → op claim sweep が定期実行で解放
    │
    └── exit 1 (他 instance が owner)
            │
            ▼
        Issue を skip → 次の Issue へ / 再クラスタリング (ADR-0006 §3.2)
```

---

## op-run Issue 取得クエリへの追加 (C4 で実装)

現状 op-run/SKILL.md の Issue 取得クエリ:
```bash
gh issue list --label "auto-report" --state open
```

C4 で追加する除外フィルタ:
```bash
gh issue list --label "auto-report" --state open \
  --search "-label:op:in-progress -label:op-state -label:do-not-close"
```

本節は C4 Issue (op-run/SKILL.md 統合) 完了後に実際の行番号を更新する。

---

## Lint Regression Examples

`op-tools/crates/op-core/tests/prose_examples.rs` が parse + lint clean を assert する canonical。
Rust struct schema (C2 Issue) 実装後に同期する (silent fork 防止、ADR-0003)。

```html
<!-- op-claim:
  task_id: fix-auth-20260516-143052-c1
  acquired_at: 2026-05-16T14:30:52+09:00
  ttl_seconds: 14400
  schema_version: 1
-->

<!-- op-cluster-manifest:
  run_id: dbf4665bb7f1-20260516-143052
  cluster_id: c1
  cluster_issues: [42, 43, 44]
  acquired_at: 2026-05-16T14:30:52+09:00
  schema_version: 1
-->
```
