# Labels and Markers

OP が GitHub Issue / PR に埋める hidden marker (`<!-- op-* -->`) と label の正本。

- marker の format / owner / example / lint rule: `op help marker <name>` (`--list` で一覧)
- label の color / description: `op_core::labels::REQUIRED_LABELS` (`op repo init --dry-run` で一覧)
- state 文書の JSON schema: `review-markers.md` / `patrol-markers.md` / `claim-markers.md`、および各 `op` parser

---

## must-read

1. **marker は下表の 11 種だけ書く**。それ以外の `op-*` marker を新規に書かない。人間向けの情報は本文の自然文で書く。
2. **domain は `op-fingerprint` の第 1 segment**。domain 専用 marker は無い (`op run expert-resolve` も fingerprint から推定する)。
3. `op-run-expert` / `op-post-check-expert` は **routing metadata であり spawn authorization ではない**。
   最終 spawn 担当は op-run の解決ロジック (`op run expert-resolve`) が決める。planned expert は直接 spawn しない。
   `review-expert` / `release-expert` は post-check expert にしない。
4. **review / post-check 結果の唯一の記録は `op-review-state`** (`op review state push` / `op review publish-approval`)。
   レビュー結果コメントは自然文のみ。
5. state 文書 (`op-claim` / `op-review-state` / `op-patrol-ledger-state` / `op-spec-patrol-*`) は **op CLI だけが書く**。手編集しない。
6. 起票・投稿前に `op core marker-lint --body - --source-hint <kind> --strict` を通す。表にない marker は lint で素通りする
   (旧 Issue / PR に残る廃止 marker は無害。読みも書きもしない)。

---

## Markers

| marker | 形態 | 置き場所 | 書く主体 | 意味 |
|---|---|---|---|---|
| `op-fingerprint` | inline | Issue body | 起票 skill (op-scan / op-patrol / op-plan / op-architect / op-report / op-spec) | 重複判定キー `<domain>:<normalized_title>:<primary_file>:<symbol>` |
| `op-fingerprint-bulk` | inline | Issue body | op-scan / op-patrol (bulk Issue) | bulk Issue の重複判定キー `<domain>:<bulk_group>:<primary_dir>` |
| `op-run-expert` | inline | Issue body | 起票 skill | apply 担当 expert の routing hint |
| `op-post-check-expert` | inline | Issue body | 起票 skill | apply 後 post-check 担当の routing hint (不要なら `null`) |
| `op-depends-on` | inline | Issue body | op-architect / op-plan | 先に完了すべき Issue 群 (`#N` のカンマ区切り) |
| `op-spec-ref` | inline | Issue body / code comment | op-spec | 正本の決定 (`<feature>#<decision>`) への binding pointer |
| `op-claim` | block (YAML) | Issue body | `op claim acquire` | op-run の Issue 占有 (`claim-markers.md`) |
| `op-review-state` | block (JSON) | PR body 末尾 | `op review state push` / `op review publish-approval` | review lifecycle の state 文書 (`review-markers.md`) |
| `op-patrol-ledger-state` | block (JSON) | Patrol Ledger Issue body | `op patrol ledger push` / `init` | 巡回 state 文書 (`patrol-markers.md`) |
| `op-spec-patrol-run` | block (JSON) | Spec Patrol Ledger コメント | `op spec-patrol ledger push` | 正本巡回 1 run の記録 |
| `op-spec-patrol-checkpoint` | block (JSON) | Spec Patrol Ledger コメント | `op spec-patrol ledger push` | feature 別の最終巡回スナップショット |

### inline marker の例 (lint clean)

<!-- op-fingerprint: security:sql-injection-in-query:api/query.py:run_query -->
<!-- op-fingerprint-bulk: refactor:refactor-scattered-tokens:src/ui -->
<!-- op-run-expert: debug-expert -->
<!-- op-post-check-expert: security-expert -->
<!-- op-depends-on: #806, #807 -->
<!-- op-spec-ref: op-sweep#decision-12 -->

- `op-fingerprint`: 正規化規則と重複判定は `dedup-policy.md` / `op core fingerprint` / `op scan dedup`。
- `op-depends-on`: 依存が無い Issue には書かない (空 value は lint error)。消費は `op issue dep-graph` / op-loop。merge を止める効果は無い。
- `op-spec-ref`: dangling 検出は `op spec-patrol check-links`。routing には使わない。

### `op-spec-patrol-run` / `op-spec-patrol-checkpoint`

Spec Patrol Ledger Issue (label `op-spec-patrol` + `op-state` + `do-not-close`) のコメントに書く。
各コメントの先頭には冪等用に `op-fingerprint: spec-patrol-checkpoint:<fp>` 行が付く (CLI が生成)。

````markdown
<!-- op-spec-patrol-run: run-2026-07-01-001 -->
## op-spec-patrol run: run-2026-07-01-001

```json
{
  "schema_version": 1,
  "type": "run",
  "run_id": "run-2026-07-01-001",
  "ran_at": "2026-07-01T10:00:00+09:00",
  "patrolled_features": [
    { "feature": "op-sweep", "drift_counts": { "spec_stale": 1 }, "created_issues": [] }
  ],
  "findings_total": 1,
  "issues_created_total": 0,
  "next_candidates_hint": ["op-scan"]
}
```

<!-- op-spec-patrol-checkpoint: ckpt-2026-07-01-001 -->
## op-spec-patrol ledger checkpoint: ckpt-2026-07-01-001

```json
{
  "schema_version": 1,
  "type": "checkpoint",
  "checkpoint_id": "ckpt-2026-07-01-001",
  "created_at": "2026-07-01T11:00:00+09:00",
  "covers_runs_until": "run-2026-07-01-001",
  "area_state": {
    "op-sweep": {
      "last_patrolled_at": "2026-07-01T10:00:00+09:00",
      "scan_count": 3,
      "drift_counts": { "spec_stale": 1 },
      "last_run_id": "run-2026-07-01-001"
    }
  }
}
```
````

---

## Labels

color / description は `op_core::labels::REQUIRED_LABELS` が正本。ここは意味と付与主体だけを書く。
routing label は完全形 `pro-<expert>-expert` を使う。

| 分類 | label | 付与主体 | 意味 |
|---|---|---|---|
| PR review | `pro-reviewed` | op-run / op-codev (`op review publish-approval`) | current head に対する global review approve。人間がマージ判断する際の参考シグナル |
| PR review | `pro-review-needs-fix` | op-run | review で修正必要 (Review Fix Loop 対象) |
| PR review | `pro-review-fix-in-progress` | op-run | Review Fix の apply 中 |
| PR review | `pro-review-stale` | op-run | review 後に head が進んだ (再 review 待ち) |
| PR review | `pro-review-blocked` | op-run | 自動継続不能 (loop 上限 / scope 外 / 人間判断) |
| routing | `pro-{debug,refactor,feature,optimize,test,designer,ux-ui-audit,security}-expert` | 起票 skill / op-run | apply / post-check 担当 expert (routing only) |
| routing | `pro-env-expert` | 起票 skill | env-expert (planned) 向け。apply は active expert に fallback |
| routing | `module:*` / `area:*` | 起票 skill / op-patrol | モジュール・巡回区画 (clustering hint) |
| 起票元 | `auto-report` | op-scan / op-patrol / op-plan / op-architect / op-report | OP が起票した Issue |
| 起票元 | `auto-fix` | op-run | OP が作成した PR |
| 起票元 | `op-architect` / `milestone:initial` | op-architect | op-architect 由来の Issue / 初期マイルストーン |
| 起票元 | `op-patrol` / `patrol` | op-patrol | op-patrol 起票 (auto-report と併用) |
| 起票元 | `batch` | op-scan / op-patrol | bulk_group を 1 Issue 化したバッチ Issue |
| 起票元 | `derived-from-issue` / `superseded-by-scan` | op-scan `--from-issue` | 派生 Issue / 置き換えられた元 Issue |
| 起票元 | `derived-from-pr` | op-scan `--from-merged-pr` | merged PR の残存リスクから派生した Issue |
| severity | `severity:{critical,high,medium,low,n/a}` | 起票 skill / 人間 | 深刻度 (`severity-rubric.md`) |
| refactor | `op:architecture-debt` / `op:staged-refactor` | refactor-expert / op-scan | debt 追跡対象 / 1 PR 1 stage の段階 refactor |
| refactor | `op:blocking-finding` | refactor-expert (`blocking: true`) | 既存 debt を悪化させた finding。op-run が最優先・単独 cluster で実行 |
| state | `op-state` / `do-not-close` | op-patrol / op-spec-patrol / op-run | state を持つ永続 Issue (Ledger 等)。close しない・claim しない |
| state | `op-spec-patrol` | op-spec-patrol | Spec Patrol Ledger Issue の識別 |
| state | `op:in-progress` | `op claim acquire` | op-run が Issue を占有中 (`op-claim` と同時に付与・削除) |
| state | `op:foundation-precondition` | designer-expert / op-architect / op-plan | foundation (token / base component) 完成待ちの feature Issue (順序の可視化のみ) |
| post-check | `pro-ux-ui-audit-needs-fix` / `pro-security-needs-fix` | op-run | post-check BLOCK (apply 担当が再修正) |
| post-check | `pro-ux-ui-audit-skipped` / `pro-security-post-check-skipped` | op-run | post-check spawn 失敗で未実施 |
| 人間判断 | `needs:human-decision` | 起票 skill / expert | 人間判断が必要。op-run は apply しない (manual_review_bucket) |
| 人間判断 | `needs:human-decision-followup` | 起票 skill / expert | 判断は後でよく `safe_first_step` のみ apply 可 |
| 人間判断 | `needs:boundary-decision` / `needs:spec-decision` | op-scan / refactor-expert / spec-expert | 責務境界 / 仕様の合意待ち (spec-decision は apply 不可) |
| 人間判断 | `needs:triage` | op-patrol | トリアージ待ち (`seen_count >= 3` の debt 等) |
| 人間判断 | `needs-clarification` / `requires-normalization` | op-run | 指示書不足で投げ返し / `--auto` で partial 判定 |
| review | `needs-specialist-review` | review-expert / op-run | specialist expert の判断待ち PR |

**deprecated (新規付与禁止、既存から削除しない)**: `pro-review-expert` / `pro-ux-audit` / `pro-ui-refactor` /
`pro-ux-ui-audit` / `pro-designer` / `pro-debug` / `pro-feature` / `pro-refactor` / `pro-pull-requester` /
`pro-reviewer` / `critical` / `high` / `op:potential-collision` / `pro-human-verified` /
`pro-ux-ui-audit-manual-override` / `pro-security-post-check-manual-override`。clustering では短縮形を完全形に正規化して読む。

**付与禁止 (planned expert)**: `pro-compatibility-expert` / `pro-release-expert` / `pro-spec-expert`。
再分類先は `planned-experts.md`。

---

## 新規 marker / label の追加手順

1. marker: `op-core::markers` に型・lint・descriptor を追加し `op help marker` に出す。本ファイルの表に 1 行と lint clean な例を 1 つ足す
   (`op core schema-check` の prose-example lens が例の存在と lint を検査する)。
2. label: `op_core::labels::REQUIRED_LABELS` に追加し、本ファイルの表に 1 行足す。
3. 既存 marker / label と意味が衝突しないか確認する。
