<!--
schema_version: 1
last_breaking_change: 2026-05-06
notes: v1 (2026-05-06) — Marker schema 分割 (followup #20) で patrol 系 marker
       (`op-patrol-run` / `op-patrol-checkpoint`) の Patrol Ledger コメント JSON schema を
       `op-patrol/SKILL.md` から切り出した正本ファイル。
       他 5 領域 (review / post-check / security / ux-ui / merge-gate) と同じ
       「shared marker detail は `_shared/<domain>-markers.md`」設計に揃え、
       将来 op-merge / 別 skill が patrol marker を読む需要が出た際の参照先を 1 箇所にする。
       marker 名 / owner / consumer / core meaning は引き続き `labels-and-markers.md` が正本。

機能概要:
  op-patrol が Patrol Ledger Issue (op-state ラベル付き専用 Issue) のコメントとして投稿する
  巡回 run と checkpoint の JSON schema、area_state 構造、ロード手順、parse 失敗時のフォールバック、
  compact 条件を集約する。

作成意図:
  これまで patrol Ledger の JSON schema は `op-patrol/SKILL.md` 内にのみ記述されていたが、
  他 5 domain (review / post-check / security / ux-ui / merge-gate) は `_shared/<domain>-markers.md`
  に detail schema を集約済みで、設計の対称性が崩れていた。本ファイル新設で「shared marker detail
  は `_shared/<domain>-markers.md` を SSoT とする」というパターンを全 domain で統一する。
  op-patrol/SKILL.md は引き続き運用手順 (gh コマンド / フェーズ進行 / 手動操作) の正本だが、
  JSON field schema と validation rule は本ファイルに移管する。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Patrol Markers 節が正本。
  - op-patrol の運用フェーズ (0 〜 7) / gh コマンド / Patrol Ledger Issue の作成手順は
    `op-patrol/SKILL.md` を引き続き正本とする。本ファイルは JSON schema / area_state 構造 /
    ロード手順 / parse fallback / compact 条件のみを担当する。
  - 旧 `.op/patrol-state.json` 方式は廃止 (現行は GitHub Issue Ledger 一本)。
-->

# Patrol Markers — Detailed Schema

op-patrol が Patrol Ledger Issue のコメントに投稿する巡回 run / checkpoint marker の detailed schema 正本。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Patrol Markers** 節が canonical。

op-patrol の運用フェーズ進行 / gh コマンド / Patrol Ledger Issue の作成・検索・手動操作は
`skills/op-patrol/SKILL.md` を引き続き正本とする。本ファイルは Ledger コメントの **JSON 構造 /
field 単位 schema / area_state 形式 / ロード手順 / parse fallback / compact 条件** に責務を限定する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` |
| op-patrol 運用フェーズ / gh コマンド / Ledger Issue 作成手順 / 手動操作 | `skills/op-patrol/SKILL.md` |
| 区画選定スコアリング / `last_scanned_at` 経過日数式 / risk_trend 算出 | `skills/op-patrol/SKILL.md` フェーズ2〜3 |
| architecture_debt 追跡 / `op-refactor-debt-key` の運用 | `skills/_shared/dedup-policy.md` (architecture_debt 補助 marker 節) |
| `op-state` / `op-patrol` / `do-not-close` ラベル semantics | `skills/_shared/markers/labels-and-markers.md` (Active Issue Routing Labels 節) |

---

## Patrol Ledger Issue の概要 (pointer)

Patrol Ledger は **op-patrol が巡回履歴を保持する唯一の正本**。具体的な検索 / 作成 / 運用手順は
`skills/op-patrol/SKILL.md` の「Patrol Ledger Issue の仕様」節を参照する。本ファイルでは概念のみ示す:

- ラベル: `op-patrol` / `op-state` / `do-not-close` (3 つすべて必須)
- state: 常に `open` (close しない)
- 本文: 運用説明のみ。state 自体は本文に持たない (= コメント側で管理)
- コメント append-only: 各 run と checkpoint をコメントとして追記
- ローカルキャッシュ無し: state を参照したい agent は本 Issue のコメントを毎回読む

---

## `<!-- op-patrol-run: <run-id> -->` block schema

1 回の op-patrol 起動で audit した結果を記録するコメント marker。Patrol Ledger Issue にコメントとして
append-only で追加する。

### コメント全体構造

````markdown
<!-- op-patrol-run: run-2026-05-03-001 -->
## op-patrol run: run-2026-05-03-001

```json
{
  "schema_version": 1,
  "type": "run",
  "run_id": "run-2026-05-03-001",
  "ran_at": "2026-05-03T10:00:00+09:00",
  "budget": "medium",
  "flags": ["--stale"],
  "random_seed": null,
  "selected_areas": [
    {
      "area": "src-tauri/src/commands/export",
      "experts_used": ["security-expert", "debug-expert"],
      "findings_count": { "critical": 1, "high": 1 },
      "created_issues": [125],
      "skipped_duplicates": 1,
      "failed_experts": []
    }
  ],
  "issues_created_total": 5,
  "issues_skipped_total": 2,
  "next_candidates_hint": ["crates/job_queue", "src-tauri/src/auth"]
}
```
````

### top-level fields

| フィールド | 型 | 必須 | 制約 / 意味 |
|---|---|---|---|
| `schema_version` | integer | ✓ | 現行 `1`。互換性管理用 |
| `type` | string | ✓ | 必ず `"run"` (checkpoint と区別) |
| `run_id` | string | ✓ | `run-<YYYY-MM-DD>-<NNN>` 形式。同日に複数 run があれば `001` から連番 |
| `ran_at` | string (ISO8601) | ✓ | run 開始時刻 |
| `budget` | enum | ✓ | `small` / `medium` / `large` (op-patrol/SKILL.md の budget tier に対応) |
| `flags` | array<string> | ✓ | 起動時 flag (`--stale` / `--all` / `--dry-run` 等)。なければ `[]` |
| `random_seed` | integer \| null | ✓ | 区画選定の乱数 seed。再現性が要らない通常運用は `null` |
| `selected_areas` | array<area_record> | ✓ | 今回 audit した区画の配列。Issue 起票 0 件の area もカバー (`last_scanned_at` 更新のため) |
| `issues_created_total` | integer | ✓ | 全 area 合計の起票数 |
| `issues_skipped_total` | integer | ✓ | 全 area 合計の duplicate skip 数 |
| `next_candidates_hint` | array<string> | ✓ | 次回優先候補。今回 plan で除外した上位候補を文字列配列で記録 (詳細スコアは checkpoint 側) |

<a id="patrol-run-area-record-schema"></a>
### `selected_areas[]` 要素 (area_record) schema

| フィールド | 型 | 必須 | 制約 / 意味 |
|---|---|---|---|
| `area` | string | ✓ | 論理区画識別子 (例: `src-tauri/src/commands/export`)。`<!-- op-area: <area> -->` marker と整合 |
| `experts_used` | array<string> | ✓ | 今回 audit に使った expert 名の配列。**active expert のみ** (planned expert は不可) |
| `findings_count` | object | ✓ | severity 別の起票数 `{critical, high, medium?, low?}`。op-patrol が起票するのは Critical / High のみだが拡張用に object 形式 |
| `created_issues` | array<integer> | ✓ | 起票した Issue 番号の配列。なければ `[]` |
| `skipped_duplicates` | integer | ✓ | dedup-policy で既存 Issue に集約された件数 |
| `failed_experts` | array<string> | ✓ | spawn 失敗した expert 名の配列。`runtime-contract.md` の planned skip と区別する (planned は対象外、ここは active expert の spawn 失敗のみ) |

### `run_id` の命名規則

```
run-<YYYY-MM-DD>-<NNN>
```

- `<YYYY-MM-DD>`: `ran_at` の日付部分 (`+09:00` ローカル基準)
- `<NNN>`: 同日 N 番目の run。3 桁ゼロ埋め
- 例: `run-2026-05-03-001` / `run-2026-05-03-002`

衝突時 (Patrol Ledger に既存の `run-<date>-<NNN>` がある場合) は次の連番に進める (例: `001` 既存なら `002`)。

---

## `<!-- op-patrol-checkpoint: <checkpoint-id> -->` block schema

複数の run コメントを集約した area_state スナップショット。run コメントが 30 件以上たまった場合 / 手動 compact 時に
追加する。Patrol Ledger Issue の履歴肥大化対策。

### コメント全体構造

````markdown
<!-- op-patrol-checkpoint: checkpoint-2026-06-01-001 -->
## op-patrol ledger checkpoint: checkpoint-2026-06-01-001

```json
{
  "schema_version": 1,
  "type": "checkpoint",
  "checkpoint_id": "checkpoint-2026-06-01-001",
  "created_at": "2026-06-01T10:00:00+09:00",
  "covers_runs_until": "run-2026-06-01-001",
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
    { "area": "crates/job_queue", "score_hint": 70 },
    { "area": "src-tauri/src/auth",  "score_hint": 68 }
  ]
}
```
````

### top-level fields

| フィールド | 型 | 必須 | 制約 / 意味 |
|---|---|---|---|
| `schema_version` | integer | ✓ | 現行 `1`。互換性管理用 |
| `type` | string | ✓ | 必ず `"checkpoint"` (run と区別) |
| `checkpoint_id` | string | ✓ | `checkpoint-<YYYY-MM-DD>-<NNN>` 形式 (run と同じ命名規則) |
| `created_at` | string (ISO8601) | ✓ | checkpoint 作成時刻 |
| `covers_runs_until` | string | ✓ | 本 checkpoint が集約した最新の `run_id`。これより新しい run コメントは適用対象 |
| `area_state` | object<string, area_state_record> | ✓ | `area` 文字列をキーとする dict。値は area_state_record |
| `next_candidates` | array<candidate> | ✓ | 今回 plan で除外した上位候補と `score_hint` (区画選定の参考値) |

<a id="patrol-checkpoint-area-state-schema"></a>
### `area_state[<area>]` 要素 (area_state_record) schema

| フィールド | 型 | 必須 | 集約方法 (run → checkpoint) |
|---|---|---|---|
| `last_scanned_at` | string (ISO8601) | ✓ | 該当 area の最新 `ran_at` |
| `scan_count_total` | integer | ✓ | 該当 area が `selected_areas` に登場した回数 (加算) |
| `experts_used_recent` | array<string> | ✓ | 直近 3 run の `experts_used` の和集合 |
| `findings_count_total` | object | ✓ | severity 別の起票数の累積 (run の `findings_count` を加算) |
| `created_issues` | array<integer> | ✓ | 起票 Issue 番号の累積 (重複除去して保持) |
| `skipped_duplicates_total` | integer | ✓ | run の `skipped_duplicates` の累積 |
| `failed_experts_total` | integer | ✓ | run の `failed_experts.length` の累積 |
| `last_run_id` | string | ✓ | 該当 area の最新 `run_id` |

### `next_candidates[]` 要素 (candidate) schema

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `area` | string | ✓ | 候補区画識別子 |
| `score_hint` | integer | ✓ | 区画選定スコアの参考値 (詳細算出は `op-patrol/SKILL.md` フェーズ2〜3) |

### `checkpoint_id` の命名規則

```
checkpoint-<YYYY-MM-DD>-<NNN>
```

- `<YYYY-MM-DD>`: `created_at` の日付部分 (`+09:00` ローカル基準)
- `<NNN>`: 同日 N 番目の checkpoint。3 桁ゼロ埋め
- 例: `checkpoint-2026-06-01-001`

---

## state 復元手順 (Ledger ロード)

op-patrol は起動時に Patrol Ledger Issue のコメントから area_state を復元する。手順:

1. 全コメント本文から HTML マーカーで type を判定する
   - `<!-- op-patrol-checkpoint: <id> -->` → checkpoint
   - `<!-- op-patrol-run: <id> -->` → run
2. checkpoint コメントを `created_at` 降順に並べ、**最新 checkpoint** を選ぶ
3. 最新 checkpoint の JSON を parse して `area_state` を復元
4. checkpoint の `covers_runs_until` 以降に投稿された run コメントを順に適用 (差分マージ)

差分マージのルール:

| run の値 | area_state への反映 |
|---|---|
| `area_record.area` が新規 | 新規 area として `area_state` に追加 (初期値で初期化) |
| 既存 area の `experts_used` | `experts_used_recent` の直近 3 run に追加 (古いものは drop) |
| 既存 area の `findings_count` | `findings_count_total` に加算 |
| 既存 area の `created_issues` | `created_issues` に重複除去で追加 |
| 既存 area の `skipped_duplicates` | `skipped_duplicates_total` に加算 |
| 既存 area の `failed_experts.length` | `failed_experts_total` に加算 |
| `ran_at` | `last_scanned_at` を上書き (常に最新) |
| `run_id` | `last_run_id` を上書き |

---

## parse 失敗時のフォールバック

JSON parse が失敗するケース (Issue 編集ミス / マニュアル介入 / schema_version 不整合) のフォールバック:

1. 最新 checkpoint の JSON parse に失敗 → 1 つ前の checkpoint を試す
2. それも失敗 → run コメントを **古い順** に可能な範囲で適用する
3. それでも復元できない場合は `area_state = 空 (= {})` でフォールバックし、最終報告に
   **`ledger parse warning`** を出す

`area_state = 空` で続行した場合、巡回履歴は失われた状態で次回 audit を走らせるため、結果として
全 area が「未巡回扱い」になる。これは安全側に倒した挙動 (履歴が無いから何も巡回しない、ではなく、
履歴が無いから腐敗度を再評価する)。

---

## compact 条件 (checkpoint 追加判定)

以下のいずれかを満たす場合、フェーズ7-3 で checkpoint コメントを追加する:

| 条件 | 起動方法 |
|---|---|
| 自動 compact: 最新 checkpoint 以降の run コメントが **30 件以上** (checkpoint が 1 つも無い場合は run コメント 30 件以上) | 通常 audit run 内で自動判定 |
| 手動 compact: `--compact-ledger` フラグが指定された | `/op-patrol --compact-ledger` (この場合 audit はスキップ、フェーズ0 → 7-3 → 7-5 のみ実行) |

### checkpoint 生成手順

1. 最新 checkpoint と以降の全 run コメントから area_state を再構築 (上記「state 復元手順」と同じロジック)
2. 区画ごとに集約:
   - `last_scanned_at` = 最新の `ran_at`
   - `scan_count_total` = 加算
   - `experts_used_recent` = 直近 3 run の和集合
   - `findings_count_total` = 加算
   - `created_issues` = 重複除去して保持
   - `skipped_duplicates_total` = 加算
   - `failed_experts_total` = 加算
   - `last_run_id` = 最新の `run_id`
3. `next_candidates` は今回 plan で「除外した上位候補」を保存
4. checkpoint コメントを Patrol Ledger Issue に投稿

### 古い run コメントの扱い

checkpoint 追加後も **run コメントは原則削除しない**。監査ログとしての完全性を守るため。
ただし「最新 checkpoint 以降の run コメント数」をカウントする際は、最新 checkpoint より新しい run のみを対象とする
(checkpoint より古い run は area_state に既に集約済み)。

---

## 重複検出 / 衝突回避

Patrol Ledger に同じ `run_id` / `checkpoint_id` のコメントを重複追加してはならない。

- 起動時に Ledger をロードした際、同 id の既存コメントを発見したら次の連番に進める
- 同日 (`<YYYY-MM-DD>`) に既に N 件あれば次は `(N+1)` 番目の連番

複数の Patrol Ledger Issue が `op-state` ラベルで見つかった場合の正本選択は
`op-patrol/SKILL.md` フェーズ0 を参照 (= 最も古い `createdAt` の Issue を採用)。

---

## architecture_debt 追跡との関係

`finding_type: architecture_debt` (および `staged_refactor` / `needs_spec_decision`) の finding は
**GitHub Issue の本文 marker (`<!-- op-refactor-debt-key -->`) を正本** として追跡する。
Patrol Ledger には専用 index を持たせない。

op-patrol は架空の `seen_count` / `last_seen_at` / `risk_trend` を agent に推測させない。
代わりに `op-patrol/SKILL.md` の「architecture_debt の追跡方式」節に従い、既存 Issue を本文 marker
経由で更新する (詳細は `dedup-policy.md` の architecture_debt 補助 marker 節)。

---

## 互換性 / Deprecated

| 旧仕様 | 状態 | 取り扱い |
|---|---|---|
| `.op/patrol-state.json` (ローカルキャッシュ方式) | deprecated | 廃止済み。読み込まない / 更新しない / 削除しない (ユーザーが手動判断)。最終報告に「旧 ローカル state ファイルを検出。現行は GitHub Issue Ledger 方式のため参照していない」と注意のみ表示 |

新規 op-patrol run でローカル state ファイルを生成・読み取りしてはならない。Patrol Ledger Issue が唯一の正本。
