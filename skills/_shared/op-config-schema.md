<!--
schema_version: 1
last_breaking_change: 2026-05-13
notes: 初版 (2026-05-13) — `op-config.yaml` の schema 定義 canonical 正本。
       model-selection.md §3 / §4 が参照する complexity_thresholds / domain_tags /
       model_overrides / quality_defaults を 1 ファイルに集約する。
       op-tools (Rust CLI) での parse / validate 実装は Phase 1 (別 PR) で coordinate。
       field 追加は非破壊。field 削除 / 意味変更は本ファイルの schema_version を bump。
-->

# op-config.yaml schema

/**
 * 機能概要: プロジェクト固有の OP skill 設定を集約する `op-config.yaml` の schema 定義正本。
 *           model 選択 (model-selection.md) と op-patrol 区画選定のための閾値・tag・override を
 *           プロジェクトごとに宣言する仕組み。
 * 作成意図: model-selection.md §3 / §4 / §5 / §7 で `op-config.yaml` を参照しているが
 *           schema 正本がなく dangling pointer 化していた。schema を 1 ファイルで明示し
 *           op-tools (Rust) と markdown 仕様の同期点を確立する。
 * 注意点: 本ファイルは markdown 仕様のみ。実 parse は op-tools Phase 1 で実装。
 *         schema_version bump 基準: field 削除 / 意味変更 / 必須化変更 = bump、新規 field 追加 = bump 不要。
 */

OP skill 軍が参照する project 単位の設定ファイル `op-config.yaml` の schema 定義正本。
本ファイルは markdown 仕様であり、op-tools (Rust CLI) との同期は Phase 1 で確定する。

---

## §1 ファイル配置

- **配置先**: プロジェクトルート直下 `op-config.yaml`
- **未配置時の挙動**: OP skill は `model-selection.md` §9.1 の暫定挙動 (`typical` 区画 / `extension`
  task_complexity の Sonnet) に従い、`area_complexity_unset_warning` を spawn metadata に記録する
- **YAML version**: YAML 1.2 準拠、UTF-8

---

## §2 schema 全体像

```yaml
schema_version: 1                       # 必須、本ファイル schema_version と同期

complexity_thresholds:                  # §3 区画 complexity 判定の閾値
  cyclomatic_complex: 15
  cyclomatic_critical: 30
  loc_complex: 500
  churn_30d_complex: 10

domain_tags:                            # §4 critical / complex 区画の path 指定
  - path: "src/auth/**"
    tag: critical
  - path: "src/payment/**"
    tag: critical
  - path: "src/migrations/**"
    tag: critical

model_overrides:                        # §5 expert / phase 単位の model 強制 override
  review-expert: opus                   # 常に opus
  test-expert.routine: sonnet
  designer-expert.audit.single: sonnet

quality_defaults:                       # §6 --quality flag が未指定時の default
  level: balanced                       # high / balanced / low

review_opt_down_sensitive_paths:        # §6.1 review-expert narrow opt-down の sensitive glob 追加 (additive)
  - "config/feature_flags/**"
  - "src/billing/**"

review:                                 # §6.2 ADR-0015 review depth proportional lens gating (すべて省略可)
  proportional_lens:
    enabled: true                       # 既定有効 (ADR-0015)。false で従来 7-lens フルに戻す (退行回避経路)
    tiers:                              # diff 規模 (LOC) → active lens 構成の閾値 (暫定。Ladder4 recall で校正)
      small_max_loc: 100                # ≤100: core 3 lens 単独 (non-core skip)
      medium_max_loc: 500              # 101-500: core 3 + compatibility+release bundle (+条件付き workflow-ux)
                                        # >500: 7 lens 完全分割 (bundle なし)
  lens_bundles:                         # bundle 可能ペア (最大 2 lens、core lens は単独維持で含めない)
    - ["compatibility", "release"]
    - ["workflow-ux", "refactor-maintainability"]

design:                                 # §9 ADR-0012 design 多役 orchestration の depth/役/model (すべて省略可)
  depth_default: auto                   # none | light | full | auto (controller heuristic)
  roles:                                # design_depth 別の役リスト (token-curation→component-selection→layout-composition→(motion-spec))
    light: [token-curation, layout-composition]
    full:  [token-curation, component-selection, layout-composition]
  role_models:                          # 役別 model (ADR-0012 Wave4: 検出役 sonnet / 生成役 opus、model-selection.md §5.4.1)
    token-curation: sonnet              #   foundation 不在時は controller が opus 昇格 (add+normalize=生成)
    component-selection: sonnet         #   既存資産選定 = 検出
    layout-composition: opus            #   visual hierarchy / 統合 = 生成
    motion-spec: opus                   #   motion 設計 = 生成
  motion_enabled: false                 # motion-spec 役を full pipeline に追加 (true + full + motion-patterns.md 着地で末尾追加)
  auto_full_downgrade_to_light: true    # op-scan/op-patrol --auto で full を light に丸める throughput ガード

planning_judge_panel:                   # §10 ADR-0014 計画 judge-panel (op-run clustering 等) の有効化 / 案数 / model
  enabled: true                         # false で従来の司令官単発グルーピングにフォールバック
  candidate_count: 1                    # 生成する案数 (#676: 既定 1=Sonnet 1案+Opus 1評価で2 spawn。複雑区画は 3 に上書き可)
  models:
    generate: sonnet                    # 案出し (breadth) = 安く広く
    evaluate: opus                      # 評価 (depth) = tradeoff 裁定

design_system_baseline:                 # §11 ADR-0013 決定I craft floor 一貫性検査の project 別 baseline (すべて省略可)
  grid_unit: 8                           # spacing が整数倍であるべき grid 単位 (px)。craft floor の grid 整数倍検査の基準
  scale_ratios: ["1.2", "1.25", "1.333", "1.5"]  # type scale の許容 modular ratio 候補 (画面性格別に 1 つ選ぶ)
  max_accent_colors: 3                   # accent 色種類数の上限 (超過は Hard blocker、未設定なら warning 扱い)

playground:                             # §12 ADR-0013 op-explore playground (N パターン視覚比較) の右サイズ化 (すべて省略可)
  max_patterns: 2                        # full mode で生成する N パターンの default (絶対上限 3、超過は controller が 3 にクランプ)
  pattern_count: 1                       # 未注入時の安全側 default (none/thin で 1)

op_survey:                              # §13 op-plan フェーズ2.5 前段 discovery の有効化 / auto-detect / model (すべて省略可)
  enabled: true                         # false で従来の単一 feature-expert audit に戻す
  auto_detect: true                     # false で --survey フラグ明示時のみ起動 (誤判定抑止)
  models:
    investigator: sonnet                # 探知は軽量
```

---

## §3 `complexity_thresholds`

`model-selection.md` §4 の複雑度シグナルから区画 complexity を判定する閾値。すべて省略可。

| key | 型 | default | 意味 |
|---|---|---|---|
| `cyclomatic_complex` | int | 15 | 関数 cyclomatic complexity 最大値がこの値以上で `complex` 候補 |
| `cyclomatic_critical` | int | 30 | 同上、`critical` 候補 (ただし `critical` 確定は domain_tag 必須) |
| `loc_complex` | int | 500 | ファイル LOC がこの値以上で `complex` 候補 |
| `churn_30d_complex` | int | 10 | 直近 30 日 commit 数がこの値以上で `complex` 候補 |

判定ルール:

- いずれかの threshold 違反で `complex` 候補
- `critical` 確定は `domain_tags` (§4) で path 指定された場合のみ
- すべて閾値未満なら `typical`

---

## §4 `domain_tags`

`critical` / 重要度の高い区画を path glob で明示する。op-patrol / op-scan が audit 区画選定 +
model 決定で参照する。

```yaml
domain_tags:
  - path: <glob string>
    tag: <enum: critical | complex>
```

| key | 型 | 必須 | 意味 |
|---|---|---|---|
| `path` | string (glob) | yes | 対象パターン (例: `src/auth/**`、`src/migrations/**`) |
| `tag` | enum | yes | `critical` (auth/payment/migration 等) または `complex` (機械シグナル不在でも複雑) |

glob は YAML の string で書く。`**` は recursive。マッチ順は先勝ち (上位の path が優先)。

---

## §5 `model_overrides`

`model-selection.md` §6 controller 決定フロー step 3 (explicit override) で参照される個別 override。
`§5 mapping` および `--quality` flag を上書きする最終決定値。

### key format

| key | 意味 |
|---|---|
| `<expert>` | 当該 expert の全 spawn で固定 (例: `review-expert: opus`) |
| `<expert>.<phase>` | phase 単位 (例: `feature-expert.apply`) |
| `<expert>.<phase>.<complexity>` | 最細粒度 (例: `designer-expert.audit.single: sonnet`) |

### phase / complexity 値

- `phase` ∈ {`apply`, `audit`, `post-check`, `review`}
- `complexity` は phase によって異なる:
  - `audit` → `single` / `typical` / `complex` / `critical`
  - `apply` → `routine` / `extension` / `design` / `integration` / `api-design`

phase / complexity の意味は `model-selection.md` §2 / §3 / §5 に従う。

### value

- `opus` / `sonnet` / `haiku` のいずれか
- `null` で override 削除 (継承を打ち切らない場合)

---

## §6 `quality_defaults`

`--quality` flag / `OP_QUALITY` env が未指定時の default。

| key | 型 | 意味 |
|---|---|---|
| `level` | enum | `high` / `balanced` (default) / `low` |

`balanced` は `model-selection.md` §5 mapping をそのまま使う。`high` / `low` は §7 fl ag 仕様に従う。

---

## §6.1 `review_opt_down_sensitive_paths`

`model-selection.md` §7.1 (review-expert narrow opt-down) の sensitive glob を **project 固有に追加**
するための設定 (additive only)。ここで指定した glob にマッチするファイルを含む PR は、narrow opt-down
判定で **Opus を強制維持** する (Sonnet へ opt-down しない)。

```yaml
review_opt_down_sensitive_paths:        # additive: 内蔵 default glob を上書き / 削除はできない
  - "config/feature_flags/**"
  - "src/billing/**"
```

| key | 型 | 必須 | 意味 |
|---|---|---|---|
| `review_opt_down_sensitive_paths` | list[string (glob)] | no | 内蔵 default sensitive glob (`model-selection.md` §7.1.3) に **追加** する glob のリスト |

仕様:

- 内蔵 default glob (`**/migrations/**` / `skills/_shared/**` / `op-tools/crates/**` 等、
  `model-selection.md` §7.1.3 参照) は **削除不可**。本 key は追加専用 (union)。
- 未指定 (key 不在) の場合は内蔵 default glob のみで判定する。
- glob は YAML string で書く。`**` は recursive。
- narrow opt-down を project 全体で完全停止したい場合は本 key ではなく
  `model_overrides.review-expert: opus` (§5) を使う (§6 step 3 explicit override で確実に Opus 固定)。

> **注記**: 新規 field 追加のため schema_version bump 不要 (§8 schema_version 運用 参照)。

---

## §6.2 `review` (ADR-0015 review depth proportional lens gating)

op-run フェーズ4 global review (lens-modular、ADR-0011) の lens 数を PR の変更規模・リスクで流動化する
設定 (ADR-0015 amendment)。「1 行修正に 7 レンズ」を解消するための skip + bundle を **既定有効**で運用する。
lens 選択は **controller 側** (`global-review-spawn.md` §4-2-a が §4-1-b 既算出値 `REVIEW_LOC_COUNT` /
`REVIEW_SENSITIVE_TOUCHED` を再利用) で行い、`active_lens_keys` / `lens_bundles` を確定して
ClusterOrchestrator (cluster-orchestrator-directives.md フェーズ6) が review-expert spawn 時の prompt に注入する (review-expert は diff 規模判定を持たない、§9 design / §10 と同方針)。`op-run-review` workflow は ADR-0016 で削除済み。
**有効化 / 上書きは本 yaml または env var override で行う** (`OP_REVIEW_PROPORTIONAL_LENS` ほか、下の実装状況注記参照)。
本 yaml を controller が読む YAML→env bridge は op-tools `op model decide-review` primitive で配線済 (Issue #723)。
**env var override は config より優先** (既存 bash 意味不変)。

```yaml
review:
  proportional_lens:
    enabled: true                       # 既定有効。false で従来 7-lens フルに戻す (退行回避経路)
    tiers:
      small_max_loc: 100
      medium_max_loc: 500
  lens_bundles:
    - ["compatibility", "release"]
    - ["workflow-ux", "refactor-maintainability"]
```

| key | 型 | default | 意味 |
|---|---|---|---|
| `proportional_lens.enabled` | bool | `true` | proportional gating を有効化。`false` で従来の 7-lens 完全分割 (skip/bundle 無効) に戻す退行回避経路。**この退行回避は本 yaml または env var `OP_REVIEW_PROPORTIONAL_LENS=false` で行う** (yaml→env bridge は `op model decide-review` で配線済、env var が config より優先、下記実装状況参照) |
| `proportional_lens.tiers.small_max_loc` | int | `100` | small tier の上限 LOC。`≤` で **core 3 lens (security/spec/test-regression) 単独**、non-core は skip |
| `proportional_lens.tiers.medium_max_loc` | int | `500` | medium tier の上限 LOC。small 超過〜本値以下で **core 3 + `compatibility`+`release` bundle 1 +(diff が該当 domain を触る場合のみ)`workflow-ux`**。本値超過は **7 lens 完全分割** (bundle なし) |
| `lens_bundles` | list[2-elem list[string]] | `[["compatibility","release"],["workflow-ux","refactor-maintainability"]]` | bundle 可能ペア (順不同、**最大 2 lens**)。1 worker が 2 lens 節を verbatim 担当し各 finding に lens key を自己申告する |

仕様 / 不変則 (ADR-0015 + ADR-0011 由来):

- **core lens (`security` / `spec` / `test-regression`) は規模に関わらず必須 + 単独維持** (bundle 禁止)。
  見落とし時の被害が大きいため skip/bundle の対象から構造的に除外する。
- **bundle に `security` を含めない (no-exceptions)**。`lens_bundles` に core lens を含むペアを書いても
  workflow / controller 双方が却下する (許可ペア表に core lens を入れない設計)。3 lens 以上のペアも却下。
- **sensitive PR** (`skills/_shared/**` / `agents/*.md` / `op-tools/crates/**` / auth / migration 等、
  `model-selection.md` §7.1.3 sensitive glob) は **skip/bundle 無効 = 7-lens フル + Opus 維持**。
  lens selection と model selection は別軸 (調査=sonnet / verify+gate=opus は据置)。
- tier 閾値は暫定初期値。実装 PR の **Ladder4 recall 実測 (7-lens フル vs proportional の見落とし差)** で校正する。
- 差分 lens 化 (Fix Loop 2 round 目以降) の手順は `review-fix-loop.md` を参照 (本設定は lens 構成のみ)。

> **注記**: 新規 field 追加のため schema_version bump 不要 (§8 schema_version 運用 参照)。
> **実装状況** (RVW-005 / RVW-003 解消): lens 選択ロジックは controller (`global-review-spawn.md` §4-2-a) 保持。
> 本 config (`review.proportional_lens.enabled` / `tiers`) を読む **YAML→env bridge は配線済** (Issue #723、
> op-tools `op model decide-review` primitive)。controller は §4-2-a-pre2 で `op model decide-review --emit-env`
> を `eval` し、`op-config.yaml` の値を `OP_REVIEW_PROPORTIONAL_LENS` / `OP_REVIEW_SMALL_MAX_LOC` /
> `OP_REVIEW_MEDIUM_MAX_LOC` に反映する。**優先順位は env var > config > ADR-0015 既定** (既存 bash の
> `${OP_REVIEW_*:-default}` 意味を保つ = 既存 env override 運用は無破壊で従来通り優先)。per-project 無効化 /
> tier 上書きは `op-config.yaml` に書く (config 不在 / review 節欠落時は既定へ fail-safe)。
> env var を直接設定した場合はそれが config より優先する。

---

## §7 `bulk_group`

`op scan bulk-group` が参照するバッチ起票判定の設定。

```yaml
bulk_group:                             # §7 op scan bulk-group の設定
  threshold: 5                          # バッチ起票を適用する最小 finding 数 (default: 5)
```

| key | 型 | default | 意味 |
|---|---|---|---|
| `threshold` | int | 5 | 同一 `bulk_group` が何件以上あればバッチ Issue 化するか。`expert-spawn.md` 準拠のデフォルト 5 を変更したい場合に設定する |

> **注記**: schema_version は field 追加のため bump 不要。(§8 schema_version 運用 参照)
>
> **実装状況**: Phase 2-B 先行実装として `--threshold` CLI flag で対応済み。
> `op-config.yaml` の `bulk_group.threshold` への parse は Phase 1 CLI 化波で実施予定。
> 現在は CLI flag が設定値の代替として機能する (CLI flag 優先、将来 config ファイルで上書き可能)。

---

## §9 `design` (ADR-0012 Wave3)

design 多役 orchestration (`op-enrichment.js` design-plan phase) の depth 閾値 / 役リスト / 役別 model。
すべて省略可。未指定時は `op-enrichment.js` の default 補完 (`design_depth`→`none` / 標準 3 役) に従う。
値は **controller pre-step が読み args 注入**する。workflow 側は heuristic を持たない (`issue-enrichment.md §4 / §7.6`、Single Canonical Source)。

| key | 型 | default | 意味 |
|---|---|---|---|
| `depth_default` | enum | `auto` | `none` / `light` / `full` / `auto` (controller が「新規 surface か / foundation 既存か」で導出) |
| `roles.light` | list[string] | `[token-curation, layout-composition]` | light 時の役 (foundation 既存・適用観点に scope 限定) |
| `roles.full` | list[string] | `[token-curation, component-selection, layout-composition]` | full 時の役。`motion_enabled=true` で `motion-spec` を末尾追加 |
| `role_models.<role>` | enum | 検出役 `sonnet` / 生成役 `opus` | 役別 model (ADR-0012 Wave4)。`token-curation`=sonnet (foundation 不在は controller が opus 昇格) / `component-selection`=sonnet / `layout-composition`=opus / `motion-spec`=opus。正本値・昇格規則は `model-selection.md §5.4.1` |
| `motion_enabled` | bool | `false` | `motion-spec` 役を full pipeline に追加 (`true` ∩ `full` ∩ motion-patterns.md 着地で `roles.full` 末尾に追加。`motion 使用画面` の判定は designer 役へ委譲) |
| `auto_full_downgrade_to_light` | bool | `true` | op-scan/op-patrol `--auto` で full を light に丸める throughput ガード (ADR-0012 決定8-7) |

> 新規 field 追加のため schema_version bump 不要 (§8 schema_version 運用、「新規 field 追加 = 不要」)。

---

## §10 `planning_judge_panel` (ADR-0014)

計画フェーズ judge-panel (`op-run-judge-clustering.js` 等) の有効化 / 案数 / model。すべて省略可。
未指定時は workflow / controller の default 補完 (`enabled`→true / `candidate_count`→1 / generate=sonnet / evaluate=opus) に従う。
値は **controller pre-step が読み args 注入**する (workflow 側は heuristic を持たない、§9 design と同方針)。

| key | 型 | default | 意味 |
|---|---|---|---|
| `enabled` | bool | `true` | judge-panel を有効化。`false` または workflow `ok:false` で従来の司令官単発グルーピングにフォールバック |
| `candidate_count` | int | `1` | 生成する案数。既定 1 (#676: Sonnet 1 案 + Opus 1 評価 = 2 spawn の保守側既定)。複雑な区画は 3 に上書き可 (角度は 標準 / risk-first / throughput-first) |
| `models.generate` | enum | `sonnet` | 案出し (breadth) の model。安く広く N 案を起こす |
| `models.evaluate` | enum | `opus` | 評価 (depth) の model。score vector を見て tradeoff を裁定する |

> 対象 surface: **op-run clustering** (Wave A) / **op-plan 計画分解** (Wave B、angle: mvp-first/risk-first/asset-reuse-first) / **op-architect アーキ提案** (Wave C、whole-architecture = ADR-worthy 論点をまとめて 1 panel、angle: simplicity/extensibility/robustness-biased)。
> surface 別 angle は各 workflow が default を持つ (op-run=標準/risk-first/throughput-first、op-plan=mvp-first/risk-first/asset-reuse-first、op-architect=simplicity/extensibility/robustness-biased)。
> surface 別 angle の op-config 上書き (`planning_judge_panel.<surface>.angles`) は将来拡張 (additive)。`enabled` / `candidate_count` / `models` は全 surface 共通。
> 新規 field 追加のため schema_version bump 不要 (§8 schema_version 運用)。

---

## §11 `design_system_baseline` (ADR-0013 決定I)

craft floor の**一貫性検査**が project ごとに読む baseline。すべて省略可。
craft floor は ADR-0013 決定I で「**絶対数値でなく一貫性検査**」と定義された
(font size が単一 modular ratio 由来か / spacing が grid 単位の整数倍か / accent 色種類が閾値以下か)。
絶対数値 (line-height 145% 固定 / 8pt 固定) を焼くと project 固有 design system と衝突し token-first /
philosophy 原則12 (流行に寄せない) を裏切るため、**閾値・候補は本セクションで project ごとに外出し**する。
正本の craft floor Hard blocker 一覧は `expert-design/references/visual-quality-rubric.md` の Hard blockers 節
(本セクションはその検査が参照する数値 baseline のみ)。

| key | 型 | default | 意味 |
|---|---|---|---|
| `grid_unit` | int | `8` | spacing が整数倍であるべき grid 単位 (px)。`padding:6px` (8 の非整数倍) のような広範囲逸脱は craft floor Hard blocker |
| `scale_ratios` | list[string] | `["1.2", "1.25", "1.333", "1.5"]` | type scale の許容 modular ratio 候補。画面性格別に 1 つ選ぶ。候補外の中間値 (説明できない 15px 等) の混入は Hard blocker |
| `max_accent_colors` | int | `3` | accent 色種類数の上限。超過は Hard blocker。**未設定なら warning 扱い** (BLOCK しない) |

> 値は **生成 prompt / ux-ui-audit gate / 卒業 gate が読む** (op-explore SKILL.md / `visual-quality-rubric.md` から pointer)。
> 新規 field 追加のため schema_version bump 不要 (§8 schema_version 運用)。

---

## §12 `playground` (ADR-0013、op-explore Wave3)

op-explore の N パターン視覚比較 (`workflows/op-explore-render.js`) の右サイズ化。すべて省略可。
`playground_mode (none|thin|full)` の導出は **op-explore SKILL.md の controller pre-step が正本** (本セクションは pattern 数のみ)。
`playground_mode` は enrichment が消費しない直交軸ゆえ `issue-enrichment.md` の options には足さない (決定F)。

| key | 型 | default | 意味 |
|---|---|---|---|
| `max_patterns` | int | `2` | full mode で生成する N パターンの default。**絶対上限 3** (cross-review 最大 3 並列と整合)。3 超過は controller が 3 にクランプ |
| `pattern_count` | int | `1` | 未注入時の安全側 default。none/thin は 1 |

> spawn cost 上限 (worst-case 16 spawn / hard cap) の正本は `issue-enrichment.md §11` (Single Cost Ledger)。
> 新規 field 追加のため schema_version bump 不要 (§8 schema_version 運用)。

---

## §13 `op_survey` (op-plan フェーズ2.5 discovery)

op-plan が investigation 型要望に対して自動起動する前段 discovery step (`workflows/op-survey.js`)
の有効化 / auto-detect / model。すべて省略可。
未指定時は `enabled: true` / `auto_detect: true` / `models.investigator: sonnet` として動作する。
値は **controller pre-step (フェーズ2.5) が読み Workflow args へ注入**する (workflow 側は heuristic を持たない、§9 design / §10 planning_judge_panel と同方針)。

```yaml
op_survey:                    # op-plan フェーズ2.5 前段 discovery
  enabled: true               # false で従来の単一 feature-expert audit に戻す (フォールバック)
  auto_detect: true           # false で override フラグ (--survey) 明示時のみ起動 (誤判定抑止)
  models:
    investigator: sonnet      # 探知は軽量 (調査並列は安価に。ceiling 課題でないため)
```

| key | 型 | default | 意味 |
|---|---|---|---|
| `enabled` | bool | `true` | survey discovery を有効化。`false` または `Workflow` が `ok:false` で従来の feature-expert audit のみ (フォールバック) |
| `auto_detect` | bool | `true` | controller heuristic (investigation 型語彙チェック) による自動起動を有効化。`false` にすると `--survey` フラグ明示時のみ起動 (誤判定を抑止したい場合) |
| `models.investigator` | enum | `sonnet` | investigator の model。read-only 横断調査のため軽量 Sonnet が既定 (ceiling 課題でないため昇格しない) |

仕様:

- `enabled: false` → `--survey` フラグを渡しても survey は起動しない。`--no-survey` と同等のフォールバック。
- `auto_detect: false` + `--survey` → survey が起動する (`auto_detect` は heuristic の on/off のみ。明示 override は尊重)。
- `auto_detect: false` + `--no-survey` → survey を skip (明示 skip は常に勝つ)。
- survey 未実行 / `Workflow` 失敗時は silent fallback (機能停止しない)。

> 新規 field 追加のため schema_version bump 不要 (§8 schema_version 運用 参照)。
> **実装状況**: フェーズ2.5 controller logic は `skills/op-plan/SKILL.md` §2.5 に記述。
> `op-config.yaml` の `op_survey` セクションを読む **YAML→env bridge は op-tools Phase 1 で配線予定**。
> それまで `op_survey.enabled` / `auto_detect` は SKILL.md のデフォルト値 (true) で動作する (bridge 不在は非 block)。

---

## §8 schema_version 運用

| 変更種別 | bump 要否 |
|---|---|
| 新規 field 追加 (例: 新規 threshold key、新規 tag 値) | 不要 |
| 既存 field の default 変更 | 不要 (運用変更扱い) |
| 既存 field の削除 / rename | **bump** |
| 既存 field の型 / enum 値の意味変更 | **bump** |
| 既存 field の必須化 / 任意化変更 | **bump** |

破壊的変更時は `_shared/version-check.md` の段階移行プロトコルに従う。

---

## §8 関連

- 複雑度シグナル定義 → `model-selection.md` §4
- 区画 complexity / task_complexity 区分 → `model-selection.md` §2 / §3
- model 決定フロー / override 優先順位 → `model-selection.md` §6
- `--quality` flag 詳細 → `model-selection.md` §7
- review-expert narrow opt-down (`review_opt_down_sensitive_paths` の利用先) → `model-selection.md` §7.1
- review depth proportional lens gating (`review.proportional_lens` / `review.lens_bundles` の利用先) → `op-run/references/global-review-spawn.md` §4-2-a / `op-run/references/review-fix-loop.md` (ADR-0015)
- op-patrol 区画スコアリングとの接続 → `op-patrol/SKILL.md`
- op-tools (Rust) の parse / validate 実装 → op-tools Phase 1 (別 PR)
- op-survey discovery step (`op_survey` の利用先) → `op-plan/SKILL.md` §フェーズ2.5 / `workflows/op-survey.js`
