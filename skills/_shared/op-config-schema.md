# op-config.yaml schema

project 単位の OP skill 設定ファイル `op-config.yaml` の schema 正本。すべての key は省略可。

---

## §1 ファイル配置

- 配置先: プロジェクトルート直下 `op-config.yaml` (YAML 1.2、UTF-8)
- 未配置時: `model-selection.md` §9.1 の暫定挙動 (`typical` 区画 / `extension` task_complexity = Sonnet) に従い、`area_complexity_unset_warning` を spawn metadata に記録する

---

## §2 schema 全体像

| top-level key | 節 | 用途 |
|---|---|---|
| `complexity_thresholds` | §3 | 区画 complexity 判定の閾値 |
| `domain_tags` | §4 | critical / complex 区画の path 指定 |
| `model_overrides` | §5 | expert / phase 単位の model override |
| `fable_escalation` | §5.1 | Fable 昇格提案の抑止 |
| `quality_defaults` | §6 | `--quality` 未指定時の default |
| `review_opt_down_sensitive_paths` | §6.1 | review narrow opt-down の sensitive glob 追加 |
| `review` | §6.2 | review depth proportional lens gating |
| `bulk_group` | §7 | バッチ起票の閾値 |
| `design_system_baseline` | §11 | craft floor 一貫性検査の baseline |
| `design_system` | §12 | カタログ・トークン・契約の所在と登録状態の書き方 |
| `op_survey` | §13 | op-plan フェーズ2.5 discovery |

**優先順位**: CLI flag > env var (`OP_QUALITY` / `OP_FABLE_DISABLE` / `OP_REVIEW_*` 等、対応する key のみ) > `op-config.yaml` > 既定値。

---

## §3 `complexity_thresholds`

`model-selection.md` §4 のシグナルから区画 complexity を判定する閾値。

| key | 型 | default | 意味 |
|---|---|---|---|
| `cyclomatic_complex` | int | 15 | 関数 cyclomatic complexity 最大値がこの値以上で `complex` 候補 |
| `cyclomatic_critical` | int | 30 | 同上、`critical` 候補 (ただし `critical` 確定は domain_tag 必須) |
| `loc_complex` | int | 500 | ファイル LOC がこの値以上で `complex` 候補 |
| `churn_30d_complex` | int | 10 | 直近 30 日 commit 数がこの値以上で `complex` 候補 |

- いずれかの閾値以上で `complex` 候補。すべて未満なら `typical`。
- `critical` 確定は `domain_tags` (§4) で path 指定された場合のみ。

---

## §4 `domain_tags`

重要度の高い区画を path glob で明示する。op-patrol / op-scan が区画選定と model 決定で参照する。

```yaml
domain_tags:
  - path: "src/auth/**"
    tag: critical        # critical | complex
```

| key | 型 | 必須 | 意味 |
|---|---|---|---|
| `path` | string (glob) | yes | 対象パターン (`**` は recursive) |
| `tag` | enum | yes | `critical` (auth/payment/migration 等) または `complex` (機械シグナル不在でも複雑) |

マッチ順は先勝ち。

---

## §5 `model_overrides`

`model-selection.md` §6 step 3 (explicit override) の最終決定値。§5 mapping と `--quality` を上書きする。

| key | 意味 |
|---|---|
| `<expert>` | 当該 expert の全 spawn で固定 (例: `review-expert: opus`) |
| `<expert>.<phase>` | phase 単位 (例: `feature-expert.apply`) |
| `<expert>.<phase>.<complexity>` | 最細粒度 (例: `designer-expert.audit.single: sonnet`) |

- `phase` ∈ {`apply`, `audit`, `post-check`, `review`}
- `complexity`: `audit` → `single` / `typical` / `complex` / `critical`、`apply` → `routine` / `extension` / `design` / `integration` / `api-design`
- value: `opus` / `sonnet` / `haiku`。`null` で override 削除
- **`fable` は無効値** (`model-selection.md` §7.2 F6)。controller は無視して `fable_config_override_ignored_warning` を記録し、§5 mapping の値で spawn する

---

## §5.1 `fable_escalation`

Fable escalation gate (`model-selection.md` §7.2) を抑止する方向にだけ設定できる。事前承認は表現できない。

| key | 型 | default | 意味 |
|---|---|---|---|
| `enabled` | bool | `true` | `false` で §7.2 F4 の候補判定を skip し、Fable 昇格を一切提案しない |

- 環境変数 `OP_FABLE_DISABLE=1` は同じ効果の kill switch (env が優先)。
- `enabled: true` は「提案してよい」であって承認済みではない。承認は常に会話 gate (§7.2 F5)。

---

## §6 `quality_defaults`

| key | 型 | 意味 |
|---|---|---|
| `level` | enum | `high` / `balanced` (default) / `low`。`--quality` flag / `OP_QUALITY` env が未指定時に使う (挙動は `model-selection.md` §7) |

---

## §6.1 `review_opt_down_sensitive_paths`

`model-selection.md` §7.1.3 の内蔵 sensitive glob に project 固有 glob を追加する (union、内蔵 glob は削除不可)。マッチするファイルを含む PR は review-expert を Opus 維持する。

```yaml
review_opt_down_sensitive_paths:
  - "src/billing/**"
```

narrow opt-down を完全停止するなら `model_overrides.review-expert: opus` (§5) を使う。

---

## §6.2 `review` (ADR-0015 review depth proportional lens gating)

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

---

## §7 `bulk_group`

| key | 型 | default | 意味 |
|---|---|---|---|
| `threshold` | int | 5 | 同一 `bulk_group` が何件以上でバッチ Issue 化するか |

`op scan bulk-group` は現状 config を読まない。値は `--threshold` flag で渡す。

---

## §11 `design_system_baseline`

craft floor の一貫性検査が読む数値 baseline。Hard blocker 一覧の正本は expert-design skill の `visual-quality-rubric.md`。designer-expert の apply 自己採点と ux-ui-audit-expert の post-check が読む。

| key | 型 | default | 意味 |
|---|---|---|---|
| `grid_unit` | int | `8` | spacing が整数倍であるべき grid 単位 (px)。広範囲逸脱は Hard blocker |
| `scale_ratios` | list[string] | `["1.2", "1.25", "1.333", "1.5"]` | type scale の許容 modular ratio 候補 (画面性格別に 1 つ選ぶ)。候補外の中間値混入は Hard blocker |
| `max_accent_colors` | int | `3` | accent 色種類数の上限。超過は Hard blocker。未設定なら warning 扱い |

---

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

---

## §13 `op_survey` (op-plan フェーズ2.5 discovery)

op-plan フェーズ2.5 の前段 discovery (`op-survey` workflow)。controller pre-step が読み Workflow args に注入する。

| key | 型 | default | 意味 |
|---|---|---|---|
| `enabled` | bool | `true` | `false` または Workflow `ok:false` で従来の feature-expert audit のみ |
| `auto_detect` | bool | `true` | investigation 型語彙による自動起動。`false` なら `--survey` 明示時のみ起動 |
| `models.investigator` | enum | `sonnet` | investigator の model |

- `enabled: false` なら `--survey` を渡しても起動しない。
- `--no-survey` は常に skip する。
- survey 未実行 / Workflow 失敗時は silent fallback。
- config を読む bridge は未配線。現状は既定値 (true) で動作する。

---

## §15 関連

- 複雑度シグナル / 区画・task complexity / 決定フロー / `--quality` / narrow opt-down → `model-selection.md` §2〜§7.1
- proportional lens の利用先 → `op-run/references/global-review-spawn.md` §4-2-a / `op-run/references/review-fix-loop.md`
- op-survey の利用先 → `op-plan/SKILL.md` フェーズ2.5
