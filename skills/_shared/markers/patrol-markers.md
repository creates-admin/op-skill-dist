<!--
schema_version: 2
last_breaking_change: 2026-07-23
notes: v2 (2026-07-23) — ADR-0026 (Patrol Ledger v2: body 型 state 文書への再設計、PR-2)。
       Ledger Issue の **body** を「機械が読む現在 state (単一 JSON 文書)」として再定義し、
       `<!-- op-patrol-ledger-state -->` block を新設した。`<!-- op-patrol-checkpoint -->` block
       (コメント側の集約スナップショット) は **廃止** (state は body 1 箇所に一本化されたため)。
       `<!-- op-patrol-run -->` block は監査ログ専用 (機械は二度と読まない) に位置づけを変更し、
       parse fallback / 差分マージ等の「機械が読む」ロジックを削除した (コメント body の JSON 構造・
       fingerprint marker 行の形式自体は不変)。fingerprint prefix は `patrol-checkpoint:` → `patrol-run:`
       に改名 (v1 の `patrol-checkpoint:` は誤 leftover。監査ログ専用で機械非読のため下位互換は不要)。
       v1 の「state 復元手順 (checkpoint + run 差分マージ)」「parse フォールバック」「compact 条件」の
       節は body 全置換モデルでは概念ごと消滅したため削除し、ロード手順は「body 1 読み」への pointer に
       置換した。破壊的変更のため schema_version を 1→2 に bump。
       v1 (2026-05-06) — Marker schema 分割 (followup #20) で patrol 系 marker
       (`op-patrol-run` / `op-patrol-checkpoint`) の Patrol Ledger コメント JSON schema を
       `op-patrol/SKILL.md` から切り出した正本ファイル。
       他 5 領域 (review / post-check / security / ux-ui / merge-gate) と同じ
       「shared marker detail は `_shared/<domain>-markers.md`」設計に揃え、
       将来 op-merge / 別 skill が patrol marker を読む需要が出た際の参照先を 1 箇所にする。
       marker 名 / owner / consumer / core meaning は引き続き `labels-and-markers.md` が正本。

機能概要:
  op-patrol が Patrol Ledger Issue (op-state ラベル付き専用 Issue) の **body** に持つ現在 state 文書
  (`<!-- op-patrol-ledger-state -->`) の JSON schema、および人間向け監査ログとしてコメントに残る
  run 記録 (`<!-- op-patrol-run -->`) の JSON schema を集約する (ADR-0026)。

作成意図:
  これまで patrol Ledger の JSON schema は `op-patrol/SKILL.md` 内にのみ記述されていたが、
  他 5 domain (review / post-check / security / ux-ui / merge-gate) は `_shared/<domain>-markers.md`
  に detail schema を集約済みで、設計の対称性が崩れていた。本ファイル新設で「shared marker detail
  は `_shared/<domain>-markers.md` を SSoT とする」というパターンを全 domain で統一する。
  v2 (ADR-0026) では、MCP コメント read の hidden marker sanitize 制約 (`github-channel.md` §6) と
  正面衝突していた「機械が複数コメントを合成して state を復元する」設計を廃し、
  「body = 機械が読む単一 state 文書 / コメント = 人間向け append-only 監査ログ (機械は二度と読まない)」
  という設計へ作り替えた。これにより mcp channel でも Ledger の read/write が成立する。
  op-patrol/SKILL.md は引き続き運用手順 (op CLI コマンド / フェーズ進行 / 手動操作) の正本だが、
  JSON field schema と validation rule は本ファイルに移管する。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Patrol Markers 節が正本。
  - op-patrol の運用フェーズ (0 〜 7) / op CLI コマンド / Patrol Ledger Issue の作成手順は
    `op-patrol/SKILL.md` を引き続き正本とする。本ファイルは JSON schema / area_state 構造 のみを担当する
    (v1 にあった「ロード手順 / parse fallback / compact 条件」は v2 で概念ごと消滅した)。
  - 旧 `.op/patrol-state.json` 方式は廃止 (現行は GitHub Issue Ledger 一本)。
  - CLI 実装詳細 (parser / serializer / 冪等性の実装) は `op-tools/docs/specs/patrol-ledger.md`、
    設計判断の記録は `op-tools/docs/adr/0026-patrol-ledger-v2-body-state.md` を参照。
-->

# Patrol Markers — Detailed Schema

op-patrol が Patrol Ledger Issue の body / コメントに持つ marker の detailed schema 正本 (v2、ADR-0026)。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Patrol Markers** 節が canonical。

op-patrol の運用フェーズ進行 / op CLI コマンド / Patrol Ledger Issue の作成・検索・手動操作は
`skills/op-patrol/SKILL.md` を引き続き正本とする。本ファイルは Ledger body / コメントの **JSON 構造 /
field 単位 schema / area_state 形式** に責務を限定する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` |
| op-patrol 運用フェーズ / op CLI コマンド / Ledger Issue 作成手順 / 手動操作 | `skills/op-patrol/SKILL.md` |
| 区画選定スコアリング / `last_scanned_at` 経過日数式 / risk_trend 算出 | `skills/op-patrol/SKILL.md` フェーズ2〜3 |
| `op patrol ledger` CLI 実装詳細 (parser / serializer / 冪等性 / channel 別挙動) | `op-tools/docs/specs/patrol-ledger.md` |
| v2 再設計の設計判断・根拠 | `op-tools/docs/adr/0026-patrol-ledger-v2-body-state.md` |
| architecture_debt 追跡 / `op-refactor-debt-key` の運用 | `skills/_shared/dedup-policy.md` (architecture_debt 補助 marker 節) |
| `op-state` / `op-patrol` / `do-not-close` ラベル semantics | `skills/_shared/markers/labels-and-markers.md` (Active Issue Routing Labels 節) |

---

## Patrol Ledger Issue の概要 (pointer、v2)

Patrol Ledger は **op-patrol が巡回履歴を保持する唯一の正本**。具体的な検索 / 作成 / 運用手順は
`skills/op-patrol/SKILL.md` の「Patrol Ledger Issue の仕様」節を参照する。本ファイルでは概念のみ示す:

- ラベル: `op-patrol` / `op-state` / `do-not-close` (3 つすべて必須)
- state: 常に `open` (close しない)
- **body = 機械が読む現在 state (単一 JSON 文書)**。`<!-- op-patrol-ledger-state -->` marker を持つ
  (詳細は下記「`<!-- op-patrol-ledger-state -->` block schema」節)
- **コメント = 人間向け append-only 監査ログ (機械は二度と読まない)**。1 回の巡回結果を
  `<!-- op-patrol-run -->` コメントとして追記する
- ローカルキャッシュ無し: state を参照したい agent は本 Issue の body を毎回読む
  (`op patrol ledger pull`)

---

## `<!-- op-patrol-ledger-state -->` block schema

Patrol Ledger Issue の **body 全体**を構成する state 文書。ADR-0026 の
「body = 機械が読む現在 state (単一の JSON 文書)」を実現する marker。更新は body 全置換
(`op issue edit-body` / mcp channel では同名 call-spec) で行う。

### body 全体構造

body は「人間向け prose ヘッダ → marker 行 → JSON code fence」で構成する
(`op_core::patrol::ledger::render_ledger_state` が機械的に生成する形式そのもの):

````markdown
このIssueの本文は op-patrol の機械 state です。**手動で編集しないでください**。
巡回履歴は本 Issue のコメント (監査ログ) を参照してください。

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
    { "area": "crates/job_queue", "score_hint": 70 },
    { "area": "src-tauri/src/auth",  "score_hint": 68 }
  ]
}
```
````

### top-level fields

| フィールド | 型 | 必須 | 制約 / 意味 |
|---|---|---|---|
| `schema_version` | integer | ✓ | 現行 `2`。互換性管理用 (v1 の「本文は運用説明のみ、state はコメント側」からの破壊的変更) |
| `type` | string | ✓ | 必ず `"ledger_state"` |
| `updated_at` | string (RFC3339) | ✓ | state を最後に更新した時刻 |
| `last_run_id` | string \| null | ✓ | 直近適用した run の ID。初期状態は `null` |
| `state_rev` | integer | ✓ | 単調増加する state のリビジョン番号 (push のたびに +1、並行書き込み検出の楽観ロックに使う) |
| `area_state` | object<string, area_state_record> | ✓ | `area` 文字列をキーとする dict。値は area_state_record (shape は v1 checkpoint 側と同一) |
| `next_candidates` | array<candidate> | ✓ | 今回 plan で除外した上位候補と `score_hint` (区画選定の参考値) |

<a id="patrol-ledger-state-area-state-schema"></a>
### `area_state[<area>]` 要素 (area_state_record) schema

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `last_scanned_at` | string (RFC3339) | ✓ | 該当 area の最新 `ran_at` |
| `scan_count_total` | integer | ✓ | 該当 area が巡回対象になった回数 (加算) |
| `experts_used_recent` | array<string> | ✓ | 直近使用した expert 名の配列 |
| `findings_count_total` | object | ✓ | severity 別の起票数の累積 `{critical, high, medium?, low?}` |
| `created_issues` | array<integer> | ✓ | 起票 Issue 番号の累積 |
| `skipped_duplicates_total` | integer | ✓ | dedup で既存 Issue に集約された件数の累積 |
| `failed_experts_total` | integer | ✓ | spawn 失敗した expert 数の累積 |
| `last_run_id` | string | ✓ | 該当 area の最新 `run_id` |

### `next_candidates[]` 要素 (candidate) schema

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `area` | string | ✓ | 候補区画識別子 |
| `score_hint` | integer | ✓ | 区画選定スコアの参考値 (詳細算出は `op-patrol/SKILL.md` フェーズ2〜3) |

### `run_id` (`last_run_id`) の命名規則

```
run-<YYYY-MM-DD>-<NNN>
```

- `<YYYY-MM-DD>`: run 実行日の日付部分 (`+09:00` ローカル基準)
- `<NNN>`: 同日 N 番目の run。3 桁ゼロ埋め
- 例: `run-2026-07-23-001` / `run-2026-07-23-002`

### 冪等性 / 並行制御

`op patrol ledger push` は previous state の `last_run_id` が push 対象の `--run-id` と一致すれば
何もせず no-op (`decision: "warn"`) を返す (v1 の「コメント fingerprint 事前走査」の代替)。
並行書き込みの検出は `state_rev` の楽観ロック相当であり、真の CAS (compare-and-swap) ではない
(channel によって照合強度が非対称。詳細は ADR-0026「単一 actor 前提」節 /
`op-tools/docs/specs/patrol-ledger.md` を参照)。

---

## `<!-- op-patrol-checkpoint: <checkpoint-id> -->` block (廃止、v1 歴史)

**v2 (ADR-0026) で廃止**。state は body 側の `<!-- op-patrol-ledger-state -->` に一本化されたため、
コメント側の集約スナップショット (checkpoint) による履歴圧縮は不要になった。過去に投稿された
checkpoint コメントは削除しない (監査ログとして Issue に残置する)。schema の詳細が必要な場合は
本ファイルの v1 時点 (`schema_version: 1`) の記述を git 履歴から参照すること。

<a id="patrol-checkpoint-area-state-schema"></a>
> v1 の `area_state[<area>]` (area_state_record) は上記「`<!-- op-patrol-ledger-state -->` block schema」
> 節の [`area_state[<area>]` 要素](#patrol-ledger-state-area-state-schema) と同一 shape だった
> (v2 でもこの shape 自体は維持されている)。本 anchor は `op-core::markers::patrol` の
> `OpPatrolCheckpointMarker` descriptor が参照する互換 anchor として残置する。

<details>
<summary>v1 コメント例 (歴史的参照。新規生成しない — lint / schema-check の example 検証を満たすためだけに残置)</summary>

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

</details>

---

## `<!-- op-patrol-run: <run-id> -->` block schema (監査ログ専用、機械は読まない)

1 回の op-patrol 起動で audit した結果を記録するコメント marker。Patrol Ledger Issue にコメントとして
append-only で追加する。**v2 (ADR-0026) では state 復元に一切使われない** — 過去の巡回結果を人間が
参照するための監査ログとしてのみ機能する。parse fallback / 差分マージ等の「機械が読む」ロジックは
v1 から削除済み (JSON 構造自体は v1 から変更していない)。

### コメント全体構造

````markdown
<!-- op-fingerprint: patrol-run:<sha256(run_id)[:16]> -->
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

`op-fingerprint` の prefix は `patrol-run:` (v2 で `patrol-checkpoint:` から改名。v1 の
`patrol-checkpoint:` は誤 leftover だった — run コメントは監査ログ専用で機械が二度と読まないため、
改名時に下位互換を保つ必要はない)。実装は `op_core::patrol::ledger::serialize_run`。

### top-level fields

| フィールド | 型 | 必須 | 制約 / 意味 |
|---|---|---|---|
| `schema_version` | integer | ✓ | 現行 `1`。互換性管理用 |
| `type` | string | ✓ | 必ず `"run"` |
| `run_id` | string | ✓ | `run-<YYYY-MM-DD>-<NNN>` 形式。同日に複数 run があれば `001` から連番 |
| `ran_at` | string (ISO8601) | ✓ | run 開始時刻 |
| `budget` | enum | ✓ | `small` / `medium` / `large` (op-patrol/SKILL.md の budget tier に対応) |
| `flags` | array<string> | ✓ | 起動時 flag (`--stale` / `--all` / `--dry-run` 等)。なければ `[]` |
| `random_seed` | integer \| null | ✓ | 区画選定の乱数 seed。再現性が要らない通常運用は `null` |
| `selected_areas` | array<area_record> | ✓ | 今回 audit した区画の配列。Issue 起票 0 件の area もカバー (`last_scanned_at` 更新のため) |
| `issues_created_total` | integer | ✓ | 全 area 合計の起票数 |
| `issues_skipped_total` | integer | ✓ | 全 area 合計の duplicate skip 数 |
| `next_candidates_hint` | array<string> | ✓ | 次回優先候補。今回 plan で除外した上位候補を文字列配列で記録 (詳細スコアは state 文書側の `next_candidates`) |

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

### 重複について (v1 との違い)

v2 では push 前の既存コメント走査 (fingerprint 事前チェック) を行わない
(`op-tools/docs/specs/patrol-ledger.md` 参照)。同一 `run_id` を意図せず複数回 push しても、
監査ログとして両方残るだけで実害はない (機械が二度と読まないため)。state 側の冪等性は
上記「`<!-- op-patrol-ledger-state -->` block schema」節の「冪等性 / 並行制御」を参照。

---

## state ロード (v2、body 1 読み)

v2 のロード (`op patrol ledger pull`) は **body 1 読み** のみで完結する。v1 にあった
「最新 checkpoint + post-checkpoint run コメントの差分マージ」「parse 失敗時の段階フォールバック」
「compact 条件 (30 件超で checkpoint 追加)」は body 全置換モデルでは概念ごと消滅した
(単一 JSON 文書に対する 1 回の parse のみ)。

marker 皆無 (v1 body、または Patrol Ledger でない他 Issue) は warning に降格して空 state を返し、
`op patrol ledger init --adopt-v2` へ誘導する。marker は存在するが JSON が破損している場合は
**fail-closed** (block) する — 空 state を previous-state として誤読させ、破損した実 state を
不可逆上書きする事故を防ぐため。詳細な CLI 挙動は `op-tools/docs/specs/patrol-ledger.md`、
設計判断は `op-tools/docs/adr/0026-patrol-ledger-v2-body-state.md` を正本とする。

---

## 重複検出 / 衝突回避

state 側 (body) の重複書き込みは `last_run_id` 一致による no-op (前述「冪等性 / 並行制御」節) で防ぐ。
run コメント (監査ログ) は同一 `run_id` を意図せず複数回 push しても実害がない (機械が二度と読まないため、
v1 のような事前 fingerprint 走査は行わない)。

複数の Patrol Ledger Issue が `op-state` ラベルで見つかった場合の正本選択は
`op-patrol/SKILL.md` フェーズ0 を参照 (= 最も古い Issue を採用)。

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
| v1 body (運用説明のみ) + `<!-- op-patrol-checkpoint -->` コメント合成方式 | deprecated (ADR-0026、v2 で廃止) | 既存 Ledger の移行は行わない (ユーザー承認済み)。`op patrol ledger init --adopt-v2` で v2 skeleton body に明示的に上書きする。上書き後も既存 checkpoint / run コメントは削除せず監査ログとして残置する |

新規 op-patrol run でローカル state ファイルを生成・読み取りしてはならない。Patrol Ledger Issue の body が唯一の正本。
