<!--
機能概要: Dynamic Workflows (ADR-0009) の named workflow script (.js) を保管する repo 正本ディレクトリ。
作成意図: ADR-0010 で skills/ agents/ と対称な repo-root 正本として新設。plugin 配布 (ADR-0023) では
         SessionStart hook が ~/.claude/workflows/ へ staging する (旧 install-local.sh は deprecated)。
注意点: ここが repo 正本。実行時に読まれるのは staging 済みの ~/.claude/workflows/ 側のため、
       編集後は新規 session を開いて再 staging させる (ADR-0023。skills と同じ「編集≠即反映」の運用)。
-->

# workflows/ — Dynamic Workflows 正本ディレクトリ

OP skill 群の fan-out / verify orchestration に使う **named workflow script (`.js`)** の repo 正本。
ADR-0009 (Dynamic Workflows for OP fan-out) / ADR-0010 (workflow script distribution) に基づく。

## 位置づけ

- **repo 正本**: `workflows/op-*.js` (このディレクトリ、git 追跡)
- **install/runtime 先**: `~/.claude/workflows/` (home, global) — **plugin の SessionStart hook が staging** (ADR-0023)。
  plugin 同梱の `${CLAUDE_PLUGIN_ROOT}/workflows/op-*.js` を session 開始時に home へ冪等 copy し、
  `Workflow({name})` の named 解決を成立させる。~~旧: `scripts/install-local.sh` が rsync 同期~~ (deprecated)
- **配布**: zip skill bundle には含めない (markdown-only)。**plugin 配布物** (`sync-dist.yml` の同期対象、ADR-0023)。
  infrastructure 扱い (op-tools と同列)
- 詳細: `op-tools/docs/adr/0023-workflow-plugin-distribution.md` (plugin 配布経路の正本) /
  `0010-workflow-script-distribution.md` (repo 正本配置・named 解決の経緯)

## 命名規約

`op-<skill>-<segment>.js` 形式。SKILL.md からは `Workflow({name: "op-<skill>-<segment>", args: {...}})` で呼ぶ。
per-run の動的値 (`OP_RUN_BASE_SHA` / task-id / cluster list 等) は `args` 経由で構造注入する
(script 本体は不変、動的値だけ差し替え。ADR-0009 決定6 / F2 対策)。

## 編集後の反映

repo を編集しただけでは実行時に反映されない。plugin 配布では **新規 session を開くと SessionStart hook が
`~/.claude/workflows/` へ再 staging** する (ADR-0023)。ローカル plugin (symlink) なら
`${CLAUDE_PLUGIN_ROOT}` が repo を指すため、次 session で最新が staging される。
同一 session 内は named 解決がキャッシュされ stale になり得る (ADR-0010 §named 解決の stale 注意)。
(~~旧運用: `scripts/install-local.sh` 再実行~~ は deprecated。`feedback_skill_change_requires_installed_resync`
と同じ「編集≠即反映」の落とし穴は残るため、確実に最新を使うなら新規 session を開くこと。)

## 現状

**C1 wave (op-run) 稼働**。op-run の fan-out / verify / post-check / global review を Dynamic Workflows へ
全面移行した 4 script が稼働中。controller (op-run SKILL.md) は要所で named workflow を `Workflow({...})` で呼び、
workflow が expert agent を別 context で spawn する。これにより SKILL.md から巨大インライン spawn prompt が消え
controller context が軽くなる (C1 の payoff)。

| script | フェーズ | 役割 |
|---|---|---|
| `op-run-discover.js`  | 探知 (Stage2 barrier 供給) | base_sha worktree で investigation reader を並列 spawn し investigation report を返す (exploration-only) |
| `op-scan-audit.js`    | op-scan フェーズ1 / `--from-issue` audit + 起票前 refute (C2) | expert を `region.audit_model` で並列 audit → normal mode は High/Critical を同 domain 別インスタンス skeptic で refute (偽陽性除去)。dedup / severity gate / enrichment / 起票は controller 保持 |
| `op-patrol-audit.js`  | op-patrol フェーズ4 区画別 audit + 起票前 refute (C3) | region (区画) ごとに area→expert を flat 並列 audit → High/Critical を同 domain 別インスタンス skeptic で refute。region 選定 / dedup / severity gate / enrichment / 起票 / Patrol Ledger 更新は controller 保持 |
| `op-spec-patrol-audit.js` | op-spec-patrol canonical spec **domain drift 専任** audit + 起票前 refute (ADR-0017 W3) | feature ごとに spec-expert を並列 spawn し正本⟷code を 3 者照合 (spec_stale / code_deviation / premise_mismatch) → High/Critical を同 spec-expert 別インスタンス skeptic で反証。**refute default=refuted** (spec drift は捏造リスクが本質、security 非対称とは逆)。機械 drift (broken-link / paths-overlap / cite / index) は CLI (`op spec-patrol`) 側で決定論検出するため対象外。feature 選定 / severity gate / dedup / 起票 (op-spec worklist) / Spec Patrol Ledger 更新は controller 保持 |
| `op-enrichment.js`    | enrichment 起票前 review (C4、op-scan/op-patrol/op-plan/op-architect 4 caller 共通基盤) | per-Issue。UI 影響時 Design Plan 生成→gate (BLOCK retry 最大3) + cross-review 並列→judge 集約 (max_review_loops) + Critical/High 本文統合 + §8 Output contract 組立。severity gate / dedup / collision gate / gh issue create は controller 保持。全 spawn opus 固定。refute (op-scan/op-patrol) とは別レイヤー |
| `op-survey.js`        | 汎用 investigation fan-out (Issue #645、on-demand 横断調査) | 曖昧な「調べて直したい」横断調査を `goal`/`axes`/`preset` で **調査軸** に分解し、軸ごとに investigator を read-only 並列 spawn → findings を flat 化し `detected_by`/`finding_ref` を付与して `{findings, coverage_notes}` を返す。**判定・順位付け・確定はしない** (確定は呼び出し側 controller / 人間)。汎用土台 + op-skill 用 preset (`op-skill-migration`、4 軸) 同梱。新 active expert 0 |

### op-survey vs op-run-discover vs op-scan-audit の役割境界 (silent fork 防止)

3 つは「expert を並列 spawn して調査する」点で似ているが **役割が異なる**。流用するのは schema/helper であって役割ではない。

| script | 役割 | 入力 | 戻り値 | 確定の所在 |
|---|---|---|---|---|
| `op-survey` | **汎用横断調査** (on-demand)。曖昧な goal/preset から調査軸を立て、構造化 findings を列挙する | `goal` + `axes`/`preset` | `{findings, coverage_notes}` (判定なし、順位なし) | controller / 人間 |
| `op-run-discover` | **op-run 実装フェーズ専用** の cluster 探知 (Stage2 競合検出のための investment) | 確定済 cluster + base_sha worktree | `{reports:[investigationSchema (files_likely_to_modify / needs_serialization ...)]}` | op-run controller (Stage2 partition) |
| `op-scan-audit` | **コードバグ特化** の観点別 audit + 起票前 refute | scope + expert list | `{findings (canonical scan-finding), verdicts}` | op-scan controller (severity gate / 起票) |

要点: op-survey は **横断調査** (何を直すべきか曖昧な段階の discovery)、op-run-discover は **実装直前の cluster 投資** (何を直すかは確定済、どう触るかの調査)、op-scan-audit は **コードバグの観点別検出**。
op-survey は `aggregateVerdict` (最重値集約) 等の判定ロジックを **流用しない** (op-explore-render 決定E と同じ規律、確定は workflow に持たせない)。

**C3 wave (op-patrol) 着手済**: op-patrol の区画別観点別 audit fan-out + 起票前 refute stage を `op-patrol-audit.js` へ移行した
(audit=region × expert を flat 並列 + region_id 再グルーピング、refute=C2 op-scan の skeptic ロジックを流用)。同時に CLI化残
(ledger 検索 → `ledger pull --auto-find` / repo map metadata → `repo-map` / Ledger 初回作成 → `ledger init`) を解消し op-patrol を 1 PR で全面書換した。
**C2 wave (op-scan) 稼働**: op-scan の観点別 audit fan-out + 起票前 refute stage を `op-scan-audit.js` へ移行
(audit=discover.js 型 read-only 並列、refute=fanout.js の pipeline(apply→verify) と構造同型の verify 位置)。
**C4 wave (enrichment) 着手済**: op-scan / op-patrol / op-plan / op-architect の 4 caller 共通の起票前 review 基盤
(`skills/_shared/issue-enrichment.md` 正本) を `op-enrichment.js` へ移行した (Design Plan 生成→gate + cross-review→judge +
Critical/High 本文統合 + §8 Output contract 組立)。op-architect も capability preflight 付きで workflow 経由に統一。
これで **ADR-0009 Phase C (C1-C4) の Workflow 移行は全 wave 完了**。PoC artifact は `docs/poc/0009-workflow-fanout-poc.workflow.js` を参照。

## controller → workflow の呼び出し契約 (args / 戻り値)

controller は `args` を **object** で渡し、各 script は `normalizeArgs()` で正規化する。**args は Workflow tool から
JSON 文字列で到着する**ため (段階1.5 実測)、各 script の `normalizeArgs()` 冒頭で
`typeof args === "string" ? JSON.parse(args) : args` により parse + 入力アサーション (fail-fast) を行う。
Workflow input には schema 強制が無いため、必須フィールド欠落は normalizeArgs() で throw して早期失敗させる。

| script | args (object) | 戻り値 |
|---|---|---|
| `op-run-discover`  | `{clusters:[{id,id_short,expert,model,module,issues:[番号],files_declared:[],worktree_path}], base_sha, base_ref, ts}` | `{base_sha, base_ref, ts, reports:[investigationSchema...]}` — controller はこの reports で Stage2 競合検出 |
| `op-scan-audit`    | `{mode:'normal'\|'from-issue', scope, domain?, experts:[{name,model}], audit_model, today:'YYYY-MM-DD', extra_directives:string\|null, from_issue_{number,title,body}? (from-issue 時)}` | `{mode, scope, today, findings:[scan-finding + detected_by + finding_ref], verdicts:[{finding_ref, verdict:confirmed/refuted/downgrade, refuted, confirmed_severity?, reason, evidence_excerpt, evidence_location, reread_performed, supports_claim, security_unreachable_proof?}]}` |
| `op-patrol-audit`  | `{today:'YYYY-MM-DD', run_id, regions:[{id, area, risk_score?, stale_score?, last_scanned_at, selection_reason, expert_list:[{name,model}]}]}` | `{today, run_id, regions:[{region_id, area, findings:[scan-finding + detected_by + finding_ref(`<region_id>:<expert>#<idx>`)], verdicts:[refute verdict (op-scan-audit と同 schema)], audit_report:{area,risk_score,stale_score,findings_count,critical_count,high_count,refuted_count}}], summary:{regions_count,findings_total,critical_total,high_total,refuted_total}}` |
| `op-enrichment`    | `{issue_draft:{title,body,domain,recommended_runner,scope_files[],new_files[],severity,fingerprint}, options:{with_design_plan:bool, with_cross_review:bool, max_review_loops:int, strict:bool}, cross_review_experts:[{name}], task_complexity, today:'YYYY-MM-DD', project_type?}` (with_design_plan/with_cross_review は controller が auto→bool 解決済) | **§8 Output contract そのまま**: `{result:'enriched'\|'blocked', enriched_issue:{title,body,labels_to_add[],task_complexity}, post_create_comments:[{severity,category,body}], review_summary:{loops_executed,critical_high_addressed,medium_low_count,design_plan_status,cross_review_status}, escalation_report:{reason,blocking_findings[],human_action_required}\|null}` + op-architect 向け additive `{design_plan(markdown), apply_expert}` |
| `op-spec-patrol-audit` | `{today:'YYYY-MM-DD', run_id, features:[{feature, spec_path, paths?:[], code_scope?:[], status?, target_issues?:[番号]}]}` (= `op spec-patrol score` で選んだ feature 群) | `{today, run_id, features:[{feature, spec_path, spec_state, findings:[{feature, diff_type:spec_stale/code_deviation/premise_mismatch, severity, spec_says, code_reality, source, evidence_grade, suggested_direction, cross_feature?} + detected_by(=spec-expert) + finding_ref(`<feature>#<idx>`)], verdicts:[{finding_ref, verdict:confirmed/refuted/downgrade, refuted, confirmed_severity?, reason, evidence_excerpt, evidence_location, reread_performed, drift_confirmed_by_evidence?}], audit_report:{feature,drift_count,confirmed_count,refuted_count}}], summary:{features_count,findings_total,confirmed_total,refuted_total}}` |
| `op-survey`        | `{repo_root, goal:string, axes?:[{id,title,focus,how,agentType?}], preset?:string('op-skill-migration'), model?:'sonnet', default_agent_type?:'general-purpose'}` (axis 解決優先順位: axes 明示 > preset 名 > goal 導出) | `{goal, preset, axis_source:('explicit'\|'preset:<name>'\|'goal-derived'), findings:[surveyFinding + detected_by(axis.id) + finding_ref(`<axis_id>:<title>#<idx>`)], coverage_notes:[{axis, note}]}` (判定・順位なし) |

補足:

- (注: `op-run-fanout` / `op-run-postcheck` / `op-run-review` は ADR-0016 ClusterOrchestrator 移行で削除済み。
  これらが担っていた apply→verify / post-check / global review は ClusterOrchestrator (Agent tool) に移管。
  `op-run-discover` のみ存続。)
- `op-scan-audit` の `refute` stage は **normal mode のみ**走る (`--from-issue` / `--from-merged-pr` は人間 Issue / merged PR の
  正規化のため skip、`verdicts: []`)。refute は finding ごとの偽陽性除去であり enrichment §6 cross-review (issue_draft 全体 review、C4) とは別レイヤー。
  controller は戻り値 `verdicts` を op-scan SKILL.md フェーズ1.5 で適用する (`refuted`→drop+可視化 / `downgrade`→severity 上書き → severity gate)。
  `security` domain は非対称 (`refuted` には `security_unreachable_proof` 必須、欠落は `confirmed` override)。`today` は controller 注入 (agent 側 date 実行禁止、F2)。
- `op-patrol-audit` は op-scan-audit の audit→refute 2-phase を **region-grouped** に拡張したもの。audit は region × expert を
  flat 並列し index zip で `region_id` / `detected_by` / `finding_ref` (`<region_id>:<expert>#<idx>`) を付与、refute は全 region の
  High/Critical を flat に skeptic spawn し finding_ref で region に再配分する。region 選定 (Patrol Ledger ロード + patrol_score +
  area 選定) と Patrol Ledger 更新は controller 保持 (workflow は audit + refute のみ)。security 非対称 / drop 可視化は C2 と同一。
  region 選定が controller-side のため op-patrol-audit に mode 分岐は無く、refute は常に走る (`--dry-run` / `--compact-ledger` は audit に到達しない)。
- `op-spec-patrol-audit` は op-patrol-audit の audit→refute 2-phase を **feature-grouped / spec-expert 単一 worker** に縮約したもの
  (ADR-0017 W3)。**domain drift 専任**: 機械 drift (broken-link / paths-overlap / cite / index) は CLI (`op spec-patrol`) が決定論検出する
  ため audit prompt で明示的に対象外と宣言する (二重検出 / silent fork 防止)。region×expert fan-out を持たず feature ごとに spec-expert 1 体
  (spec drift は feature 単位の正本⟷code⟷issue 3 者照合で、expert 軸を持たないため)。**refute trust 方向が逆**: op-scan/op-patrol の
  security 非対称 (default=confirmed、false-negative 防止) と違い、**spec drift は default=refuted** — 捏造 (ADR-0017 決定12 で禁止) を
  「正本を誤って書き換える」本末転倒の発生源にしないため、正本⟷code の乖離を実引用で実証できた時 (`drift_confirmed_by_evidence`) のみ confirmed。
  feature 選定 (`op spec-patrol score`) / severity gate / dedup / 起票 (op-spec worklist queue) / Spec Patrol Ledger 更新は controller 保持。
- `op-enrichment` は 4 caller (op-scan / op-patrol / op-plan / op-architect) 共通の起票前 review 基盤 (`skills/_shared/issue-enrichment.md` が正本)。
  命名は skill 横断のため segment 無し (`op-enrichment`)。**per-Issue invocation** (controller が draft を 1 件ずつ呼ぶ)。`with_design_plan` /
  `with_cross_review` は controller が §4/§6 で auto→bool 解決し注入する (heuristic 二重化回避、`issue-enrichment.md` §7.6 / D11)。
  Design Plan 生成→gate は同 draft 内 BLOCK retry (最大3、3連続で `result:blocked` reason:design_plan_block)、cross-review は
  **index-zip** (filter しない、失敗 reviewer 特定) + changes_requested は integrate agent が Critical/High を本文統合 → max_review_loops 内で再 review。
  Medium/Low は post_create_comments に分離 (round 跨ぎ dedup 累積)。collision gate (§7.5) は gh I/O のため controller 保持 (`--no-enrichment` でも bypass 不可)。
  予期せぬ例外は try/catch で `result:blocked` reason:unexpected_error に倒す (§10 fail-safe)。全 expert spawn は opus 固定。
  op-architect は `with_cross_review:false` で呼び additive 戻り値 `design_plan` / `apply_expert` を使う (cross-review skip)。
- `op-survey` は **on-demand 汎用横断調査** (Issue #645)。曖昧な goal/preset から **調査軸 (axis)** を解決し
  (優先順位: `axes` 明示 > `preset` 名 > `goal` 導出)、軸ごとに investigator を read-only 並列 spawn する。
  各 investigator は構造化 findings を返し、workflow が flat 化して `detected_by` (axis.id) / `finding_ref`
  (`<axis_id>:<title>#<idx>`、op-patrol-audit と同じ provenance 規律) を付与する。
  **判定・順位付け・確定は workflow に持たせない** (findings を返すだけ。確定は controller / 人間)。
  `aggregateVerdict` (最重値集約) 等の判定ロジックは流用禁止 (op-explore-render 決定E と同じ規律)。
  新 active expert 0 (investigator は既存 agentType を流用。既定 general-purpose、構造軸は preset で refactor-expert 等を指定)。
  op-skill 用 preset `op-skill-migration` (cli-migration / workflow-migration / dead-md / doc-drift の 4 軸) を同梱する。
  op-plan への配線 (auto-detect 起動 / findings→asset_audit / config gating) は別 Issue (companion B、本 Issue scope 外)。

## CI ゲート: 静的 gate + logic test の 2 段 (Issue #608)

workflow `.js` は正本コードのため、**2 段のゲート**で守る (`.github/workflows/op-tools-ci.yml`)。

| 段 | job | 何を検査するか |
|---|---|---|
| 1 (静的) | `workflow-static-gate` (Ladder1、ADR-0009 決定F) | 構文 (async-wrap) / 禁則トークン (Date・Math.random・performance.now・require・import・fs.・process.) / `normalizeArgs()` 存在 / raw `args.` 禁止 / stage callback 内 `phase()` 禁止 / verify-commit 引数形。**実行も import もせず、ソース文字列の構文 + 規約のみ**検査する。 |
| 2 (logic) | `workflow-logic-test` (Issue #608) | `op-*.js` の純関数 (集約 / dedup / index-zip / refute 適用 / verdict floor / severity 振り分け / validate / score 計算) を `workflows/tests/` の logic harness が `node --test` で実行・assert する。**与えた入力に対し正しい出力を返すか**を決定的に検証する。 |

静的 gate だけでは「構文・規約は守るが、与えた入力に誤った出力を返す」回帰 (例: dedup の max merge を min に変える / refute drop 条件を反転 / index を +1 ずらす) を merge 段階で検出できなかった
(op-run review lens-modular の Ladder4 RVW-001 がこの盲点の surface 事例)。段 2 がこれを塞ぐ。

### logic harness (`workflows/tests/`)

各 `op-*.js` に対応する `*.test.mjs` を置く。`_extract.mjs` が **本体 `.js` を一切改変せず**
(Dynamic Workflows runtime が文字列評価する前提を壊さない、Issue #608 option (a))、ソース文字列から
純関数宣言 + 依存定数を brace-balanced で切り出し、隔離 context で評価して assert する。

- 実行: `node --test workflows/tests/*.test.mjs` (リポジトリ root から)
- harness 自体も非決定 API (Date / Math.random / performance.now) を持ち込まない (Ladder1 と同基準、固定入力→固定出力)
- `op-run-discover` は集約系の純関数を持たない (controller 側ロジック)
  ため、検証対象は entry の fail-fast = `normalizeArgs()` の必須フィールド検証のみ (各 test ファイル冒頭コメントに明示)
  (注: `op-run-fanout` / `op-run-postcheck` / `op-run-review` は ADR-0016 ClusterOrchestrator 移行で削除済み)
- 本体 `.js` を編集して純関数のロジックを変えたら、対応する `*.test.mjs` の assert も更新する
  (`node --test` が CI blocking で fail する)

## 運用注意: named 解決の session 内 stale

Workflow tool の **named 解決 (`Workflow({name: "op-run-discover", ...})`) は session 内でキャッシュされ stale になり得る**。
repo / `~/.claude/workflows/` の `.js` を編集しても、同一 session で既に名前解決済みなら旧 script が使われ続ける。
開発中に最新 script を確実に動かしたい場合は、`name` ではなく `scriptPath` (ファイルパス指定) または inline 定義で呼ぶ。
本番 (op-run controller) は **新規 session 起動 → SessionStart hook が `~/.claude/workflows/` へ再 staging** で最新化する
(ADR-0023。旧 install-local.sh 再同期は deprecated。skills の `feedback_skill_change_requires_installed_resync` と同じ落とし穴)。
