# op-config.yaml schema

project 単位の OP skill 設定ファイル `op-config.yaml` の schema 正本。すべての key は省略可。

## §1 ファイル配置

- 配置先: プロジェクトルート直下 `op-config.yaml` (YAML 1.2、UTF-8)
- 未配置時: `model-selection.md` §9.1 の暫定値 (`typical` 区画 / `extension` task_complexity = Sonnet) に従う
- 優先順位: CLI flag > env var (`OP_FABLE_DISABLE` / `OP_REVIEW_*` 等、対応する key のみ) > `op-config.yaml` > 既定値

## §4 `domain_tags`

critical / complex な区画を path glob で明示する。op-patrol / op-scan が区画選定と model 決定で参照する。

```yaml
domain_tags:
  - path: "src/auth/**"
    tag: critical        # critical | complex
```

| key | 型 | 必須 | 意味 |
|---|---|---|---|
| `path` | string (glob) | yes | 対象パターン (`**` は recursive)。マッチ順は先勝ち |
| `tag` | enum | yes | `critical` (auth / payment / migration 等) または `complex` (機械シグナル不在でも複雑) |

## §5.1 `fable_escalation`

Fable escalation gate (`model-selection.md` §7.2) を抑止する方向にだけ設定できる。事前承認は表現できない。

| key | 型 | default | 意味 |
|---|---|---|---|
| `enabled` | bool | `true` | `false` で `model-selection.md` §7.2 F4 の候補判定を skip し、Fable 昇格を一切提案しない |

- 環境変数 `OP_FABLE_DISABLE=1` は同じ効果の kill switch (env が優先)。
- `enabled: true` は「提案してよい」であって承認済みではない。承認は常に会話 gate (§7.2 F5)。

## §6.2 `review` (review depth proportional lens gating)

op-run フェーズ4 global review の lens 数を PR の変更規模で流動化する。lens 選択は controller (`global-review-spawn.md` §4-2-a) が行い、ClusterOrchestrator が review-expert spawn prompt に注入する。controller は `eval "$(op model decide-review --emit-env)"` で本節を `OP_REVIEW_PROPORTIONAL_LENS` / `OP_REVIEW_SMALL_MAX_LOC` / `OP_REVIEW_MEDIUM_MAX_LOC` に解決する (env var > config > 既定、config 不在時は既定)。

```yaml
review:
  proportional_lens:
    enabled: true
    tiers:
      small_max_loc: 100
      medium_max_loc: 500
  lens_bundles:
    - ["compatibility", "release"]
    - ["workflow-ux", "refactor-maintainability"]
```

| key | 型 | default | 意味 |
|---|---|---|---|
| `proportional_lens.enabled` | bool | `true` | `false` (または env `OP_REVIEW_PROPORTIONAL_LENS=false`) で 7-lens 完全分割に戻す |
| `proportional_lens.tiers.small_max_loc` | int | `100` | `≤` で core 3 lens (security/spec/test-regression) 単独、non-core は skip |
| `proportional_lens.tiers.medium_max_loc` | int | `500` | small 超過〜本値以下で core 3 + `compatibility`+`release` bundle + (該当 domain を触る場合のみ) `workflow-ux`。超過は 7 lens 完全分割 |
| `lens_bundles` | list[2-elem list[string]] | `[["compatibility","release"],["workflow-ux","refactor-maintainability"]]` | bundle 可能ペア (最大 2 lens)。1 worker が 2 lens を担当し各 finding に lens key を自己申告する |

- core lens (`security` / `spec` / `test-regression`) は規模に関わらず必須・単独。core lens を含むペアや 3 lens 以上のペアは却下される。
- sensitive PR (`model-selection.md` §7.1.3) は skip/bundle 無効 = 7-lens フル + Opus 維持。
- Fix Loop 2 round 目以降の差分 lens 化は `review-fix-loop.md`。

## §11 `design_system_baseline`

craft floor の一貫性検査が読む数値 baseline。Hard blocker 一覧の正本は expert-design skill の `visual-quality-rubric.md`。designer-expert の apply 自己採点と ux-ui-audit-expert の post-check が読む。

| key | 型 | default | 意味 |
|---|---|---|---|
| `grid_unit` | int | `8` | spacing が整数倍であるべき grid 単位 (px)。広範囲逸脱は Hard blocker |
| `scale_ratios` | list[string] | `["1.2", "1.25", "1.333", "1.5"]` | type scale の許容 modular ratio 候補 (画面性格別に 1 つ選ぶ)。候補外の中間値混入は Hard blocker |
| `max_accent_colors` | int | `3` | accent 色種類数の上限。超過は Hard blocker。未設定なら warning 扱い |

## §12 `design_system`

`_shared/design-system.md` と op-component が読む。未設定なら designer-expert の Summary Mode で探す。

| key | 型 | 例 | 意味 |
|---|---|---|---|
| `catalog` | string | `apps/site/app/pages/catalog.vue` | カタログページのファイル |
| `catalog_url` | string | `/catalog` | ローカル起動時のカタログの URL パス |
| `components` | glob | `apps/site/app/components/*.vue` | 部品本体 |
| `contracts` | glob | `packages/types/src/*.ts` | 部品の契約 |
| `tokens` | list[path] | `[apps/site/tokens/, apps/site/theme.ts]` | トークン定義 (primitive / semantic / 部品単位) |
| `status_marker` | string | `status:` | 部品冒頭で登録状態 (`draft` / `確定`) を書く目印 |
| `changelog` | path | `CHANGELOG.md` | 部品変更の記録先 (あれば) |

## §13 `op_survey` (op-plan フェーズ2.5 discovery)

op-plan フェーズ2.5 の前段 discovery (`op-skill:op-survey` workflow)。controller pre-step が読み Workflow args に注入する。

| key | 型 | default | 意味 |
|---|---|---|---|
| `enabled` | bool | `true` | `false` または Workflow `ok:false` で feature-expert audit のみ |
| `auto_detect` | bool | `true` | investigation 型語彙による自動起動。`false` なら `--survey` 明示時のみ起動 |
| `models.investigator` | enum | `sonnet` | investigator の model |

- `enabled: false` なら `--survey` を渡しても起動しない。
- `--no-survey` は常に skip する。
- Workflow ツール自体が無いときは `workflow-calling.md` §1 に従い停止する。workflow の実行失敗時は survey 無しで続行する。

## §14 `verify_harness`

対象 repo の実機検証ハーネスの宣言。契約 (コマンドの役割・start の stdout JSON・並列安全の規則) は `verify-harness.md`。
節が無ければハーネス未導入として扱う。

```yaml
verify_harness:
  start: npm run verify:env
  stop: npm run verify:env:stop
  smoke: npm run verify:smoke
  targets: [site, cms]
  runtime: linux
  driver: playwright
  windows_paths:
    - "src-tauri/src/platform/windows/**"
```

| key | 型 | 必須 / default | 意味 |
|---|---|---|---|
| `start` | string | yes | 検証環境を起動し、stdout に 1 行 JSON を出すコマンド |
| `stop` | string | yes | この checkout で start した全 run を停止するコマンド |
| `smoke` | string | yes | start 済みの run に対してハーネスの健全性を確かめるテスト 1 本のコマンド |
| `targets` | list[string] | yes | start の JSON の `targets` に非 null の URL を必ず含める target 名 |
| `runtime` | enum | `linux` | ハーネスを動かす実行先。`linux` / `windows` |
| `driver` | enum | `playwright` | 操作手段。`playwright` / `webdriver`。start の JSON の `driver` と一致する |
| `windows_paths` | list[string (glob)] | `[]` | diff がかかったら `runtime` に関わらず Windows で検証する path |
