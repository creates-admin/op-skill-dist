---
name: op-plan
description: 自然言語要望から対話で計画立て、enrichment を経て Issue 起票し、承認後 op-run を起動する主経路スキル。「op-plan」「機能追加」「実装したい」「計画立て」等のキーワードで起動。ADR 必要な大規模設計は op-architect を呼ぶ。
# ADR-0009 Context 節 (計画フェーズの effort 無保証 bullet): 計画フェーズの effort 無保証対策。effort は session 値を override (floor 不可) するため、
# どの session も降格させない max を pin。scope=起動 turn → 初回計画立て (フェーズ0-6 の最初の往復) をカバー。
# 以降のヒアリング往復 turn は session 値へ自動復帰。
effort: max
---

<!--
schema_version: 2
last_breaking_change: 2026-05-13
notes: 2026-09-01 追記 (Design Plan 軽量化、additive) — (4) フェーズ5-0「surface グルーピング」新設: 同一 surface
       (UI file 共有 / 同一画面ディレクトリ) の UI issue 群は lead issue 1 件だけ Design Plan を生成し、follower は
       `## 🎨 Design Plan` 節に `参照: issue[k]` を置いて Pass 2 で `#N` に解決 (marker は既存 enum `skipped`)。
       op-run apply / post-check は参照先から Plan を取得 (apply-prompt-directives.md / post-check-prompts.md 追記)。
       (5) フェーズ5-1 で `design_gate: "human"` を op-plan 既定に: ux-ui-audit gate を spawn せず、workflow が返す
       `gate_checklist` (6 観点) を plan file に載せてフェーズ6 の人間承認を gate とする (op-plan 限定例外。
       正本 issue-enrichment.md §5)。UI surface 1 つあたり light 2 / full 3 spawn (旧 3 / 4、BLOCK retry 消滅)。
       marker / 入出力契約は不変ゆえ schema_version 据え置き。
       2026-09-01 追記 (消費調整、additive) — enrichment 周りの spawn / context 消費を 3 点で抑制。
       (1) フェーズ4-6「分解 align gate」新設: enrichment (UI issue 1 件 3〜4 spawn) に入る前に分解 (angle /
       issue 構成) を人間と align し、見積り spawn 数を提示する (旧: フェーズ6 で初めて代替 angle を提示
       = 切替時に全 issue 再 enrichment)。フェーズ6-1-judge / 6-3 を追従。
       (2) フェーズ5-1-fast: design_depth=none ∩ cross-review false の issue (op-plan の非 UI issue は常時) は
       Workflow を呼ばず controller が pass-through marker を決定論で付与 (正本 issue-enrichment.md §7.6 4-fast)。
       (3) op-plan-judge.js: candidate 1 案では opus evaluator を spawn しない (evaluator.skipped、
       references/judge-panel-and-fallbacks.md v2、pin (>=2))。フェーズ構成・marker・入出力契約は不変ゆえ
       schema_version 据え置き。
       2026-08-05 追記 — 表記中立化: 「hidden marker」呼称を「機械可読 marker」へ、marker の
       「埋める / 埋め込む」を「付与 / 記載」へ全置換。HTML コメント形式メタデータの呼称変更のみで
       marker リテラル・schema・参照正本 (labels-and-markers.md) は不変ゆえ schema_version 据え置き。
       2026-07-29 追記 (ADR-0029 Wave B1) — 「薄い入口 + references/」分割。
       フェーズ2.5 §2.5-1〜§2.5-3 (auto-detect / override / Workflow 呼出) を
       `references/op-survey-discovery.md` へ、フェーズ4 §4-judge 詳細と フェーズ6 §6-6
       (EnterPlanMode/ExitPlanMode フォールバック) を `references/judge-panel-and-fallbacks.md` へ、
       フェーズ7 Pass 2 の Issue 本文テンプレを `references/issue-body-template.md` へ移動 (verbatim、
       内容変更なし)。§2.5-4 (aggregateSurveyFindings の javascript fence) は
       `workflows/tests/op-plan.test.mjs` の sync-check が本ファイルを固定 path で読むため本文に残置。
       純粋な配置変更 (契約・挙動不変) のため schema_version 据え置き。
       2026-07-31 訂正 (corrective) — フェーズ8 の「mcp channel (Cloud) では op-run は起動不可」注記が
       第三波時点のスナップショットのまま stale 化していたため訂正。その後の ADR-0027 6b
       (Cloud で `/op-run` を PR open → global review → approve → pro-reviewed まで完走、実 PR #59
       verdict=approved) および ADR-0028 第七波 (Issue #61 → PR #63 → squash merge → close の
       全ライフサイクルを mcp channel で完結) により Cloud 完走は実機検証済み。`op claim` の mcp 恒久
       refuse は事実だが、op-run 側が claim skip して単一 instance 前提で続行するため「起動不可」の結論が
       誤りだった。注記を「Cloud でも起動可 + 並行 op-run 禁止 (排他が効かない)」へ書き換え。
       事実訂正のみでフェーズ構成・入出力契約・marker は不変ゆえ schema_version 据え置き。
       2026-07-23 追記 (ADR-0024 Phase 3 第三波) — Cloud (mcp channel) 対応。
       `github-channel.md (>=2)` を pin 追加、フェーズ0-2 の `gh auth status` に channel guard、
       既存 Issue 件数取得 (`op issue list`) の mcp fail-closed 注記、フェーズ4-4 dedup 素材の
       `--input-json` 併用注記 (#27 の auto-report label filter 同梱)、フェーズ7-1 ラベル承認
       プレビューの mcp skip 注記、フェーズ7 冒頭の call-spec protocol pointer、フェーズ8 の
       op-run 起動不可 (Cloud) 注記を追加。`op issue edit-body` は元々全置換 semantics のため
       素材注入不要で verbatim call-spec 化 (fence 自体は無改変)。非破壊 additive のため
       schema_version 据え置き。
       v2 (2026-05-13): bundled /batch と同パターンの「プランモード自動遷移」を導入。
       フェーズ -1 で司令官が EnterPlanMode tool を呼び、フェーズ 0-6 を plan mode 下で
       read-only 進行させる。フェーズ 6 の人間承認 gate を ExitPlanMode 呼び出しに置換し、
       「Approve and accept edits」を選べばフェーズ 7-8 が prompt なしで自動進行する。
       v1 (2026-05-11): 初版 (experimental release、proposal Phase 6)。
       自然言語要望から対話 → enrichment → Issue 起票 → op-run 起動の主経路。
-->

<!--
機能概要: 自然言語要望から対話で計画立て、enrichment 層 (_shared/issue-enrichment.md) を経て
         Issue を起票し、承認後 op-run を起動する主経路スキル。
作成意図: 「機能追加したい」というユーザーの最頻ユースケースに対して、ADR 不要 /
         だけど Issue 品質と UI 設計はほしい中量級の入口が空白だった。
         op-architect --extend (ADR-heavy で重い) / op-scan --from-issue (Design Plan を持たない) /
         手書き Issue (指示書フル版テンプレを自力で書く負荷高い) の 3 つの歪みを解消する。
         さらに v2 で bundled /batch と同じプランモード遷移を導入し、計画フェーズの
         read-only を権限機構レベルで担保しつつ、承認後の起票・op-run 起動を
         acceptEdits 自動進行に整流する。
注意点: Direct Mode 固定 (人間自然言語入口がコア価値であり、OP-managed Mode で呼ばれる経路はない)。
       自動モードを持たない (人間承認 gate を必須とする = ExitPlanMode 承認で実現)。
       orchestration ロジックは _shared/ 参照のみで肥大化を避ける。
       フェーズ -1 で EnterPlanMode を呼ぶため、Claude Code 側で
       EnterPlanMode / ExitPlanMode tool が利用可能なバージョンを前提とする
       (bundled /batch と同パターン、公式 permission-modes 仕様)。
-->

# op-plan: 自然言語入口 + Issue 起票 + op-run 起動

op-plan は、ユーザーの自然言語要望 (「〇〇を追加したい」「△△を直したい」) を受け取り、
対話で計画を固め、`_shared/issue-enrichment.md` 経由で Issue 品質を底上げし、
承認後に Issue を起票して op-run を起動する **主経路スキル** である。

---

## このスキルの位置づけ

| 入口 | スキル | 主用途 |
|------|--------|--------|
| **自然言語要望 (主経路)** | **op-plan (本スキル)** | 機能追加・改修 (ADR 不要) |
| 既に立った Issue (番号) | op-scan `--from-issue` | 既存 Issue の正規化 + enrichment |
| コードを起点に問題狩り | op-scan | Critical/High 検出 + enrichment |
| 自動巡回 | op-patrol | 区画巡回 + enrichment |
| ADR 必要な大規模設計 | op-architect | 新規プロジェクト + ADR-heavy 設計判断 |
| 起票済み Issue → 実装 | op-run | 影響なし (op-plan は起票して引き渡す) |

op-plan の責務範囲:

- **DO**: 自然言語要望ヒアリング、既存資産 audit (silent fork 防止)、Issue draft 作成、
  enrichment 呼び出し、ユーザー承認 gate、Issue 起票、op-run 起動承認
- **DON'T**: コード実装 (op-run / feature-expert が担う)、ADR 化 (op-architect が担う)、
  enrichment ロジック本体 (`_shared/issue-enrichment.md` 参照)、自動起票 (人間承認 gate 必須)

司令官 (main Claude) は本スキル内でコードを書かない。実装は Issue 起票後の op-run に委ねる。

---

## 設計原則

本スキルは proposal section 4.4 の以下 5 原則に従う:

1. **op-run との結合は疎結合**: Issue 起票後にプロンプトで「op-run #N を起動しますか?」と聞く。
   内部呼び出しは optional (起票だけで終わってもよい、起票コマンドを表示するだけでもよい)。
2. **ADR 必要時は op-architect へ escalate**: op-plan 内で ADR を書かない。
   フェーズ 2 で ADR 必要性チェックを通し、該当時は op-architect 起動を提案する。
3. **orchestration ロジックは `_shared/` 参照のみ**: enrichment / Issue 本文テンプレ /
   marker 規約 / Direct Mode 判定はすべて `_shared/*.md` を参照する。op-plan は薄い orchestrator。
4. **自動モードを持たない**: 人間承認 gate (フェーズ 6 / 8) を必須とする。
   op-scan / op-patrol の `--auto` 相当は提供しない (本スキルのコア価値は対話に基づく中量級設計のため)。
   v2 以降、この gate は **ExitPlanMode による plan 承認** で実現する
   (bundled /batch と同方式)。「Approve and accept edits」を選べば後続フェーズが自動進行する。
5. **Direct Mode 固定**: `_shared/invocation-mode.md` の判定で常に Direct Mode。
   OP-managed Mode で呼ばれる経路は存在しない (人間自然言語入口がコア価値)。
6. **プランモード自動遷移 (v2)**: 司令官は本スキル起動直後にフェーズ -1 で
   `EnterPlanMode` tool を呼び、フェーズ 0-6 を Claude Code の plan mode 下で
   read-only 進行させる。これにより計画フェーズの read-only 性質を権限機構レベルで担保する
   (公式仕様: https://code.claude.com/docs/en/permission-modes 参照)。

---

## 実行モード

| モード | 起動 | 想定 |
|-------|------|------|
| 対話 (デフォルト) | `/op-plan` または `/op-plan <自然文要望>` | 通常運用。フェーズ -1 (EnterPlanMode) → ヒアリング → enrichment → ExitPlanMode 承認 → 起票 → op-run 起動 |
| Issue 起票のみ | `/op-plan --no-op-run` | Issue 起票で停止し、op-run 起動は手動で実施 |
| dry-run | `/op-plan --dry-run` | Issue 本文 draft までを表示し、起票しない (確認用) |
| op-explore handoff | `/op-plan --from-record docs/playground/<id>.md` | op-explore (ADR-0013) の卒業物 decision record を給餌。フェーズ1 ヒアリングを skip し、record の確定 Design Plan / Behavior Contract / art-direction 意図を issue_draft へ射影。enrichment は `with_design_plan = "gate_only"` で呼ぶ (二重課金回避、`issue-enrichment.md (>=2) §4`) |
| survey 強制 | `/op-plan --survey` | auto-detect に関わらず op-survey discovery (フェーズ2.5) を強制起動する |
| survey skip | `/op-plan --no-survey` | auto-detect に関わらず op-survey を skip し フェーズ3 へ直接進む (誤作動回避) |

並列化・auto モードは持たない (対話必須、proposal section 4.4)。

### `--from-record` (op-explore 卒業物の給餌、ADR-0013 決定C)

`--from-record <path>` で起動された場合、司令官は:

1. decision record (`docs/playground/<id>.md`) を Read し、(a) 確定 Design Plan 素材 / (c) Behavior Contract /
   (d) art-direction 意図 + exemplar gap を取り出す。
2. **フェーズ1 ヒアリングを skip** (op-explore で発散・確定済)。フェーズ2 (ADR 必要性チェック) から開始する
   (record が ADR-heavy を示すなら op-architect へ escalate、それ以外はそのままフェーズ3〜)。
   escalate する場合は op-plan→op-architect が context 非継承 (フェーズ2「2-2. 該当時の挙動」節) ゆえ decision record を drop しないよう、
   **`op-architect --from-record <同 path>` の起動を案内**して record を継続させる (handoff loss 緩和、ADR-0013 Risk 7)。
3. フェーズ4 で issue_draft.body の `## 🎨 Design Plan` 節に record の (a) を射影、`success_criteria` /
   `verification_steps` に (c) を射影、Design Intent に (d) を射影 (apply 経路で designer-expert に再注入される)。
4. フェーズ5 enrichment 呼出で `options.with_design_plan = "gate_only"` を注入する (提示済 Design Plan を再生成せず
   ux-ui-audit gate のみ走らせる)。record が不足/不整合なら通常ヒアリングへフォールバックする。

### プランモード遷移の選択肢 (v2)

デフォルトでは司令官がフェーズ -1 で `EnterPlanMode` を呼ぶ。ユーザーが `--permission-mode plan` 起動 /
`.claude/settings.json` の `permissions.defaultMode` 設定 / `Shift+Tab` 切替のいずれかで事前に plan mode に
入っていた場合も (`/op-plan` 側の追加引数は不要)、本スキルはフェーズ -1 で **既に plan mode なら
EnterPlanMode 呼び出しを skip** する (冪等性確保)。

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
フェーズ 0 で `_shared/version-check.md` の手順に従い整合性を確認する (mismatch 時は warning + ユーザー確認)。

- `~/.claude/skills/_shared/issue-enrichment.md` (>=2) — Issue draft → enriched Issue 変換層。
  Design Plan 生成 / cross-review / 修正反映を担う本スキルの中核処理 (フェーズ 5 で参照)。
  v2 以降: §7.5 Cross-instance Collision Gate が追加され、enrichment 完了直後・`op issue create`
  直前に fingerprint 横断検索 gate を必ず通過する必要がある
- `~/.claude/skills/_shared/expert-spawn.md` — feature-expert (audit モード) spawn 規約、canonical schema、commits_added required (v14)、Direct / OP-managed Mode 規約 (フェーズ 3 で参照)。**Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) — controller が `op issue create` で 機械可読 marker を付与する前に `op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict` を通す契約。**フェーズ7 起票直前の fail-fast lint を有効化済**: かつての既知制約 (`op core marker-lint` が canonical 必須値 `op-post-check-expert: null` を `expert-active-only` error として誤 block する不具合) は #529 (commit 585298d) で解消済 (`--strict` で `null` を含む body が `decision: pass`、op-scan/op-patrol/op-architect は更新済)
- `~/.claude/skills/_shared/pr-templates.md` (>=8) — Issue 本文の指示書フル版テンプレ、
  機械可読 marker schema、ラベルカタログ (フェーズ 4 / 7 で参照)
- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode 判定。
  本スキルは Direct Mode 固定 (フェーズ 0 / 6 / 8 で参照)
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック手順 (フェーズ 0 で参照)
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — feature-expert audit spawn 時の active expert 確認
- `~/.claude/skills/_shared/markers/labels-and-markers.md` — Issue / PR の 機械可読 marker / label 名と意味の正本
- `~/.claude/skills/_shared/dedup-policy.md` (>=3) — fingerprint 生成仕様 + 既存 Issue 重複除外手順 (フェーズ 4 で参照)
- `~/.claude/skills/_shared/model-selection.md` (>=5) — expert spawn 時の model (Opus / Sonnet / Haiku、具体 version は §1) 選択 / task_complexity / 区画 complexity の canonical 正本。op-plan は対話計画フェーズで Opus、enrichment 経由で Issue の task_complexity を推論。**op-plan は spawn する側がすべて計画・enrichment 層 (read-only) のため `fable` を渡さない** — 実装 model の昇格判断は起票後の op-run 1-2-g / op-codev 3-B-gate に委ねる (§7.2 (>=5))
- `~/.claude/skills/_shared/read-economy.md` (>=1) — Read Economy 原則 (R1〜R5) + 「Controller への適用」節。controller は既読 Issue/PR/file の再 Read を避け、Issue/PR body は meta/list で取得し、subagent の completion_report 取り込みを圧縮する (読まなさすぎへの退行は避ける)
- `~/.claude/skills/_shared/github-channel.md` (>=2) — GitHub I/O channel / call-spec protocol。mcp channel (Cloud) での素材注入手順 (§6) と司令官の call-spec 実行義務 (§3-§4) の正本
- Claude Code 公式 [Choose a permission mode](https://code.claude.com/docs/en/permission-modes) — フェーズ -1 / フェーズ 6 の EnterPlanMode / ExitPlanMode 仕様、承認オプションと acceptEdits / auto 自動遷移の挙動 (v2 で参照)
- `workflows/op-survey.js` — 汎用 investigation fan-out workflow (Issue #645)。op-plan フェーズ2.5 の discovery ステップが呼び出す。`--survey` / `--no-survey` フラグで override 可。戻り値 `{ findings[], coverage_notes[] }` を `aggregateSurveyFindings()` で `asset_audit` に射影する。`op_survey.enabled: false` で無効化 (`op-config.yaml` §13)
- `~/.claude/skills/op-plan/references/op-survey-discovery.md` (>=1) — フェーズ2.5 の auto-detect heuristic (§2.5-1) / override フラグ (§2.5-2) / `Workflow({name:'op-survey'})` 呼び出し手順 (§2.5-3) の詳細。investigation 型要望の判定・survey 起動可否を確認するときのみ読む (SKILL.md 本体 god file 抑制、ADR-0029 Wave B1)
- `~/.claude/skills/op-plan/references/judge-panel-and-fallbacks.md` (>=1) — フェーズ4 計画 judge-panel (`op-plan-judge` workflow 呼出詳細、ADR-0014 Wave B) と フェーズ6 EnterPlanMode/ExitPlanMode 利用不可環境のフォールバック挙動の詳細。config gate / tool 未提供時のみ読む (SKILL.md 本体 god file 抑制、ADR-0029 Wave B1)
- `~/.claude/skills/op-plan/references/issue-body-template.md` (>=1) — フェーズ7 Pass 2 が生成する Issue 本文の `## 依存` セクション (機械可読 marker + prose 正本ペア) の書き方サンプル。`FINAL_FILE_I` を Write tool で生成するときのみ読む (SKILL.md 本体 god file 抑制、ADR-0029 Wave B1)

---

## フェーズ -1: プランモード自動遷移 (v2)

司令官は本スキルを起動した直後、フェーズ 0 に入る前に **`EnterPlanMode` tool を呼ぶ**。
これにより以降のフェーズ 0-6 (環境確認 / ヒアリング / ADR 必要性チェック / 既存資産 audit /
Issue draft / enrichment / 承認 gate) が Claude Code の plan mode 下で進行し、
**Edit / Write / Bash の書き込み系が権限機構レベルでブロック** される。
bundled `/batch` と同じパターン (公式仕様:
[Choose a permission mode](https://code.claude.com/docs/en/permission-modes))。

### -1.1. plan mode 状態判定

司令官は現在のセッションの permission mode を確認する手段を持たないため、
**「plan mode に居るかどうか」は EnterPlanMode の応答で判定する**:

- `EnterPlanMode` を呼んでユーザーに承認 prompt が出る → ユーザーが Yes → plan mode 入りを記録
- ユーザーが No → 「plan mode 入りを拒否されました。read-only 規律を SKILL.md 内の指示で守りつつ進めます」と
  ユーザーに伝え、フェーズ 0 へ進む (機能停止しない、フォールバック挙動)

`.claude/settings.json` の `defaultMode: "plan"` や `claude --permission-mode plan` 起動で
**既に plan mode に居る場合**は、EnterPlanMode 呼び出しは no-op として扱われる
(Claude Code 側で冪等)。

### -1.2. 計画フェーズの read-only 保証範囲

plan mode 下でも以下は実行可能:
- `Read` / `Grep` / `Glob` (探索)
- `op issue list` / `op issue view` 等の **読み取り** op CLI コマンド
- feature-expert audit モード spawn (subagent は read-only を引き継ぐ)

plan mode 下で **ブロックされる**:
- `op issue create` / `op issue comment` 等の write 系 → フェーズ 7 に集約
  (`op issue create --ensure-labels` の label 作成も write 系のためフェーズ 7 で実行)

### -1.3. ExitPlanMode への引き継ぎ

フェーズ 6 (承認 gate) で `ExitPlanMode` を呼んでユーザーに plan を提示する。
ユーザーが「Approve and accept edits」を選択した場合、Claude Code は自動的に
`acceptEdits` モードへ遷移し、フェーズ 7 (Issue 起票) / フェーズ 8 (op-run 起動承認) は
permission prompt なしで進行する (公式 UX、permission-modes 仕様)。

---

## フェーズ0: 環境確認

### 0-pre. _shared 整合性チェック

`_shared/version-check.md` の「起動時チェック手順」に従い、上記「## 参照ドキュメント」節の `(>=N)` と
各 `_shared/*.md` 冒頭の `schema_version` を照合する。mismatch 検出時は warning を表示し、
ユーザーに続行可否を確認する。pass なら 0-1 へ。

加えて、`_shared/version-check.md` の「installed op binary 鮮度確認」節 (Issue #249) に従い、`op version --json` の `details.git_sha` と `git log --format='%h' -n1 -- op-tools/crates/` の最新 SHA を比較する (比較元 path は binary 挙動に影響する範囲に絞る。docs-only commit の false-drift 回避 = Issue #641)。不一致時は warning + `cargo install --path op-tools/crates/op` を案内 (hard fail なし)。

さらに、`op core schema-check` で _shared prose / Rust types / SKILL.md pin の drift を確認する。
`stats.errors_total >= 1` または `stats.warnings_total >= 5` の場合は warning を表示し、
**ユーザーに続行可否を確認する (`--auto` モードでも一旦停止)**。
runtime では CI (CLAUDE.md「schema-check process 規約」節) と異なり hard fail しない (CLAUDE.md 不変則2)。

> **controller の read 規律**: controller は本スキル全フェーズで `_shared/read-economy.md` の
> 「Controller への適用」節に従う (既読 Issue/PR/file を再 Read しない / Issue・PR body は
> meta・list で取得し full body を居座らせない / completion_report を圧縮取り込み)。詳細は同節を正本とする。

```bash
# schema-check: drift 可視化 (runtime hard fail なし。閾値超過は warning + 続行可否確認)
if command -v op >/dev/null 2>&1; then
  SCHEMA_RESULT=$(op core schema-check --repo-root . 2>/dev/null) || true
  SCHEMA_ERRORS=$(echo "${SCHEMA_RESULT}" | jq -r '.stats.errors_total // 0' 2>/dev/null || echo "0")
  SCHEMA_WARNINGS=$(echo "${SCHEMA_RESULT}" | jq -r '.stats.warnings_total // 0' 2>/dev/null || echo "0")
  if [ "${SCHEMA_ERRORS}" -ge 1 ] 2>/dev/null; then
    echo "[schema-check] warning: errors_total=${SCHEMA_ERRORS} — drift を修正するか、続行可否を確認してください"
  elif [ "${SCHEMA_WARNINGS}" -ge 5 ] 2>/dev/null; then
    echo "[schema-check] warning: warnings_total=${SCHEMA_WARNINGS} (drift が蓄積しています。修正を検討してください)"
  fi
else
  echo "[schema-check] op binary が見つかりません。cargo install --path op-tools/crates/op を実行してください (hard fail なし)"
fi
```

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md` に従って判定する。本スキルは **Direct Mode 固定**。
spawn prompt に `invocation_mode: op_managed` が混入していた場合、
これは契約違反として停止し、ユーザーに状況を報告する (OP-managed Mode で呼ばれる経路は存在しない)。

### 0-2. git / gh / 対象リポジトリ確認

```bash
# git リポジトリ判定
git rev-parse --is-inside-work-tree 2>/dev/null \
  || { echo "not a git repo — op-plan は既存リポジトリ上で動作します"; exit 1; }

# gh 認証 (Issue 起票に必要)。mcp channel = call-spec 経路では gh 不要 (github-channel.md)。
# op CLI は内部で gh CLI を使うため、env precheck として gh auth status は残す
# (primitive 不在の discovery preflight、不変則9 例外)。
if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要)"
else
  gh auth status 2>/dev/null \
    || { echo "gh login が必要。--dry-run で起票なしで進めるか、認証してください"; }
fi

# 既存 open Issue 件数 (fingerprint 重複チェックの参考)。op issue list は --plain で
# 1 行 1 Issue 出力するため行数で件数を数える (#430、op-run と同 primitive)。
op issue list --state open --limit 200 --plain \
  | wc -l
```

mcp channel では本 fence の `op issue list` が fail-closed するため、件数は司令官が
`mcp__github__list_issues` で直接取得する (件数用途で marker 非依存のため sanitize 非干渉)。

判定:
- git リポジトリ未初期化 → op-plan は既存プロジェクトの機能追加・改修が主用途のため、
  「新規プロジェクトなら op-architect を使ってください」と案内して停止
- gh 未認証 → `--dry-run` モードを提案、または認証を促す
- 既存 open Issue 多数 → フェーズ 4 の fingerprint 生成時に dedup 判定を実施

---

## フェーズ1: ヒアリング

司令官は、ユーザーの自然言語要望を受け取り、**1〜2 ラウンドの対話** で以下を確定させる:

1. **何を**: 追加・改修したい機能の概要 (1〜2 文)
2. **どこに**: 想定する対象ファイル / モジュール / 画面 (推定でよい)
3. **規模感**: 単一ファイル変更 / 複数ファイル / 新規モジュール / 大規模設計
4. **動機 / 期待挙動**: なぜそれが必要か、どう振る舞えば成功か
5. **既知の制約**: 触ってはいけない領域、互換性維持の必要、性能要件など

### 1-1. 初回要望の解析

ユーザーが `/op-plan <自然文要望>` で起動した場合、要望文を司令官が解析し、
**仮の整理** を提示してユーザーに確認させる:

```
あなたの要望を以下のように整理しました。

- 何を: <要約 1>
- どこに: <推定 path 1 / モジュール名>
- 規模感: <単一 / 複数 / 新規モジュール / 大規模>
- 動機: <推定>

不明点:
1. <質問 1>
2. <質問 2>

この整理で進めますか? 修正があれば指示してください。
```

### 1-2. 1〜2 ラウンドの深掘り

司令官は未確定項目を 1 ラウンドあたり 2〜3 問にまとめて質問する
(1 問完全 1 ターン制ではなく、まとめて聞く)。**最大 2 ラウンド** で確定させる。
3 ラウンド目に突入しそうなら、それは ADR 必要レベル (フェーズ 2 で escalate 判定)
または規模が op-plan の想定範囲を超えている可能性があるため、
op-architect への切り替えを提案する。

### 1-3. ヒアリング結果のメモ化

司令官側で **work-in-progress メモ** として保持する。
このメモはフェーズ 3 (audit) / フェーズ 4 (Issue draft) で使う。
ユーザーには「ここまでの整理」を毎ラウンド見せて齟齬を防ぐ。

---

## フェーズ2: ADR 必要性チェック

ヒアリング結果から、以下のいずれかに該当する場合 **op-architect への escalate を提案** する。
op-plan 内で ADR を書かない (proposal section 4.4)。

### 2-1. ADR 必要性チェック条件 (proposal section 4.3 フェーズ 2)

- **新規外部 dependency 追加** — 語彙: `add dependency` / `新しい crate` / `新しい npm package` /
  `cargo add` / `npm install` / `pubspec.yaml 追加` 等
- **認証 / 認可 (auth) 機構の導入・大幅変更** — login flow / session 管理 / OAuth / 権限境界の新設・改変
- **DB schema の追加・変更** — table 追加・列追加・migration / index 戦略変更
- **モジュール境界 (公開 API) の大規模変更** — 公開関数の破壊的変更 / IPC / event name / Tauri command 改変
- **配布方式 (single binary / distribution channel) の変更** — installer / auto-update / package format

(proposal section 11 Open Questions #3 にて「網羅性確認」は運用 1〜2 週間で評価予定)

### 2-2. 該当時の挙動

```
本要望は ADR 化が必要そうな決定を含みます (該当条件: <列挙>)。

以下のいずれかを選んでください:
1. op-architect に切り替えて ADR + Issue を作成する (推奨)
2. ADR なしで進める (リスク: 後から設計判断の説明が必要になる可能性)
3. キャンセル

司令官の推奨: 1 (op-architect)
```

ユーザーが 1 を選んだ場合、op-plan は終了し、`/op-architect` の起動コマンドを表示する
(コンテキストは引き継がず、op-architect 側で再度ヒアリングしてもらう)。

ユーザーが 2 を選んだ場合、選択理由をメモに記録し、フェーズ 2.5 (discovery) を経由してフェーズ 3 へ進む
(survey discovery は ADR 要否と直交するため、2-3 と同じ遷移にする)。
(後で Issue 本文の「想定リスク」節に「ADR 化を見送った判断」として記載する)。

### 2-3. 該当しない場合

フェーズ 2.5 (discovery) を経由してフェーズ 3 へ進む。

---

## フェーズ2.5: op-survey discovery（investigation 型要望の前段調査）

**op-explore vs op-survey の違い**: op-explore は「何を作るか」を発散させる phase -1 の UI 試作ツール (ADR-0013)。
op-survey は **既存 repo の多軸横断調査** (「調べて直したい」横断 investigation) を構造化するツール。
op-plan の前段として動作し、発見した findings を `asset_audit` に整形して op-plan-judge に注入する。

> **いつ読むか**: 要望が investigation 型 (「調べて / 洗い出し / 棚卸し / 監査 / どこに〜があるか /
> 全部探して」等で具体 target 未指定) かどうかを判定するとき、または `--survey` / `--no-survey`
> フラグの挙動・`Workflow({name:'op-survey'})` の呼び出し詳細を確認するときのみ、
> `references/op-survey-discovery.md (>=1)` (§2.5-1 auto-detect heuristic / §2.5-2 override フラグ /
> §2.5-3 Workflow 呼び出し) を読む。goal-driven な通常要望では auto-detect が skip 側に倒れるため、
> この節を読まずにそのままフェーズ3へ進んでよい。

### 2.5-4. aggregateSurveyFindings: findings → asset_audit への射影

survey の戻り値 `findings[]` をフェーズ3 / フェーズ4 で使える `asset_audit` 構造に整形する。
判定・確定はしない (findings をそのまま保存、転写のみ)。

```javascript
// survey findings を asset_audit フィールドに射影する (op-plan-judge の optional input)。
// survey は判定しないため、controller がフィールド転写のみ行う。
// 注意: 本 fence は教育目的 (人間向け参照) として残す。
//   実装の single source of truth は workflows/op-plan-judge.js の aggregateSurveyFindings() に移管済み (Issue #735)。
//   CI sync-check (workflows/tests/op-plan.test.mjs) が本 fence と JS 実装の等価性を継続検証する。
function aggregateSurveyFindings(surveyResult) {
  if (!surveyResult || !Array.isArray(surveyResult.findings)) {
    return null; // survey 未実行 / 失敗時は null → op-plan-judge args に注入しない
  }
  const findings = surveyResult.findings;

  // files_likely_to_modify: 全 finding の files を flat 化 + dedup
  const files_likely_to_modify = [...new Set(findings.flatMap(f => f.files || []))];

  // reusable_assets: survey findings から抽出した再利用可能資産 (情報源 = op-survey)。
  // フェーズ3 feature-expert audit が出力する reuse_opportunities (情報源 = feature-expert) とは
  // 情報源が異なるため別フィールドとして asset_audit にマージする (上書きしない)。
  const reusable_assets = findings
    .filter(f => /再利用|流用|reuse|流用可/i.test(f.recommended_action || ''))
    .map(f => ({ title: f.title, files: f.files || [] }));

  // pattern_to_follow: findings から「手本」「パターン」「参照」を含む finding の files を抽出
  const pattern_to_follow = findings
    .filter(f => /手本|パターン|参照|pattern|template/i.test(f.recommended_action || f.title || ''))
    .map(f => f.files || [])
    .flat();

  return {
    files_likely_to_modify,
    reusable_assets,
    pattern_to_follow,
    survey_findings_count: findings.length,
    coverage_notes: surveyResult.coverage_notes || [],
    // raw findings を保存 (op-plan-judge が詳細を参照できるよう)
    raw_survey_findings: findings,
  };
}
```

整形した `asset_audit` は:
- フェーズ3 の `feature-expert audit` spawn prompt の「再利用候補 / 既知パターン」として補完情報として渡す
- フェーズ4-judge の `op-plan-judge` args に `asset_audit` フィールドとして注入する

op-plan の既存原則を維持: **Direct Mode 固定 / 自動モードなし**。
survey が走っても起票はフェーズ6 の人間承認 gate を必ず通る。

---

## フェーズ3: 既存資産 audit (silent fork 防止)

機能追加要望は **既存資産の重複実装 (silent fork)** リスクが最も高い局面。
feature-expert を **audit モード** で spawn し、類似実装の有無を確認する。

### 3-1. feature-expert (audit モード) spawn

`_shared/expert-spawn.md` のパターン 1 (scan 用 read-only audit) に従う:

```
Agent({
  subagent_type: "op-skill:feature-expert",
  description: "audit: <要望タイトル>",
  prompt: """
    invocation_mode: op_managed

    あなたは feature-expert です。op-plan から呼ばれた audit モードです。
    以下の要望に対して、既存資産の重複実装 (silent fork) リスクを検出してください。

    【必読】Read `~/.claude/skills/_shared/apply-completion-checklist.md` — 完了手順の正本。
    本フェーズは audit (exploration-only) のため commits_added: [] が正解 (commit は行わない)。

    【要望】
    <フェーズ 1 で確定した「何を / どこに / 規模感」>

    【対象 path 推定】
    <フェーズ 1 で推定された scope_in>

    【出力してほしいもの】
    - similar_implementations: 類似する既存実装 (path + 関数名 + 簡潔な役割)
    - reuse_opportunities: 再利用できる既存資産 (utility / hook / component / trait)
    - pattern_to_follow: 既存パターン (どの既存実装の構造を真似るべきか)
    - silent_fork_risk: high | medium | low
    - rationale: 上記判定の根拠 (3〜5 行)

    You must not ask interactive questions.
    If information is missing, return one of: assumptions[] / needs_human_decision / blocked_actions[] /
    verification_not_run / manual_review_bucket (5-item fallback、詳細は `_shared/spawn-prompt-common.md (>=1)` §4)。
    Read-only audit です。コードを変更しないでください。
  """
})
```

### 3-2. audit 結果のユーザー提示

feature-expert からの返却を司令官が解釈し、ユーザーに提示する:

```
## 既存資産 audit 結果

silent_fork_risk: <high | medium | low>

### 類似実装
- <path:line> — <役割>
- ...

### 再利用候補
- <util/hook/component> — <理由>

### 推奨パターン
<どの既存実装の構造を真似るべきか>

この結果を踏まえて、以下のどれで進めますか?
1. 推奨パターンに沿って新規実装 (silent fork 回避)
2. 既存実装を拡張 (重複実装ではない / 元実装の修正で対応)
3. 設計再検討 (フェーズ 1 に戻る)
```

silent_fork_risk が high の場合、司令官は 2 (既存拡張) を強く推奨する。

### 3-3. audit 結果のメモ追加

audit 結果はメモに追加し、フェーズ 4 (Issue draft) の「触ってよいファイル」/
「pattern_to_follow」節に転記する。

---

## フェーズ4: Issue draft 作成

フェーズ 1〜3 の確定情報を、`_shared/pr-templates.md` の **「Issue 本文 (指示書フル版)」** 形式に落とし込む。

### 4-judge. 計画 judge-panel (案出し、ADR-0014 Wave B)

要望の **Issue 分解** (どう Issue に割るか / 順序 / MVP 切り出し) を、N 案を別角度で並列生成 → evaluator が
比較選定する judge-panel に置き換える。**案出し=workflow / 確定=司令官+人間 gate** (op-plan は
自動モードを持たないため確定は常に フェーズ6 の人間 gate)。`ok:true` の場合、`recommended.plan.issues[]` を
**フェーズ4 の Issue 群として採用**し、各 issue に 4-1 (domain 判定) / 4-2 (骨格) / 4-4 (fingerprint + dedup) を
per-issue で適用する。`ok:false` またはワークフロー無効時は **従来の単発分解** (4-1 以降を司令官が 1 案で実施) に
フォールバックする (機能停止しない)。

> **いつ読むか**: `planning_judge_panel.enabled` (既定 `true`) の下でフェーズ4 に入るとき、
> workflow への args 組立 (`requirement` / `asset_audit` / `adr_decision` の作り方、op-survey 由来の
> `asset_audit` マージ規則を含む) や `Workflow({name:'op-plan-judge'})` の呼び出し詳細・戻り値の
> per-issue 適用ルールを確認するときに `references/judge-panel-and-fallbacks.md (>=2)` (計画
> judge-panel 節) を読む。

### 4-1. domain 判定

要望内容から domain を判定する (`_shared/markers/labels-and-markers.md` の op-domain enum に従う):

- 既存機能追加 / 業務ロジック / API / DB 接続 → `feature`
- 構造改善 / リファクタ → `refactor`
- 不具合修正 → `debug`
- 性能改善 → `optimize`
- UI / UX 改善 → `ux-ui` または `design`
- 認証 / 認可 / 入力検証 / capability → `security`

UI 影響 (`*.vue` / `*.tsx` / `*.dart` / `pages/**` / `components/**` 等) を含む場合、
domain が `feature` でも **UI 影響あり** としてフェーズ 5 (enrichment) で Design Plan を生成する。

### 4-2. Issue draft の骨格

`_shared/pr-templates.md` の **「Issue 本文 (指示書フル版)」** をそのまま骨格として使う。
機械可読 marker (HTML コメント形式の routing / dedup 用メタデータ) は以下を記載する (詳細は `_shared/markers/labels-and-markers.md` 参照):

```html
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-source: op-plan -->
<!-- op-domain: <feature | refactor | debug | optimize | security | ux-ui | design> -->
<!-- op-run-expert: <feature-expert | refactor-expert | ...> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | null> -->
<!-- op-depends-on: #N, #M -->
<!-- ↑ 依存ありの issue のみ Pass 2 で追加。依存なし issue は行ごと省略 (空 value は lint error — ADR-0019 D1) -->
```

`op-source: op-plan` を明記することで、op-run 側で「op-plan 由来の Issue」と routing できる。

### 4-3. 本文の書き方ポリシー (自然文許容)

`_shared/issue-enrichment.md` section 3.8.1 の「Issue 本文の書き方ポリシー」に従う:

- `_shared/pr-templates.md` の指示書フル版テンプレを **骨格** として使う (op-run が読める保証)
- ただし各セクションの **内部記述は自然文で OK** (箇条書き強制 / 機械生成感を出さない)
- フェーズ 3 の audit 結果 (pattern_to_follow / reuse_opportunities) は
  「触ってよいファイル」/「既知の落とし穴」節に自然に溶け込ませる

### 4-4. fingerprint 生成 + dedup 判定

`_shared/dedup-policy.md` の fingerprint 生成手順に従い、
`op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol>` を生成する。

重複判定は `op scan dedup` CLI で実行する。
body 全文取得による context 爆発を避けるために CLI に委譲する (op-scan と同一方式。
`op issue list` の body fetch は CLI 内部に閉じ、SKILL.md からは raw 取得しない)。

```bash
# finding draft を canonical schema JSON で一時ファイルに書き出し
# $DOMAIN: 4-1 で判定したドメイン (feature / refactor / debug / optimize / ux-ui / design / security)
# $NORMALIZED_TITLE: dedup-policy.md の正規化手順を適用したタイトル文字列
# $PRIMARY_FILE: 主対象ファイルパス (files は最低 1 件必須)
# $SYMBOL: 対象シンボル名 (なければ空文字列)
FINDING_DRAFT_PATH=$(mktemp /tmp/op-plan-finding-XXXXXX.json)
cat > "$FINDING_DRAFT_PATH" <<EOF
{
  "domain": "$DOMAIN",
  "title": "$NORMALIZED_TITLE",
  "files": ["$PRIMARY_FILE"],
  "symbols": ["$SYMBOL"]
}
EOF

DEDUP_RESULT=$(op scan dedup --finding-json "$FINDING_DRAFT_PATH" --json --quiet 2>/dev/null)
DEDUP_DECISION=$(printf '%s' "$DEDUP_RESULT" | jq -r '.decision' 2>/dev/null)
rm -f "$FINDING_DRAFT_PATH"

case "$DEDUP_DECISION" in
  pass)
    # 重複なし → フェーズ 4-5 (draft 完成) へ進む
    ;;
  block)
    # 既存 Issue と重複: matched_existing を取り出してユーザーに提示
    MATCHED_NUM=$(printf '%s' "$DEDUP_RESULT" | jq -r '.details.matched_existing.issue_number // "不明"' 2>/dev/null)
    # ユーザーに確認: 続行 / 既存 Issue にコメント追加 / キャンセル
    echo "既存 Issue #${MATCHED_NUM} と重複しています。続行 / 既存 Issue にコメント追加 / キャンセルを選択してください。"
    # → ユーザー応答に応じてフローを分岐 (キャンセルまたはコメント追加を選んだ場合はここで終了)
    ;;
  *)
    # dedup 取得失敗または想定外値 → fail-closed でエラーをユーザーに提示して中断
    echo "dedup 判定に失敗しました ($DEDUP_DECISION)。手動で重複チェックを行ってから再試行してください。"
    # → ここで終了
    ;;
esac
```

mcp channel では素材を `github-channel.md` §6 の手順 (`mcp__github__search_issues`) で取得し
`--input-json` を併用する (#27 対応により auto-report label を持たない素材 entry は自動 drop される)。

重複判定結果の分岐:
- `pass` → フェーズ 4-5 へ進む
- `block` → ユーザーに「既存 Issue #N と重複しています。続行 / 既存 Issue にコメント追加 / キャンセル」を確認させる
- その他 / 取得失敗 → fail-closed でエラーを提示し、手動確認を促して中断する

### 4-5. draft 完成

ここまでで作成された Issue draft (title + body + recommended labels) は
**まだ起票していない**。フェーズ 5 (enrichment) でさらに底上げする。

### 4-6. 分解 align gate (enrichment 前の軽量確認、spawn 0)

フェーズ5 の enrichment は **UI surface 1 つにつき designer 役を 2〜3 spawn** する (gate は人間、5-0 / 5-1 /
`issue-enrichment.md (>=2)` §11)。分解 (issue の切り方 / angle) が承認前に変わると、その enrichment は
全 issue ぶん無駄になる (旧フローはフェーズ6 で初めて代替 angle を提示していたため、angle 切替 =
全 issue 再 enrichment だった)。そこで **enrichment に入る前に、分解そのものを人間と align する**。
本ステップは対話のみで expert spawn を伴わない。

司令官は 4-1〜4-5 で骨格化した draft 群 (dedup 通過後) を以下の形で提示する:

```
## 分解 align (enrichment 前の確認)

採用分解: <recommended.angle> (<N> issue)
| # | title | domain | expert | UI 影響 (design_depth) | Design Plan | depends_on |
|---|---|---|---|---|---|---|
| 0 | <title> | feature | feature-expert | あり (light) | 生成 (surface A) | - |
| 1 | <title> | ux-ui | designer-expert | あり (light) | issue[0] 参照 (surface A) | 0 |
| 2 | <title> | refactor | refactor-expert | なし | - | 0 |

代替案: <他 candidates の angle / issue 数 / 一言 assessment を 1 行ずつ。単一案 (既定 candidate_count=1) なら「なし」>
evaluator 根拠: <evaluator.rationale 2〜4 行。evaluator.skipped:true なら「単一案のため evaluator なし (align は本 gate で人間が担う)」>

enrichment 見積り: UI surface <s> 個 (UI 影響 issue <k> 件を 5-0 でグルーピング) → Design Plan spawn 約 <2s〜3s>
                  (light 2 / full 3 per surface、gate は人間 = フェーズ6、issue-enrichment.md §11)
                  follower <k-s> 件 + 非 UI issue <N-k> 件 → spawn 0 (5-1-fast の pass-through、Workflow も呼ばない)

どう進めますか?
1. この分解で enrichment に進む (推奨)
2. 別 angle に切り替える (<angle 名>) → その分解を 4-1〜4-5 で骨格化し直して再提示
3. issue の追加 / 削除 / 統合 / 順序変更を指示する → フェーズ4 をやり直して再提示
4. enrichment を省略して起票へ進む (Design Plan なし。UI 影響 issue は op-run 側で Design Plan 無しの apply に
   なるため非推奨。§7.5 collision gate は省略不可で必ず実行する)
```

「UI 影響 (design_depth)」列は `issue-enrichment.md` §4 の判定 (拡張子 / path / runner / domain) + carve-out を
司令官が pre-step として適用した結果 (= フェーズ5 で args に注入する `design_depth`) をそのまま出す。
「Design Plan」列は 5-0 の surface グルーピング結果 (lead = 生成 / follower = `issue[k] 参照`) で、人間はここで
グルーピングの妥当性 (別画面なのに束ねられていないか) も確認する。gate が人間側なので BLOCK retry による増分は無い。

- 1 → フェーズ5 へ進む
- 2 / 3 → 分解を差し替えて本 gate を再提示する (spawn 0 なので何度でも安い)
- 4 → フェーズ5 の Workflow 呼出を全 issue で skip し、5-1-fast と同じ pass-through marker
  (`op-enrichment-design-plan: skipped`) でフェーズ6 へ進む

---

## フェーズ5: enrichment 呼び出し

`_shared/issue-enrichment.md` を呼び出し、Issue draft を enriched Issue に変換する。

### 5-0. surface グルーピング (同一 surface の Design Plan を 1 本に共有)

Design Plan は **画面 (surface) の設計**であり issue の設計ではない。同じ画面を触る issue が複数あるとき、
issue ごとに Design Plan を生成すると同じ surface に対して役 pipeline が issue 数ぶん走る (旧: 3 issue で
最大 12 spawn)。op-plan は分解元が 1 つの要望なので同一 surface の issue が並びやすく、ここが Design Plan
コストの主因だった。以下の規則で **surface 1 つにつき Design Plan 1 本**に束ねる。

**対象**: 4-6 で UI 影響あり (`design_depth != none`) と判定された issue のみ。非 UI issue は関与しない。

**surface の同一判定 (決定論、司令官 pre-step)**: 各 issue の UI file 集合 (= `issue-enrichment.md` §4 の
条件 1 / 2 にヒットした `scope_files ∪ new_files`) を取り、2 issue が次のいずれかなら同一 surface とする:

- (a) UI file を 1 つ以上共有する
- (b) 同じ画面ディレクトリに属する (`pages/<x>/` / `routes/<x>/` / `views/<x>/` の直下 1 階層 `<x>` が一致)

関係は推移的に閉じる (A-B, B-C なら A-B-C で 1 surface)。`components/**` の共有だけで (a) が成立する場合は
共通部品を触っているだけで別画面の可能性があるため **束ねない** (安全側。carve-out と同じく「迷ったら発火」=
別 surface として各自生成)。

**lead / follower**:

- **lead** = surface 内で issue index が最小の issue。lead だけが 5-1 の Workflow (Design Plan 生成) を呼ぶ。
  `design_depth` は surface 内の最大値 (full が 1 つでもあれば full)。
- lead の `issue_draft.body` 末尾に **`## 同一 surface の関連 issue`** 節を append し、follower の title /
  scope_summary / scope_files を列挙してから Workflow に渡す (Design Plan が surface 全体 = follower が足す
  要素も含めて設計されるようにする。この節は起票 body にもそのまま残す = 人間の文脈にもなる)。
- **follower** = surface 内の残り。`with_design_plan: false` で 5-1-fast の pass-through に落とし、body の
  `## 🎨 Design Plan` 節を次の 2 行にする (Pass 2 で `issue[k]` を実番号に解決する、7 Pass 2 (c)):

  ```markdown
  ## 🎨 Design Plan

  参照: issue[<lead_index>] (同一 surface の lead issue に確定 Design Plan がある。本 issue では生成しない)
  ```

  marker は既存 enum の `<!-- op-enrichment-design-plan: skipped -->` (本 issue では生成していない、
  `issue-enrichment.md` §9)。UI issue としての `op-post-check-expert: ux-ui-audit-expert` と
  `pro-ux-ui-audit-expert` ラベルは維持する (post-check は参照先の Plan を読む)。
- op-run 側: apply-expert は `参照: #N` を見たら #N 本文の `## 🎨 Design Plan` 節を取得して起点にし、
  post-check も同節を参照する (正本: `op-run/references/apply-prompt-directives.md` /
  `post-check-prompts.md`)。lead と follower が別 cluster / 別 PR になっても、Plan は起票済 Issue 本文にあるため
  順序依存は生じない。

**単一 UI issue の run には効かない** (surface が 1 つなら従来どおり 1 本生成)。

### 5-1. enrichment input contract

`_shared/issue-enrichment.md` section 3.3 の input contract に従って構造化データを渡す:

```json
{
  "issue_draft": {
    "title": "<フェーズ 4-2 で確定したタイトル>",
    "body": "<フェーズ 4 で確定した指示書フル版 Markdown>",
    "domain": "<フェーズ 4-1 で判定した domain>",
    "recommended_runner": "<feature-expert | ...>",
    "scope_files": ["<フェーズ 1 で推定された path>"],
    "new_files": ["<新規作成 path>"],
    "severity": "n/a",
    "fingerprint": "<フェーズ 4-4 で生成した fingerprint>"
  },
  "options": {
    "with_design_plan": "auto",
    "with_cross_review": "auto",
    "design_gate": "human",
    "max_review_loops": 2,
    "strict": false
  }
}
```

`with_design_plan: auto` により、`_shared/issue-enrichment.md` section 3.4 の
UI 影響判定で Design Plan 生成が自動的に走る (UI 影響時のみ、cost-control)。

**`design_gate: "human"` (op-plan 既定、2026-09-01)**: op-plan はフェーズ6 で人間が Issue 本文 (Design Plan 込み) を
読んで承認する skill なので、enrichment 内の ux-ui-audit gate (opus 1 spawn + BLOCK retry 最大 3 round) を
spawn せず、**フェーズ6 の人間承認を Design Plan gate とする**。workflow は役 pipeline を 1 round 走らせ、
gate の 6 観点 (+ motion 時 7) を `gate_checklist` として返す。司令官はこれを 6-1 の plan file に載せ、人間が
観点をなぞって承認 / 差し戻す。marker は `op-enrichment-design-plan: generated` (本文に確定 Design Plan がある、
`gate_only` と同じ扱い、enum 不変)。**この例外は op-plan 限定** — op-scan / op-patrol / op-architect は人間が本文を
読まない (auto) か別 gate 構造のため `expert` のまま (正本: `issue-enrichment.md (>=2)` §5「design_gate」)。
`--from-record` (`gate_only`) は提示済 Plan の検証だけが目的なので expert gate のまま (workflow が矯正する)。

> **C4 (ADR-0009 Phase C)**: enrichment の Design Plan 生成→gate / cross-review は内部で
> `workflows/op-enrichment.js` workflow を使う。司令官は `issue-enrichment.md` §7.6 の順序で
> auto (`with_design_plan` / `with_cross_review`) を bool に解決し cross_review_experts / task_complexity と共に
> `Workflow({name:'op-enrichment'})` へ注入する。collision gate (§7.5) は workflow の後・起票直前に controller が実行する。
> op-plan は severity:n/a 固定のため cross-review (auto) は通常 skip される。
>
> **ADR-0012 (design 多役)**: 上記 pre-step で controller は `design_depth` (none|light|full) / `design_roles[]` /
> `foundation_exists` も解決し args に注入する (heuristic の正本は `issue-enrichment.md` §4 / §7.6、ここで複製しない)。
> op-plan は **対話 active caller**: foundation token / base component 不在の新規 surface では ExitPlanMode で
> foundation-build Issue (`op:foundation-precondition` ラベル) を先行提示し、③④ bespoke animation が要る場合は
> design-spike (`needs_human_decision(decision_type:"design")`) を選択肢に翻訳する。

### 5-1-fast. spawn 0 の issue は Workflow を呼ばない (pass-through fast path)

`issue-enrichment.md (>=2)` §7.6 手順 4-fast (正本) に従う。pre-step で `design_depth = none`
(= `with_design_plan: false`) ∩ `with_cross_review: false` に解決された issue は、workflow を呼んでも
agent spawn 0 の marker pass-through にしかならない (§11「severity medium 以下: 0 spawn」)。op-plan は severity
`n/a` 固定ゆえ **非 UI issue は常にこの経路**に落ちる。司令官は `Workflow({name:'op-enrichment'})` を呼ばず、
§7.6 手順 4-fast の決定論組立 (4 marker prepend + `labels_to_add = [pro-<recommended_runner>]` +
`post_create_comments = []`) で enriched_issue を作る。分解が N issue のとき、Workflow 往復
(issue body の往復 echo + task 通知) を非 UI issue の数だけ controller context から省ける。
5-0 の follower (同一 surface の非 lead) も `with_design_plan: false` でここに落ちる。
UI surface の lead と `gate_only` (`--from-record`) は従来どおり Workflow を呼ぶ。
**§7.5 collision gate は fast path でも必ず実行する** (§7.6 の不変則)。

### 5-2. enrichment 処理 (`_shared/issue-enrichment.md` 側)

enrichment 層は以下を順次実行する (本スキルから見えるのは結果のみ、ロジック詳細は当該ファイル参照):

- UI 影響判定 (section 3.4)
- Design Plan 生成 (UI 影響時、designer-expert Architect Mode) (section 3.5)
- Design Plan gate (ux-ui-audit-expert) (section 3.5)
- cross-review (関連 expert 並列 spawn、apply 禁止) (section 3.6)
- review 統合 + Issue 本文修正 (section 3.7)
- **§7.5 Cross-instance Collision Gate** — fingerprint 横断検索 gate。enrichment 完了直後・
  `op issue create` 直前に必ず実行する (`issue-enrichment.md` (>=2) §7.5 参照)。
  block 判定時はユーザーに提示して起票停止。warn 判定時は `<!-- op-collision-warning -->`
  marker と `needs:triage` / `op:potential-collision` ラベルを付与して起票続行
- enrichment marker 付与 (section 3.9)

### 5-3. enrichment 結果の受け取り

`_shared/issue-enrichment.md` section 3.8 の output contract で受け取る:

- `result: enriched` — Issue 本文が enriched 化された (フェーズ 6 へ)
- `result: blocked` — Design Plan gate / cross-review / **§7.5 collision gate** が block 判定 →
  escalation_report を表示し、ユーザーに「修正して再 enrichment / op-architect 切り替え / キャンセル」を確認

**§7.5 collision gate の結果確認 (必須、`issue-enrichment.md` (>=2) §7.5 参照)**:
enrichment 結果の `collision_gate.verdict` を確認する。`warn` の場合は
`collision_gate.similar_issues` を表示し、「類似 Issue が既にあります。そのまま起票しますか?」
とユーザーに確認する。ユーザーが続行を選択した場合、`<!-- op-collision-warning -->` marker と
`needs:triage` / `op:potential-collision` ラベルは enrichment 層が既に本文に付与済みのため、
そのままフェーズ 6 へ進む。`block` の場合は起票を停止してユーザーに判断を返す。

### 5-4. block 時の対応

```
enrichment が block 判定で停止しました。

reason: <design_plan_block | cross_review_block | max_loops_exceeded>
blocking_findings:
  - <指摘 1>
  - <指摘 2>
human_action_required: <enrichment 層からの提案>

どうしますか?
1. 指摘を反映して Issue draft を修正 → 再 enrichment
2. op-architect に切り替えて ADR から再設計
3. このまま起票 (推奨しない、reviewer 注意)
4. キャンセル
```

---

## フェーズ6: ユーザー承認 gate (ExitPlanMode)

enrichment 完了後、最終的な Issue 本文をユーザーに提示して **承認を求める** (人間承認 gate 必須)。
v2 ではこの gate を Claude Code 標準の **`ExitPlanMode` 呼び出し** で実現する
(bundled `/batch` と同方式、公式仕様:
[Choose a permission mode — Review and approve a plan](https://code.claude.com/docs/en/permission-modes))。

### 6-1. plan file の作成

`ExitPlanMode` は plan file の内容をパラメータで受け取らず、システムが指定する **plan ファイル** を
読み取ってユーザーに提示する。司令官は ExitPlanMode を呼ぶ直前に、以下の構成で plan を書き出す:

```markdown
# op-plan: 起票予定 Issue

## Title
[feature-expert] <要約>

## Labels
auto-report, pro-feature-expert <UI 影響時は + pro-ux-ui-audit-expert>
(`op-source: op-plan` は 機械可読 marker として本文冒頭に記載済み、GitHub ラベルではない)

## 起票後の実行ステップ (フェーズ 7-8 で実施)

1. `op issue create --title ... --label "<csv>" --body-file ... --ensure-labels` で起票
2. post_create_comments (Medium/Low 指摘) を `op issue comment` で追加投稿
3. op-run 起動承認プロンプト (op-run #N を起動するか確認)

## enrichment summary

- loops_executed: <N>
- design_plan: <generated (gate: human) | 参照 issue[k] (同一 surface の lead) | skipped | failed>
- cross_review: <passed | passed_with_changes | skipped>
- critical_high_addressed: <N>
- medium_low_post_create_comments: <N>

## Design Plan gate checklist (人間 gate、Design Plan を生成した lead issue のみ)

enrichment は ux-ui-audit gate を spawn していない (`design_gate: human`、5-1)。**この承認が gate** なので、
下記 Issue Body の `## 🎨 Design Plan` 節を以下の観点 (workflow 戻り値 `gate_checklist`) でなぞってから承認する:

- [ ] <gate_checklist[0]: 次の行動が明確になる設計か>
- [ ] <gate_checklist[1]: 必須 UI state が網羅されているか>
- [ ] <gate_checklist[2]: エラー復帰導線が設計されているか>
- [ ] <gate_checklist[3]: 業務フローに合った画面構成か>
- [ ] <gate_checklist[4]: accessibility 要件が十分か>
- [ ] <gate_checklist[5]: 見た目に寄りすぎていないか>
- [ ] <motion-spec 役あり時のみ gate_checklist[6]: motion 安全性>

観点に欠けがあれば「Keep planning with feedback」で指摘する (→ 6-3: 当該 surface の lead だけフェーズ5 を再実行)。

## Issue Body (full)

<enriched_issue.body 全文>
```

複数 Issue に分解された場合 (judge-panel 採用分解が複数 issue を含む等) は、上記 Title / Labels / Issue Body を
**issue ごとに繰り返す** (起票も フェーズ7 で issue 数ぶん直列実行)。

#### 6-1-judge. 計画 judge-panel の採用分解提示 (ADR-0014 Wave B)

4-judge が `ok:true` を返した場合、plan file には **採用分解 (4-6 で align 済)** の Issue 一覧 (各 issue の
title / domain / expert / scope_summary / depends_on) を主表として出す。代替 angle の比較選定は **4-6 の分解 align gate
(enrichment 前) で完了している**ため、ここでは要約だけ添える:

- 採用分解: `recommended.angle` (4-6 で切替済ならその angle) の issue 一覧 + 各 issue の enrichment summary / Issue Body
  (上記テンプレを issue 数ぶん)。
- 代替案: 他 `candidates[]` を 1 行サマリで列挙 (4-6 で提示済のため「4-6 で align 済」と添える)。単一案なら「なし」。
- evaluator 根拠: `evaluator.rationale` を 2-4 行引用。`evaluator.skipped:true` (単一案) なら「evaluator なし、4-6 で人間 align」と明記。
- `recommended.corrected:true` の場合は「evaluator の推奨が無効 angle だったため JS top に矯正」と明記。

ここで別 angle に切り替えると enrichment のやり直し (UI issue ぶんの spawn) が発生する。angle の比較は 4-6 で済ませる
のが既定で、ExitPlanMode 段での切替は例外経路 (→ 6-3)。

### 6-2. ExitPlanMode 呼び出し

司令官は plan file を準備した後 `ExitPlanMode` tool を呼ぶ。Claude Code はユーザーに
以下の承認オプションを提示する (公式 UX):

| 承認オプション | op-plan フェーズ 7-8 の挙動 |
|---|---|
| **Approve and accept edits** (推奨) | `acceptEdits` モードに遷移し、フェーズ 7 (`op issue create` + post_create_comments 投稿) と フェーズ 8 (op-run 起動承認) が permission prompt なしで進行する |
| Approve and start in auto mode | auto mode (要件は公式 permission-modes 参照: 対応モデル + 対応プラン) でフェーズ 7-8 を実行。`op issue create` 等の許可は classifier 判定に依存する (working-directory 内コマンドとして自動承認されることが多いが保証はなく、ブロックされた場合は permission prompt にフォールバック) |
| Approve and review each edit manually | `default` モードでフェーズ 7-8 に進む。`op issue create` ごとに permission prompt が出る |
| Keep planning with feedback | plan mode に留まり、ユーザーフィードバックを受けて修正再実行 (下記 6-3) |

「Approve and accept edits」を **推奨**として案内する。理由: op-plan は元々
「人間承認 gate 必須」原則であり、ExitPlanMode 承認 = 人間承認 gate なので、
それ以降の機械的な起票・コメント投稿は prompt 不要 (proposal section 4.4 原則 4 と整合)。

### 6-3. 修正要求 (Keep planning with feedback) への対応

ユーザーが ExitPlanMode 承認画面で「Keep planning with feedback」を選び、フィードバックを返した場合、
修正内容に応じて以下を再実行する:

- 軽微な修正 (誤字 / 表現変更) → 司令官が plan file の body を編集して再度 ExitPlanMode を呼ぶ (再 enrichment はしない)
- Design Plan への指摘 (人間 gate の観点欠け) → 当該 surface の lead issue だけフェーズ5 を再実行 (Required Changes を
  `issue_draft.body` に追記して渡す。他 issue は再 enrichment しない)
- 構造的修正 (scope_files 変更 / severity 変更 / domain 変更 / angle 切替 / issue 構成変更) → フェーズ 4 から再実行
  (4-6 の分解 align gate を再提示してから enrichment。UI 影響 issue ぶんの spawn が再発生するため、
  分解レベルの修正は本来 4-6 で吸収する)
- 設計レベル変更 → フェーズ 1 から再実行

再実行後は再び 6-1 → 6-2 に戻る (ExitPlanMode 承認まで plan mode を抜けない)。

### 6-4. Direct Mode 固定の確認

本 gate は **Direct Mode 固定** (`_shared/invocation-mode.md` 準拠)。
ExitPlanMode 承認画面のフィードバックは対話で受け付ける (OP-managed Mode のような構造化返却ではない)。

### 6-5. dry-run モード時

`--dry-run` 起動時は plan file に「dry-run: 起票しない、コマンドのみ表示」を明記した上で
ExitPlanMode を呼ぶ。ユーザーが承認 (任意のオプション) しても **フェーズ 7 では起票しない**。
代わりに「以下のコマンドで起票できます」として `op issue create` コマンド全文を表示してフェーズ 8 へ進む。

### 6-6. EnterPlanMode / ExitPlanMode が利用できない環境

Claude Code のバージョンによっては `EnterPlanMode` / `ExitPlanMode` tool が提供されない場合がある。
司令官はフェーズ -1 で `EnterPlanMode` 呼び出しが **tool 未定義エラー** で失敗した場合、
v1 互換のフォールバック挙動 (SKILL.md 規律のみでの read-only 進行 + フェーズ6 対話プレビュー) に退避する
(機能停止しない)。

> **いつ読むか**: フェーズ -1 で `EnterPlanMode` 呼び出しが tool 未定義エラーで失敗したとき、
> またはユーザーが承認 prompt に No を返したときのみ、
> `references/judge-panel-and-fallbacks.md (>=2)` (EnterPlanMode/ExitPlanMode フォールバック節) を読む。
> 通常の plan mode 遷移が成功するセッションでは読まなくてよい。

---

## フェーズ7: Issue 起票

> mcp channel では本フェーズの `op issue create` / `op issue comment` / `op issue edit-body` は
> call-spec を emit する — `github-channel.md` §3-§4 の protocol で完遂し、`details.issue_number`
> 等の後続値は ingest envelope から取る (fence 自体は無改変)。

v2 では本フェーズ以降は **plan mode を抜けた状態** で実行する。フェーズ 6 の ExitPlanMode で
ユーザーが選んだ承認オプションに応じて permission の挙動が変わる:

- `Approve and accept edits` → `op issue create` / `op issue comment` は prompt なしで実行
- `Approve and start in auto mode` → classifier 経由で working-directory 内コマンドとして自動承認
- `Approve and review each edit manually` → 各 op CLI コマンド実行時に permission prompt が出る

司令官側の処理ロジックは承認オプションに依存しない (どのモードでも同じ op CLI コマンドを叩く)。

フェーズ7 は **Pass 1 (全 issue 直列起票 + 番号収集)** と **Pass 2 (depends_on 解決 + body 更新)** の
2 パスで処理する。これにより judge-panel が出力する `issues[i].depends_on` (0-based index 配列) を
実 issue 番号に変換して `<!-- op-depends-on: #N, #M -->` marker と prose `## 依存` セクションを
正確に記載できる。

> **前提**: enrichment (フェーズ5) は `issues[]` の順序を変えない (per-issue 変換のみ)。
> よって judge が返した配列の index と Pass 1 の起票順は一致する。
> collision gate 等で起票されない issue が存在し得るため、Pass 2 では空 index を防御する。

### Pass 1: 全 issue を依存順に直列起票し、index→番号 対応表を作る

#### 7-1. ラベル承認プレビュー (`--ensure-labels --dry-run`)

`op issue create --ensure-labels` は未作成ラベルを起票時に自動作成するため、
かつての raw ラベル一覧取得 + grep による存否検査ループは不要になった。
未作成ラベルをユーザーに提示してから起票したい場合は `--dry-run` で作成予定を先に確認する:

```bash
# 先に enriched_issue.body を BODY_FILE に書き出しておく (Write tool)。
# op issue create は --dry-run でも --body-file を読み込むため、本起票 (7-3) と同じ
# BODY_FILE を 7-1 でも参照する (フェーズ7 全体で 1 つの BODY_FILE を使い回す)。
export BODY_FILE="/tmp/op-plan-$(date +%s).md"
: "${BODY_FILE:?BODY_FILE must be set — 起票する Issue 本文の一時ファイルパス}"

# NEEDED_LABELS は配列で初期化してから組み立てる (未定義配列の展開事故を防ぐ、bash fence convention)
NEEDED_LABELS=()
NEEDED_LABELS+=("auto-report" "pro-feature-expert")
# UI 影響時は pro-ux-ui-audit-expert を追加。domain によって pro-<expert>-expert が変わる
# (_shared/markers/labels-and-markers.md 参照)。CSV に join して渡す。
export LABEL_CSV=$(IFS=,; echo "${NEEDED_LABELS[*]}")

# 作成予定ラベルを起票せずプレビュー (labels_would_create を JSON で返す)
op issue create --title "<title>" --label "$LABEL_CSV" --body-file "$BODY_FILE" \
  --ensure-labels --dry-run
```

mcp channel では `op issue create --dry-run` は明示 bail するため本プレビューは skip する
(ensure-labels の事前確認は gh channel のみの機構。label の実検証は ingest read-back が担う)。

`labels_would_create` をユーザーに提示し、**承認後**に本起票へ進む
(承認なしに新規ラベルを勝手に増やさない)。

#### 7-2. Marker Publish Validate (起票直前 fail-fast)

各 `op issue create` の **直前** に、組み立てた Issue body の 機械可読 marker を fail-fast で検証する
(`_shared/expert-spawn.md` の **Marker Publish Validate 節** が正本)。#529 (commit 585298d) で
`op-post-check-expert: null` の誤 block が解消済のため、op-scan/op-patrol/op-architect と同様に
本 gate を有効化する (marker の typo / 必須フィールド漏れ / format drift を起票前に検出する)。

```bash
# BODY_FILE = 起票する Issue 本文 (機械可読 marker 記載済、enrichment 反映後)。
# marker 名・schema の参照は `op help marker <name>`。block 条件は op core marker-lint --strict。
LINT_JSON=$(op core marker-lint --body - --source-hint issue-body --strict < "$BODY_FILE" 2>/dev/null) || true
LINT_DECISION=$(printf '%s' "$LINT_JSON" | jq -r '.decision' 2>/dev/null)
if [ "$LINT_DECISION" != "pass" ]; then
  echo "❌ marker-lint block: $(printf '%s' "$LINT_JSON" | jq -c '.blocking_reasons // []' 2>/dev/null)"
  echo "→ 機械可読 marker を修正してから再起票する。block された draft は起票しない"
  # Direct Mode 固定のためユーザーに提示して停止する (op-plan は --auto を持たない)
fi
# LINT_DECISION == "pass" のときのみ op issue create に進む
```

> **`||` で握り潰さない**: `LINT_DECISION` を jq で取り出し `pass` を明示確認してから `op issue create` する
> (memory `feedback_op_review_meta_reviewer_field_required`: `op ... || fallback` だと block でも投稿が通ってしまう)。

#### 7-3. Issue 起票 (全 issue 直列ループ)

```bash
# judge-panel の戻り値 issues[] (0-based index) を直列起票し、index→実番号の対応表を作る。
# enrichment は issues[] の順序を変えないため、index と起票順は一致する (前提: フェーズ5確認済)。
#
# ISSUE_NUMS: 0-based index → 実 issue 番号 のマッピング配列
# MAP_TMP:    Pass 1 → Pass 2 で配列を受け渡すための一時ファイル
#             (_shared/bash-fence-convention.md: fence をまたぐ変数は一時ファイル経由)
declare -a ISSUE_NUMS   # index→番号 対応表。使用前に必ず初期化する
declare -a CREATED FAILED
export MAP_TMP
MAP_TMP=$(mktemp)       # export しておき Pass 2 の :? guard で受け取る

# ISSUES_JSON は judge-panel 戻り値 recommended.plan.issues[] を JSON 文字列として保持している想定。
# 件数を取得してインデックスでループする。
ISSUE_COUNT=$(printf '%s' "$ISSUES_JSON" | jq 'length')

for i in $(seq 0 $((ISSUE_COUNT - 1))); do
  # 各 issue のフィールドを取り出す (jq で直接取得)
  TITLE_I=$(printf '%s' "$ISSUES_JSON" | jq -r ".[$i].title")
  : "${TITLE_I:?TITLE_I must be set — judge issues[$i].title が空}"

  BODY_FILE_I="/tmp/op-plan-issue-${i}.md"
  # Issue 本文は Write tool で BODY_FILE_I に書き出す (長文・特殊文字対応)。
  # この SKILL.md を参照して実行するエージェントは、ここで Write tool を呼び出して
  # BODY_FILE_I を生成してから次の lint に進む。
  # depends_on は Pass 1 時点では実番号未確定のため、placeholder "(後で更新)" を埋める。
  # 依存セクションは Pass 2 で -final.md に差し替えるため、ここでは省略しておく。

  # 起票直前 Marker Publish Validate (op-architect IU1 Pass 1 のパターンを踏襲)
  LINT_JSON_I=$(op core marker-lint --body - --source-hint issue-body --strict < "$BODY_FILE_I" 2>/dev/null) || true
  LINT_DECISION_I=$(printf '%s' "$LINT_JSON_I" | jq -r '.decision' 2>/dev/null)
  if [ "$LINT_DECISION_I" != "pass" ]; then
    FAILED+=("issue[$i] lint: $(printf '%s' "$LINT_JSON_I" | jq -c '.blocking_reasons // []' 2>/dev/null)")
    continue   # lint block された draft は起票しない。Pass 2 でも skip される (ISSUE_NUMS[$i] が空)
  fi

  # op issue create は --ensure-labels で未作成ラベルを作成してから起票し、
  # JSON envelope { decision: pass, details: { issue_number, url, ... } } を返す。
  # 直列実行を厳守する (並列化は重複起票事故、CLAUDE.md / memory feedback_gh_issue_create_background)。
  CREATE_JSON_I=$(op issue create \
    --title "$TITLE_I" \
    --label "$LABEL_CSV" \
    --body-file "$BODY_FILE_I" \
    --ensure-labels)
  CREATE_NUM_I=$(printf '%s' "$CREATE_JSON_I" | jq -r '.details.issue_number // empty' 2>/dev/null)
  if [ -n "$CREATE_NUM_I" ]; then
    ISSUE_NUMS[$i]="$CREATE_NUM_I"
    CREATED+=("issue[$i]:#${ISSUE_NUMS[$i]}")
  else
    FAILED+=("issue[$i]: $CREATE_JSON_I")
  fi
done

# Pass 1 → Pass 2 受け渡し: ISSUE_NUMS を一時ファイルに serialize する。
# (declare -p は "declare -a VAR=([0]="42" [1]="43" ...)" 形式; 次 fence で source して復元)
: "${MAP_TMP:?MAP_TMP must be set — Pass 1 開始前の mktemp で生成済み}"
declare -p ISSUE_NUMS > "$MAP_TMP"
```

> **タイトル逆引きの廃止**: かつての検索 API (`--search "<title>"`) による起票後の番号取得は、
> 同名タイトルや検索 rate limit で取り違える既知のアンチパターン。
> `op issue create` の envelope `details.issue_number` を直接使うことで構造的に解消する。

#### 7-4. post_create_comments 投稿

`_shared/issue-enrichment.md` section 3.8 の output contract に `post_create_comments`
(Medium/Low 指摘) が含まれていた場合、起票後に Issue コメントとして追加投稿する。
複数 issue をループする場合は各 issue の起票直後 (上記 `if [ -n "$CREATE_NUM_I" ]` ブロック内) に
当該 issue の `post_create_comments` を投稿する:

```bash
# CREATE_NUM_I: 直前の op issue create で取得した実番号 (7-3 ループ内で使用)
# POST_CREATE_COMMENTS_I: per-issue の post_create_comments (enrichment output から取得)
# 使用前に必ず初期化する (未定義配列の展開事故を防ぐ、CLAUDE.md bash fence convention)
POST_CREATE_COMMENTS_I=()
for COMMENT in "${POST_CREATE_COMMENTS_I[@]}"; do
  op issue comment "$CREATE_NUM_I" --body "$COMMENT"
done
```

これにより Issue 本文の肥大化を避けつつ、レビュー情報を完全に残す
(`_shared/issue-enrichment.md` section 3.8.1 のポリシー)。

### Pass 2: depends_on を実 issue 番号に解決して body 更新

Pass 1 で収集した `ISSUE_NUMS` (index→番号) を使って、各 issue の `depends_on` (0-based index 配列) を
実 issue 番号に変換し、`<!-- op-depends-on: #N, #M -->` marker と prose `## 依存` セクションを
Issue body に記載する。依存のない issue は marker・prose 両方を省略する。

> **なぜ index ベースか**: judge-panel (op-plan-judge.js) は `issues[i].depends_on = [0, 1]` のように
> 0-based index で依存を表現する。enrichment はこの順序を変えないため、Pass 1 の起票順と index が一致し、
> `ISSUE_NUMS[$DEP_IDX]` で実番号に直接変換できる (op-architect は仮 key 方式だったが op-plan は index 方式)。

```bash
# Pass 1 → Pass 2 受け渡し: 一時ファイルから ISSUE_NUMS を復元する。
# (CLAUDE.md bash convention: fence をまたぐ変数は一時ファイル経由)
: "${MAP_TMP:?MAP_TMP must be set — Pass 1 の mktemp + declare -p serialize が完了しているか確認}"
: "${ISSUES_JSON:?ISSUES_JSON must be set — judge-panel の戻り値 issues[] JSON}"
# shellcheck source=/dev/null
source "$MAP_TMP"

ISSUE_COUNT=$(printf '%s' "$ISSUES_JSON" | jq 'length')

for i in $(seq 0 $((ISSUE_COUNT - 1))); do
  NUM="${ISSUE_NUMS[$i]:-}"
  if [ -z "$NUM" ]; then
    # Pass 1 で起票に失敗した issue は Pass 2 でも skip する (FAILED に記録済み)
    continue
  fi

  BODY_FILE_I="/tmp/op-plan-issue-${i}.md"   # Pass 1 で書き出した元 body ファイル
  FINAL_FILE_I="/tmp/op-plan-issue-${i}-final.md"

  # judge の depends_on[] (0-based index 配列) を実番号に解決する。
  # enrichment は issues[] を reorder しないため index と起票順は一致する (前提: controller 確認済)。
  DEP_NUMS=""          # marker 用 "#806, #807" 形式 (依存なしなら空のまま)
  DEP_PROSE_LINES=""   # prose 用 "- depends on #806\n- depends on #807" 形式

  DEP_COUNT=$(printf '%s' "$ISSUES_JSON" | jq ".[$i].depends_on | length")
  for j in $(seq 0 $((DEP_COUNT - 1))); do
    DEP_IDX=$(printf '%s' "$ISSUES_JSON" | jq -r ".[$i].depends_on[$j]")
    DEP_NUM="${ISSUE_NUMS[$DEP_IDX]:-}"
    if [ -z "$DEP_NUM" ]; then
      # 依存先が起票失敗 (collision gate 等) していた場合は警告してスキップ
      FAILED+=("issue[$i] depends_on[$j] resolve: index $DEP_IDX は ISSUE_NUMS に存在しない (起票失敗の可能性)")
      continue
    fi
    # カンマ区切りで結合 (marker 用)
    if [ -z "$DEP_NUMS" ]; then
      DEP_NUMS="#${DEP_NUM}"
    else
      DEP_NUMS="${DEP_NUMS}, #${DEP_NUM}"
    fi
    DEP_PROSE_LINES="${DEP_PROSE_LINES}- depends on #${DEP_NUM} (先に完了が必要)\n"
  done

  # -final.md を Write tool で生成する (prose 指示)。
  # BODY_FILE_I をベースに以下の 2 点を差し替える:
  #   (a) 機械可読 marker block の末尾 (op-post-check-expert 行の直後) に
  #       "<!-- op-depends-on: $DEP_NUMS -->" を追加する。
  #       依存のない issue は marker 行ごと省略する (空 value は lint error — ADR-0019 D1)。
  #   (b) prose "## 依存" セクションを実番号の箇条書きに差し替える。
  #       依存のない issue は "## 依存" セクションごと省略する。
  #   (c) フェーズ5-0 の follower (同一 surface の非 lead) は "## 🎨 Design Plan" 節の
  #       "参照: issue[<k>]" を "参照: #${ISSUE_NUMS[$k]}" に差し替える。lead が起票失敗 (ISSUE_NUMS[$k] 空)
  #       なら FAILED に記録し、節を "参照先 (issue[<k>]) が未起票のため Design Plan なし — apply 時に再構築" に
  #       差し替える (op-run apply の Design Plan 無し fallback に落とす)。
  # 生成は Write tool で行う (長文・特殊文字が混在するため bash printf/sed より確実)。
  #   → この SKILL.md を参照して実行するエージェントは、
  #     ここで Write tool を呼び出して FINAL_FILE_I を生成してから次の lint に進む。

  # -final.md に対して marker-lint を通す (Pass 1 の lint パターンを踏襲)
  LINT_JSON_F=$(op core marker-lint --body - --source-hint issue-body --strict < "$FINAL_FILE_I" 2>/dev/null) || true
  LINT_DECISION_F=$(printf '%s' "$LINT_JSON_F" | jq -r '.decision' 2>/dev/null)
  if [ "$LINT_DECISION_F" != "pass" ]; then
    FAILED+=("issue[$i] final lint: $(printf '%s' "$LINT_JSON_F" | jq -c '.blocking_reasons // []' 2>/dev/null)")
    continue   # lint 失敗は edit-body せず次の issue へ (FAILED に記録済み)
  fi

  # lint pass のときだけ Issue body を更新する。
  # 直列実行厳守 (並列化は重複更新事故の原因、CLAUDE.md bash convention)。
  EDIT_RESULT=$(op issue edit-body --number "$NUM" --body-file "$FINAL_FILE_I" 2>&1) \
    || FAILED+=("issue[$i] edit: $EDIT_RESULT")
done
```

#### Issue 本文テンプレ (`## 依存` セクションの書き方)

Pass 1 で書き出す BODY_FILE_I には `## 依存` セクションを placeholder として含めておく。
Pass 2 の Write tool で実番号に差し替える (依存なし issue はセクションごと省略)。
marker と prose は「正本ペア」(`_shared/markers/labels-and-markers.md` 参照) のため必ず両方を更新する。

> **いつ読むか**: 上記 Pass 2 の `FINAL_FILE_I` を Write tool で生成するとき、機械可読 marker
> ブロック (`op-depends-on` 追加位置) と prose `## 依存` セクションの実例を確認したい場合のみ、
> `references/issue-body-template.md (>=1)` を読む。

---

## フェーズ8: op-run 起動承認

op-run との結合は **疎結合** (proposal section 4.4)。Issue 起票で完結してもよいし、
ユーザー承認のうえで op-run を直接起動してもよい。

### 8-1. 起動プロンプト

```
Issue #<N> を起票しました: <title>

op-run を起動して実装に進みますか?
1. 起動する (`op-run <N>` を実行)
2. 起動コマンドだけ表示 (後で手動実行)
3. 終了 (起票のみで完了)
```

> **depends_on を持つ工程群を起票した場合 (Pass 2 で `op-depends-on` marker 配線済み)**:
> `/op-loop --label <L>` で依存順 (DAG 層順) に監督付きで直列駆動できます (op-run はファイル競合のみで直列化するため
> 論理工程依存を組めない / ADR-0019)。疎結合のため自動 handoff はせず、人間が `/op-loop` を起動します (ADR-0013 流儀)。

> **mcp channel (Cloud) でも op-run は起動できる**。ADR-0027 6b で Cloud の `/op-run` が
> PR open → global review → approve → `pro-reviewed` まで degrade せず完走することを実機検証済み
> (実 PR #59、verdict = `approved`)。さらに ADR-0028 第七波で Issue → PR → squash merge → Issue close の
> 全ライフサイクルを mcp channel で完結する連鎖 dogfood も通っている。
>
> 残る運用上の制約は **並行実行しないこと** の 1 点。`op claim` は mcp channel で恒久 refuse される
> (ADR-0024 non-goals: push-race の atomic CAS が MCP 経路では保証できないため) ので、op-run は
> claim acquire を skip して進む (`op-run/SKILL.md` 1-2-e)。排他が効かないため、**同一 repo に対して
> Cloud セッションで op-run を並行起動しない** (単一 instance 前提)。
>
> なお Cloud では GitHub 書き込みが call-spec 経路になる (`_shared/github-channel.md` §3-§4) ため、
> 司令官 / ClusterOrchestrator が MCP tool を verbatim 実行する往復が挟まる。これは体感の差であって
> 機能制限ではない。

### 8-2. 起動する場合

ユーザーが 1 を選んだ場合、司令官は **Skill tool 経由で op-run を直接起動できる** (推奨経路)。
ユーザーが slash command を再入力する必要はない。

```
Skill({
  skill: "op-run",
  args: "<N1> <N2>"   // 起票した Issue 番号を空白区切りで渡す
})
```

- 司令官 (= op-plan を実行している Claude 自身) は本 SKILL の指示書を継承する controller として
  op-run の指示書を読み、フェーズ0 から順に実行する
- 複数 Issue を起票した場合は `args: "<N1> <N2> ..."` 形式で並べる (空白区切りが op-run の指定モード)
- `--auto` / `--label <name>` 等の op-run フラグもそのまま args に渡せる
- op-plan / op-run の責務分離 (疎結合) は保ったまま、ユーザーの slash 再入力を省略する自動経路として機能する

ユーザーに案内する場合の **fallback (手動経路)**:

```
op-run #<N> を起動するには以下を実行してください:

  /op-run <N>

または、複数 Issue まとめてクラスタリングしたい場合:

  /op-run
```

司令官が直接 spawn しなかった (ユーザーが「自分で叩く」と希望した等) ケース用に
手動コマンドも併記しておくとよい。

### 8-3. 起動しない場合

ユーザーが 2 / 3 を選んだ場合、本スキルは正常終了する。
起票した Issue #N の URL を表示して完了。

### 8-4. `--no-op-run` モード時

`--no-op-run` 起動時は本フェーズをスキップし、Issue 起票完了で正常終了する。

---

## フェーズ完了後の状態

正常完了時の状態:

- Issue #N が起票済み (enriched 状態、機械可読 marker 完備)
- `op-source: op-plan` で routing 可能
- Medium/Low の post_create_comments が Issue コメントとして追加済み
- op-run を起動するか、ユーザーが手動で `/op-run <N>` できる状態

エラー / block / キャンセル時の状態:

- Issue は起票されない (block 判定 / ユーザーキャンセルの場合)
- 作業途中のメモ (フェーズ 1〜3 の確定情報) は司令官 context に残るが、
  次回 `/op-plan` 起動時には引き継がれない (state-less 設計)

`op-architect --extend` は廃止済み (CLAUDE.md 配布・運用方式節)。既存プロジェクトへの新領域追加は
本スキル (op-plan) を使う。op-plan と op-architect の使い分け基準は上記「このスキルの位置づけ」表
および「設計原則 2」(ADR 必要時は op-architect へ escalate) を参照。
