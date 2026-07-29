<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29, Wave B1 J5): op-patrol/SKILL.md「Patrol Ledger Issue の仕様」節を
       progressive disclosure (ADR-0029 決定2) で本ファイルへ物理切り出し。検索条件 / 初回作成時の
       設定 / body (state 文書、v2 ADR-0026) の運用契約 / state・run コメントの JSON schema pointer /
       architecture_debt 追跡方式 / `op patrol ledger` CLI 運用例を含む。切り出し前後で
       表現・手順・コード片を変更しない (移動のみ、ADR-0029 決定2 要件4)。
-->

<!--
機能概要: Patrol Ledger Issue (label op-state / do-not-close) の検索条件・初回作成設定・body
         (state 文書、v2) の運用契約・JSON schema pointer・architecture_debt 系 finding の
         既存 Issue 突合手順・`op patrol ledger` CLI 運用例を集約する。
作成意図: op-patrol/SKILL.md 本文の god file 化抑制 (ADR-0029 Wave B1)。本節は「Ledger を
         初期化・修復するとき」または「architecture_debt 系 finding の既存 Issue 重複判定を
         行うとき」にのみ参照する詳細スキーマ・手順であり、通常の巡回主経路
         (フェーズ0 ロード / フェーズ7 更新) は SKILL.md 本文と
         `_shared/markers/patrol-markers.md` (JSON schema 正本) の参照だけで完結する。
注意点: state (body) / run コメントの JSON 構造そのものは本ファイルでも再掲しない
         (Single Canonical Source Rule、正本は `_shared/markers/patrol-markers.md`)。
         本ファイルを変更したら SKILL.md 本体の「Patrol Ledger Issue の仕様」pointer 節との
         整合 (トリガー文言・参照ドキュメント索引の (>=N)) を確認すること。
-->

## Patrol Ledger Issue の仕様

### 検索条件

```text
labels: op-state
state:  open
```

### 初回作成時の設定

```text
title:  [op-patrol] 巡回監査ステート / Patrol Ledger
labels: op-patrol, op-state, do-not-close
```

### body (state 文書、v2、ADR-0026)

`op patrol ledger init` が内部生成する v2 skeleton body (`--body-file` のような手書き body 引数は
v2 に存在しない)。**手動編集しない**。

- state (`area_state` / `state_rev` / `last_run_id` / `next_candidates`) は body に一本化される
  (`op patrol ledger pull` は body 1 読みで完結する)
- コメント (`<!-- op-patrol-run -->`) は人間向け append-only 監査ログ。**機械は二度と読まない**
- このIssue は **クローズしない** (`do-not-close` ラベル)
- ローカルキャッシュは存在しない。state を参照したいエージェントは本 Issue の body を毎回読む

### state (body) / run コメント JSON スキーマ (v2)

`<!-- op-patrol-ledger-state -->` (body 側 state 文書) / `<!-- op-patrol-run -->` (コメント側監査ログ)
block の **JSON 構造 / field 単位 schema / area_state レコード形式 / `run_id` 命名規則** の正本は
`~/.claude/skills/_shared/markers/patrol-markers.md` を参照する (`<!-- op-patrol-checkpoint -->` は
ADR-0026 で廃止、同ファイルに v1 歴史として要約のみ残る)。

本ファイルは schema を **再掲しない** (Single Canonical Source Rule)。op-patrol は state 更新時 / run
コメント投稿時に patrol-markers.md の schema に従い JSON を生成する。schema_version の bump は
patrol-markers.md 側で行い、SKILL.md の参照ドキュメント節で `(>=N)` を確認する。

### architecture_debt の追跡方式 (Phase 1)

`finding_type: "architecture_debt"` (および `staged_refactor` / `needs_spec_decision`)
の finding は、**GitHub Issue の本文 marker を正本** として追跡する。Patrol Ledger には
専用 index を持たせない (Phase 2 検討)。

op-patrol は架空の `seen_count` / `last_seen_at` / `risk_trend` を agent に推測させない。
代わりに以下の手順で **既存 Issue を更新** する:

1. refactor-expert が `architecture_debt` / `staged_refactor` / `needs_spec_decision`
   finding を返す
2. op-patrol は **以下のラベル群で既存 Issue を検索** する。debt 系 3 種類すべてが
   対象 (`staged_refactor` / `needs_spec_decision` も `op-refactor-debt-key` を持つため)。

   ```bash
   # 検索対象ラベル: architecture-debt / staged-refactor / needs:spec-decision
   gh issue list --label "auto-report" --state open \
     --json number,title,body,labels --limit 100 | jq '
       [ .[] | select(
           any(.labels[]; .name == "op:architecture-debt"
                       or .name == "op:staged-refactor"
                       or .name == "needs:spec-decision")
         ) ]
     '
   ```

   mcp channel では上記 `gh issue list` が fail-closed するため、司令官が
   `mcp__github__search_issues` (`repo:<owner>/<repo> is:issue is:open label:auto-report`) で
   素材を取得し、同じ 3 ラベル OR 条件で候補を絞り込む (`github-channel.md` §6。raw body に
   marker が生存するため fingerprint 突合はこの素材で可能)。

   その上で **以下の優先順位で同一 debt 判定** する
   (`_shared/dedup-policy.md` の「architecture_debt 補助 marker」節と同期):

   ```text
   優先順位 1: op-refactor-debt-key 完全一致
              `refactor:<bulk_group>:<root_path>:<symbol_or_boundary>`
   優先順位 2: op-fingerprint 完全一致
              `<domain>:<normalized_title>:<primary_file>:<symbol>` (共通仕様)
   優先順位 3: affected_paths 類似 + bulk_group 一致 + symbols 類似 (タイブレーカ)
              優先順位 1〜2 のいずれにも一致しなかった場合のみ適用
   ```

   最初に一致したものを「同一 debt」とみなし、それ以降の優先順位は評価しない。
   `op:architecture-debt` ラベル単独で検索すると `staged_refactor` / `needs_spec_decision`
   を取り逃がして重複起票するため、必ず 3 ラベルの OR で検索する。

3. 既存 Issue が見つかった場合:
   - 新規 Issue を **起票しない**
   - 既存 Issue に `op issue comment` でコメント追加: 今回の `last_seen_at` / 今回検出された
     `affected_paths` / `risk_trend` (前回の `affected_paths` と差分比較)
   - 既存 Issue 本文の `seen_count` を +1 にして `op issue edit-body` で edit
     (mcp channel では既存の `issue_edit_body` call-spec を emit — 全置換 semantics のため素材注入不要、
     `github-channel.md` §3-§4 で完遂する)
   - `affected_paths` が増えていれば本文を更新し、`needs:triage` ラベルを追加
4. 既存 Issue が見つからない場合:
   - 新規 Issue を起票 (`first_detected_at = last_seen_at = today`, `seen_count = 1`)
   - Issue 本文に **op-fingerprint と op-refactor-debt-key の 2 つの marker** を埋める

agent (refactor-expert) 側は `first_detected_at` / `seen_count` / `risk_trend` を **推測で
埋めない**。op-patrol が Ledger および既存 Issue から導出して finding に上書きする。
agent が返す値はあくまで「今回の検出での暫定値」(seen_count=1 / first_detected_at=今日 等)。

### `op patrol ledger` CLI 経由の運用例 (v2、ADR-0026)

`op patrol ledger pull/push/to-flags/area-state/init` は実装済み。**push は用途で意味が分かれる**:
`--updated-area` を渡すと body の state 更新、`--run-comment` を渡すと監査ログ post (フェーズ7-2 参照)。
以下の CLI で運用する:

```bash
# 1. Patrol Ledger から最新 state (area_state / state_rev / last_run_id) を取得
LEDGER_ISSUE=999  # ← Patrol Ledger Issue 番号
op patrol ledger pull --issue $LEDGER_ISSUE --out-file /tmp/ledger.json

# 2. last-scanned-at フラグ列を生成
FLAGS=$(op patrol ledger to-flags --state /tmp/ledger.json)

# 3. 採点 (ledger から last_scanned_at を注入)
op patrol score --area op-tools/crates/op-core $FLAGS --random-seed $(date +%s) --json

# 4. 巡回完了後、state (body) を更新 (area_state / state_rev を進める)
op patrol ledger push \
  --issue $LEDGER_ISSUE \
  --run-id "run-$(date +%Y-%m-%d)-001" \
  --previous-state /tmp/ledger.json \
  --updated-area "op-tools/crates/op-core=$(date -Iseconds)"

# 5. state を直接参照 (デバッグ用): pull の出力から area_state を直接参照
op patrol ledger pull --issue $LEDGER_ISSUE --json | jq '.details.area_state'
```

> **mcp channel**: 4 の `push` (state 更新) は body 全置換の `op issue edit-body` call-spec を emit する。
> 司令官は `github-channel.md` §3-§4 の protocol (verbatim 実行 → read-back → ingest) で完遂する。
> `--previous-state auto` は gh channel 専用のため、mcp では 1 の `pull --input-json ... --out-file`
> でファイル化してから `--previous-state <path>` で渡す。

詳細な CLI フラグ仕様は `op-tools/docs/specs/patrol-ledger.md` を参照。
