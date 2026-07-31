---
name: op-patrol
description: 警備員的にリポジトリを巡回監査するスキル。明示 scope ではなく repo map と GitHub Issue Ledger に基づき、リスク重み・腐敗度・変更頻度から区画 (module / feature) を選定して read-only audit し、Critical/High だけを Issue 化する。巡回履歴は専用 GitHub Issue (Patrol Ledger) のコメントで管理し、ローカルキャッシュは持たない。「巡回」「op-patrol」「patrol」「警備」「定期監査」等のキーワードで起動。
---

<!--
schema_version: 2
last_breaking_change: 2026-05-31
notes: 2026-07-29 追記 (ADR-0029 Wave B1 J5) — progressive disclosure による薄い入口化。
       「Patrol Ledger Issue の仕様」節 (検索条件/初回作成設定/body 運用契約/schema pointer/
       architecture_debt 追跡手順/CLI 運用例) を `references/patrol-ledger-schema.md` へ、
       フェーズ2 のスコア計算式群 (risk/stale/churn/complexity/incident/
       recently_scanned_penalty・starvation_bonus/jitter) を `references/patrol-score-formulas.md`
       へ物理切り出し (移動のみ、内容変更なし)。本文には「いつ読むか」トリガー付き pointer を残す。
       あわせて散文の bare `subagent_type: security-expert` を plugin scoped 名
       `op-skill:security-expert` へ修正 (D1)。Ledger 契約・severity gate・巡回履歴の内容は不変
       のため schema_version 据え置き。
       2026-07-23 追記 (ADR-0024 Phase 3 第四波 / ADR-0026) — Cloud (mcp channel) 対応 +
       Patrol Ledger v2 追従。`github-channel.md (>=2)` を pin 追加、`patrol-markers.md` pin を
       `(>=2)` に bump (ADR-0026 破壊的変更 — body 型 state 文書への再設計)。フェーズ0-1 の
       `gh auth status` に channel guard、フェーズ0 の `ledger pull --auto-find` に mcp 素材注入
       注記を追加。architecture_debt フロー (`gh issue list` → mcp 代替素材注記 /
       `gh issue edit --body` → `op issue edit-body` に置換) / incident_score の
       `mcp__github__search_issues` total_count 注記を追加。Ledger 運用例とフェーズ7 (init / run
       コメント / state 更新 push) の `op patrol ledger` flag を v2 実装 (`--checkpoint-id` →
       `--run-id`、`init --body-file` 廃止 等) に追従。`gh issue create` / `gh issue comment`
       表記を `op issue create` / `op issue comment` に統一。非破壊 additive のため schema_version
       据え置き。
       v2 (2026-05-31) — ADR-0009 Phase C / C3。フェーズ4 の区画別観点別並列 audit を
       single-message の Agent (run_in_background) + Monitor 待ちから Dynamic Workflows
       (`Workflow({name:'op-patrol-audit'})`) へ全面移行。同時に C2 (op-scan) で確立した
       起票前 refute stage を default-on で同梱 (新フェーズ4.5、audit→refute 2-phase、
       security 非対称ルール D7 + refuted/downgrade-drop は drop + 完了報告可視化 D8)。
       CLI化残を解消: ledger 検索 → `op patrol ledger pull --auto-find` / repo map metadata →
       `op patrol repo-map` / Ledger 初回作成 → `op patrol ledger init`。フェーズ0 に
       Dynamic Workflows capability preflight (hard-fail) を追加。Marker Publish Validate
       fail-fast を有効化 (#529 で `op-post-check-expert: null` 誤 block 解消済)。
       区画 enumeration (find) / git rev-parse / gh auth は primitive 不在の discovery preflight
       として維持 (op-scan/op-run と同基準)。spawn 機構の破壊的変更のため bump。
       v1 (2026-05-11) — Issue Enrichment 統合 (proposal Phase 5)。検出後・起票前に
       `_shared/issue-enrichment.md` 経由の enrichment 層を default で挟む。`--no-enrichment` /
       `--strict-enrichment` / `--with-cross-review` の 3 flag を追加。Patrol Finding Policy
       (Critical/High のみ起票) は維持し、enrichment 層が返す `post_create_comments`
       (Medium/Low 指摘) は op-patrol では投稿しない (op-scan との挙動差)。
-->

# op-patrol: リスク重み付き巡回監査 (GitHub Issue Ledger 方式)

/**
 * 機能概要: ユーザーが指定しない領域を、警備員のように repo map と巡回履歴に基づいて
 *           選定・監査するスキル。区画 (module / feature) 単位で 1〜6 area を選び、
 *           area の性質に応じて 1〜3 expert を read-only spawn する。
 *           Critical/High のみ Issue 化し、巡回履歴は専用 GitHub Issue (Patrol Ledger) の
 *           コメントとして append-only で記録する。ローカルキャッシュは持たない。
 * 作成意図: op-scan は「明示 scope の差分監査」が芯で、対象選定そのものに価値はない。
 *           大規模 repo では「変更されない古い領域」「高リスク境界」が腐敗の温床になり、
 *           op-scan の差分監査では永久に見つからない。これを警備員的に巡回することで、
 *           全域 scan のコスト・ノイズを払わずに潜在バグと腐敗を検出する。
 *           ランダム scan ではなく「リスク重み + 腐敗度 + 巡回履歴」で選ぶのが本質。
 *           state を GitHub Issue に寄せることで、ローカル file の commit/conflict/stale 問題を
 *           完全に排除し、チームで自然に共有される単一正本を持つ。
 * 注意点: scan は read-only。Issue 起票はユーザー承認後 (--auto モード除く)。
 *         巡回履歴は専用 Issue (label: op-state) のコメントが唯一の正本。
 *         .op/patrol-state.json は使用しない (旧仕様)。
 *         Patrol Finding Policy が op-scan より厳しい (好みリファクタ・命名好み等は完全禁止)。
 *         op-run が patrol 起票 Issue を実装するため、Issue 本文は op-scan と同じ指示書フル版を必須とする。
 */

警備員のようにリポジトリを巡回し、リスク領域・腐敗領域・未巡回領域を read-only audit する。
**Issue 起票はユーザー承認後のみ。** scan 自体はコードを変更しない。
**巡回履歴は専用 GitHub Issue (Patrol Ledger) で管理し、ローカル state ファイルは作らない。**

---

## Issue Marker and Patrol Runtime Contract

marker の routing metadata 定義・runtime spawn 解決の正本は以下を参照:
- `skills/_shared/runtime-contract.md` — spawn 境界 / apply 可否 / routing 正本
- `skills/_shared/active-expert-registry.md` — runtime-spawnable active expert 一覧
- `skills/_shared/planned-experts.md` — planned expert (spawn 禁止) 一覧
- `skills/_shared/markers/labels-and-markers.md` — marker 名・意味の正本

op-patrol 固有の注意点:
- `review-expert` は active expert だが、patrol / scan / apply の `recommended_runner` 候補にしない (global review 専任)。
- `security-expert` は active expert。op-patrol は security area 巡回時に `subagent_type: "op-skill:security-expert"` で正式 spawn し、canonical schema 拡張 (security / threat_model / usable_security / post_check) を必須出力とする (plugin scoped-name 規約、`_shared/expert-spawn.md` 正本)。
- `env-expert` は planned expert (未実装)。env area の patrol が起票する Issue では `op-run-expert` marker は routing metadata に留め、runtime spawn 担当の決定は op-run の独立解決に委ねる (詳細手順は `_shared/runtime-contract.md` / `_shared/planned-experts.md`)。release / installer / distribution 方針判断が主題なら `needs_human_decision` (commander triage) に倒す。

env-expert 実装時は本 Notice を削除する。

---

## op-scan との使い分け

| スキル | 対象選定 | 想定 |
|-------|---------|------|
| `op-scan [scope]` | 司令官 / ユーザーが指定 | 機能追加前後の差分監査・特定領域の重点監査 |
| `op-scan --domain ...` | 観点を絞った全域監査 | リリース前の特化チェック |
| `op-patrol` | **agent が Patrol Ledger と repo map から選定** | 普段触らない領域の腐敗検出・定期巡回 |

op-scan は「ここを見てほしい」と命じる。op-patrol は「警備員、今日もよろしく」と任せる。
両者を併用することで、明示監査 (op-scan) と未明示巡回 (op-patrol) の両輪が成立する。

---

## 実行モード

| モード | 起動 | 動作 |
|-------|------|------|
| 対話 (デフォルト) | `/op-patrol` | budget=medium で patrol plan 提示 → 承認後 audit |
| 軽量 | `/op-patrol --budget small` | 1〜2 area・各 area 最大 2 expert |
| 標準 | `/op-patrol --budget medium` | 2〜3 area・各 area 最大 3 expert |
| 大型 | `/op-patrol --budget large` | 4〜6 area・各 area 最大 3 expert |
| 自動 | `/op-patrol --auto` | plan 承認スキップ、Critical/High かつ --auto policy 通過分のみ自動起票 |
| 計画のみ | `/op-patrol --dry-run` | patrol plan 提示で停止、audit しない |
| リスク絞り | `/op-patrol --risk file-io,ipc,queue` | 指定リスクカテゴリのみ candidate に含める |
| 腐敗優先 | `/op-patrol --stale` | stale_score の重みを引き上げる |
| 強制対象 | `/op-patrol --area src-tauri/src/file_io` | 指定 area を必ず candidate top に含める |
| 一時除外 | `/op-patrol --exclude src-tauri/src/commands` | 指定 area を candidate から外す。直近巡回した area が連続して top に来てしまう状況で rotation を促す bridge mechanism (`op patrol ledger` 整備までの暫定策) |
| 再現巡回 | `/op-patrol --random-seed 20260503` | jitter 乱数を固定 (検証・再現用) |
| Ledger state 手動更新 (v1 名称: 圧縮) | `/op-patrol --compact-ledger` | 手動で Ledger の state (body) を更新する (audit はしない。v2 では state が body 1 箇所のため checkpoint 圧縮は不要 — フェーズ7-3 参照) |
| enrichment skip | `/op-patrol --no-enrichment` | フェーズ5.5 の enrichment 層を skip (旧挙動互換) |
| enrichment 厳格 | `/op-patrol --strict-enrichment` | enrichment 層の failure mode を strict にする (中間失敗で即中断) |
| cross-review 強制 | `/op-patrol --with-cross-review` | severity Critical 以下でも enrichment 内の cross-review を強制実行 |

組み合わせ可: `/op-patrol --budget large --stale --auto`

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
フェーズ0 で `_shared/version-check.md` の手順に従い整合性を確認する (mismatch 時は warning + ユーザー確認)。

- `~/.claude/skills/_shared/runtime-contract.md` — apply / fix / patrol-time runtime spawn と routing metadata の分離、active-only spawn 原則、planned expert の fallback 解決手順 (正本)
- `~/.claude/skills/_shared/planned-experts.md` — planned expert の現状一覧と routing fallback 規約 (正本)
- `~/.claude/skills/_shared/markers/labels-and-markers.md` — OP label / hidden marker の名前と基本意味 (正本)。本 SKILL.md 中の marker 例示は本ドキュメントを正本とする
- `~/.claude/skills/_shared/markers/patrol-markers.md` (>=2) — `<!-- op-patrol-ledger-state -->` (body 側 state 文書) / `<!-- op-patrol-run -->` (コメント側監査ログ) の JSON schema / area_state レコード構造 / 命名規則 (正本、ADR-0026 で body 型 state 文書へ再設計。`<!-- op-patrol-checkpoint -->` は廃止)
- `op-tools/docs/specs/patrol-ledger.md` (>=1) — `op patrol ledger pull/push/to-flags/area-state/init` CLI 実装詳細仕様 (parser 挙動 / RFC3339 強制 / 冪等性 / FetchSession 統合。v2、ADR-0026 実装完了)
- `~/.claude/skills/_shared/expert-spawn.md` — subagent prompt 規約、canonical schema、planned expert spawn 禁止、release-expert 再分類、review-expert global review、security-expert active post-check / apply 契約 (commits_added required (v14) / パターン1: scan 用)。**Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) — controller が `gh issue create` / Patrol Ledger コメントで hidden marker を埋める前に `op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict` を通す契約。`op-post-check-expert: null` を必ず埋める規約は維持する。run コメントは `op patrol ledger push` 内部で marker を生成するため controller 側の手書き marker publish は無い
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — active runtime-spawnable expert の canonical registry。OP runtime spawn 可否の正本であり、agent frontmatter は mechanical linkage 確認用 (矛盾時は contract error)。agent 名から `skills/expert-<agent-name>/` を機械生成しないための参照表
- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode の対話可否契約 + needs_human_decision schema
- `~/.claude/skills/_shared/severity-rubric.md` (>=1) — Critical / High / 起票しない の判定基準
- `~/.claude/skills/_shared/project-profile.md` (>=1) — Rust / Flutter / Vue / Tauri 想定スタック
- `~/.claude/skills/_shared/pr-templates.md` (>=13) — Issue 本文テンプレ (指示書フル版) + op-security-post-check (8 観点 + usable_security / aux post-check 状態 / needs_human_decision) + 新ラベルカタログ (pro-security-* / pro-env-expert 含む) + pro-review-expert は Issue routing 対象外 + Needs Human Decision テンプレ
- `~/.claude/skills/_shared/common-setup.md` (>=2) — 言語検出・git 確認の共通手順 + Invocation Mode Overrides
- `~/.claude/skills/_shared/auto-policy.md` (>=3) — `--auto` 自動起票の判定 8 項目 + manual_review_bucket (op-scan と共通)
- `~/.claude/skills/_shared/dedup-policy.md` (>=3) — fingerprint 生成仕様 + 既存 Issue 重複除外 4 段優先順位 + `op-refactor-debt-key` (refactor の debt 追跡補助 marker、v3 から) (op-scan と共通)
- `~/.claude/skills/_shared/issue-enrichment.md` (>=2) — Issue draft → enriched Issue 変換層 (Design Plan 生成 + gate + cross-review)。op-scan / op-patrol / op-plan の 3 スキルから共通参照される canonical な起票前 review パイプライン (proposal 2026-05-10 Phase 1 で新設)
- `~/.claude/skills/_shared/model-selection.md` (>=5) — expert spawn 時の model (Opus / Sonnet / Haiku、具体 version は §1) 選択 / task_complexity / 区画 complexity の canonical 正本。op-patrol は区画スコアリング (リスク × 腐敗度) を audit_model 出力 (complex / critical → Opus) に拡張する。**区画 audit / refute / enrichment はいずれも read-only 経路のため `fable` 禁止** (§7.2 F3 (>=5))
- `~/.claude/skills/_shared/op-config-schema.md` (>=1) — `op-config.yaml` schema 定義の canonical 正本。op-patrol は `domain_tags` で `critical` 区画を判定し、`complexity_thresholds` で `complex` 区画を判定する
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック手順 + Invocation Mode 上の責務分離
- `~/.claude/skills/_shared/github-channel.md` (>=2) — GitHub I/O channel / call-spec protocol。mcp channel (Cloud) での素材注入手順 (§6) と司令官の call-spec 実行義務 (§3-§4) の正本
- `~/.claude/workflows/op-patrol-audit.js` — フェーズ4 の区画別観点別並列 audit + 起票前 refute を実行する Dynamic Workflow (ADR-0009 Phase C / C3)。controller は確定 region (area + expert_list + model) を args 注入して `Workflow({name:'op-patrol-audit'})` で呼ぶ。spawn prompt 本文 / scan-finding schema / refute verdict schema はこのファイルが正本 (本 SKILL.md では重複保持しない)。plugin 同梱の `${CLAUDE_PLUGIN_ROOT}/workflows/op-patrol-audit.js` を SessionStart hook が `~/.claude/workflows/` へ冪等 staging する (ADR-0023)
- `op-tools/docs/adr/0009-dynamic-workflows-for-op-fanout.md` — OP fan-out / verify を Dynamic Workflows へ移行する設計判断 (決定5: フォールバック非保持 / fail-fast、不変則9: 1 PR = 1 OP skill 全面書換)。op-patrol は C3 wave
- `op-tools/docs/adr/0010-workflow-script-distribution.md` — workflow script (`.js`) の repo 正本配置 (repo-root `workflows/`、skill bundle 対象外 infra) の経緯。配布経路は ADR-0023 に統合済み
- `op-tools/docs/adr/0023-workflow-plugin-distribution.md` — workflow script の現行配布経路 (2026-07-21 移行後の正本)。SessionStart hook (`hooks/hooks.json`) による `~/.claude/workflows/` 冪等 staging (旧経路は deprecated、詳細は CLAUDE.md「配布・運用方式」節)
- `references/patrol-ledger-schema.md` — Patrol Ledger Issue の検索条件 / 初回作成設定 / body (state 文書) 運用契約 / JSON schema pointer / `architecture_debt` 系 finding の既存 Issue 突合手順 / `op patrol ledger` CLI 運用例 (Ledger 初期化・修復時、または architecture_debt dedup 時のみ参照)
- `references/patrol-score-formulas.md` — フェーズ2 patrol_score の各 component (risk/stale/churn/complexity/incident/recently_scanned_penalty・starvation_bonus/jitter) の算出式・上限値・実装詳細注記 (area 選定理由の説明や score 検証が必要なときのみ参照)

---

## read-only policy (op-scan と共通)

巡回中の許可・禁止操作は op-scan と完全に揃える。

### audit フェーズ (フェーズ1〜5)

許可:
- `Read` / `Grep` / `Glob`
- `git status` / `git log` / `git diff` / `git ls-files`
- `op issue list` (既存 Issue 重複判定 / Ledger 検索。mcp channel では `mcp__github__search_issues` 代替)

禁止:
- ソースコード変更 (`Edit` / `Write` / `NotebookEdit`)
- format / lint fix の自動実行
- build (`cargo build`, `pnpm build`, `flutter build` 等)
- test 実行
- 依存関係変更 (`cargo add`, `pnpm add` 等)

### issue フェーズ (フェーズ6)

- 対話モード: ユーザー承認後のみ `op issue create`
- `--auto`: 後述の **--auto policy** を通過した検出のみ `op issue create`

### ledger フェーズ (フェーズ7)

- 専用 Patrol Ledger Issue に対する `op issue comment` (監査ログ post) / `op patrol ledger push`
  (body の state 更新、内部で `op issue edit-body` を呼ぶ) のみ許可
- run コメント (監査ログ) 追加と state (body) 更新が許可される唯一の書き込み操作 (v2、ADR-0026。
  v1 の checkpoint コメント追加は廃止)
- 通常の検出 Issue や他 Issue へのコメントはこのフェーズの守備範囲外

---

## --auto policy

`_shared/auto-policy.md` を参照 (op-scan と共通仕様)。
本 SKILL の `--auto` 動作 (フェーズ6) はこの policy をそのまま採用する。

---

## フェーズ0: 環境確認 + Patrol Ledger ロード

### 0-pre. _shared 整合性チェック

`_shared/version-check.md` の「起動時チェック手順」に従い、下記「## 参照ドキュメント」節の `(>=N)` と各 `_shared/*.md` 冒頭の `schema_version` を照合する。mismatch 検出時は warning を表示し、ユーザーに続行可否を確認する (`--auto` モードでも一旦停止)。pass なら以降に進む。

加えて、`_shared/version-check.md` の「installed op binary 鮮度確認」節 (Issue #249) に従い、`op version --json` の `details.git_sha` と `git log --format='%h' -n1 -- op-tools/crates/` の最新 SHA を比較する (比較元 path は binary 挙動に影響する範囲に絞る。docs-only commit の false-drift 回避 = Issue #641)。不一致時は warning + `cargo install --path op-tools/crates/op` を案内 (hard fail なし)。

### 0-1. git / CLAUDE.md / gh

```bash
git rev-parse --is-inside-work-tree || { echo "not a git repo"; exit 1; }
```

CLAUDE.md があれば必ず Read で読む (規約遵守の前提として)。

```bash
# gh 認証 (mcp channel = call-spec 経路では gh 不要 — github-channel.md)
if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要)"
else
  gh auth status || { echo "gh login が必要"; exit 1; }
fi
```

gh channel (未設定含む) のみ未認証で中断する。mcp channel は `! gh auth login` 案内をスキップする。

### 0-2. Dynamic Workflows capability preflight (hard-fail)

フェーズ4 の区画別観点別並列 audit は `op-patrol-audit` Dynamic Workflow へ委譲されるため、
`_shared/workflow-calling.md` **§1 capability preflight** (正本、hard-fail の理由・actionable message 文言は
複製しない) の通り起動直後に Workflow tool 利用可否を確認する。

**op-patrol 固有**: `--compact-ledger` (audit しない、Ledger 圧縮のみ) と `--dry-run` (フェーズ3 plan で停止、
audit に到達しない) は本 preflight の対象外 (§1「対象外の経路」に該当、skip してよい)。

### gh auth ありの場合

`op patrol ledger pull --auto-find` で Patrol Ledger Issue の自動検索 + 最新 state (body 1 読み) の取得を
1 primitive で行う (op-state ラベル検索 → body の parse)。
discovery 単体の `gh issue list` は不要 (--auto-find が内部で実行する)。

```bash
# --auto-find: op-state ラベルで Ledger を自動検索 (0 件: exit!=0 / 1 件: 採用 / 複数件: 最古 Issue 採用 + .warnings に列挙)。
# area_state / 差分マージ / parse fallback は primitive 内部で実行 (gh CLI glue は op::fetch に集約)。
LEDGER_PULL=$(op patrol ledger pull --auto-find --json 2>/dev/null) || true
LEDGER_DECISION=$(printf '%s' "$LEDGER_PULL" | jq -r '.decision // "error"' 2>/dev/null)
case "$LEDGER_DECISION" in
  pass)
    # 採用: Ledger Issue 番号 (.details.issue_number) と area_state (.details.area_state) を後続フェーズへ引き継ぐ
    export LEDGER_ISSUE=$(printf '%s' "$LEDGER_PULL" | jq -r '.details.issue_number')
    # 複数 Ledger 検出時の最古採用 + 他 Issue の警告は .warnings に出る (最終報告へ転記する)
    ;;
  *)
    # 0 件 (--auto-find は exit code != 0) または parse 失敗 → Ledger 未作成扱い
    echo "Patrol Ledger 未検出。フェーズ7 で op patrol ledger init する (この時点では作らない)"
    echo "（--dry-run の場合は作成しない。「Ledger 未作成。初回 audit 実行時に作成予定」と表示する）"
    ;;
esac
```

mcp channel では `op patrol ledger pull --auto-find` は `--input-json <素材>` が必須 (label:op-state の
`mcp__github__search_issues` 生素材、詳細は `github-channel.md` §6)。司令官 (または OP-managed worker)
が素材を取得し `--input-json` で注入する (gh には到達しない、`gh_calls=0`)。

ロード (v2、body 1 読み) の正本は `~/.claude/skills/_shared/markers/patrol-markers.md` の「state ロード
(v2、body 1 読み)」節。`op patrol ledger pull` は Ledger Issue の body を 1 回 parse するだけで
`area_state` / `state_rev` / `last_run_id` が復元される (v1 の checkpoint + run コメント差分マージは
ADR-0026 で廃止)。marker 皆無 (v1 body) は warning 付きで空 state を返し、marker 在但 JSON 破損は
fail-closed する。**自動 close はしない** (誤検出時のロールバック余地を残すため、複数 Ledger 検出は警告のみ)。

### gh auth なしの場合

- 通常実行: 中断し、`! gh auth login` を案内する
- `--dry-run`: 続行可能。フェーズ2 で **暫定 plan モード** に切り替える (後述)

### 旧 `.op/patrol-state.json` が残っている場合

- 読み込まない・更新しない・削除もしない
- 最終報告に「旧 ローカル state ファイルを検出。現行は GitHub Issue Ledger 方式のため参照していない」と注意のみ表示
- ユーザーが手動で削除するか判断する

---

## Patrol Ledger Issue の仕様

Patrol Ledger Issue (label `op-state` / `do-not-close`) は巡回履歴を保存する唯一の正本。
state は body 1 箇所 (v2、ADR-0026) に一本化され、コメント (`<!-- op-patrol-run -->`) は人間向け
append-only 監査ログで **機械は二度と読まない**。このIssueは**クローズしない**。ローカルキャッシュは
持たない (state を参照するエージェントは本 Issue の body を毎回読む)。

検索条件 / 初回作成時の設定 (label) / body (state 文書) の運用契約 / state・run コメントの
JSON schema pointer / `architecture_debt` 系 finding の既存 Issue 突合手順 (優先順位付き dedup) /
`op patrol ledger` CLI 運用例の詳細は `references/patrol-ledger-schema.md` を参照する
(**Ledger の初期化・修復を行うとき、または `architecture_debt` / `staged_refactor` /
`needs_spec_decision` finding の既存 Issue 重複判定を行うときのみ読む** — 通常の巡回主経路
[フェーズ0 ロード / フェーズ7 更新] は SKILL.md 本文と `_shared/markers/patrol-markers.md` の
参照だけで完結する)。

---

## フェーズ1: repo map 構築

リポジトリを **区画 (module / feature area) 単位** で列挙する。
ファイル単位ではない。1 ファイルだけ見ても文脈が薄く監査精度が落ちる。

### 区画の単位

優先順位:

1. CLAUDE.md / `module_map` 設定があればそれに従う
2. workspace 設定 (`Cargo.toml [workspace]`, `pnpm-workspace.yaml`, monorepo 規約) に従う
3. なければ「主要 directory の 2〜3 階層目」を区画とする
   - 例: `src-tauri/src/commands/export/`, `apps/desktop/src/features/job-board/`, `crates/job_queue/`

区画の列挙 (discovery) は op primitive を持たないため、設定優先 + directory fallback で行う
(これは `git rev-parse` / `gh auth` と同じ discovery preflight。op-scan/op-run の env precheck と同基準で raw bash を残す):

```bash
# 候補 directory 列挙 (fallback。優先順位 1-2 の設定があればそれを使う)。
# 列挙結果を AREAS_FILE に書き出し、後続 fence で op patrol repo-map / score に渡す。
export AREAS_FILE=$(mktemp)
find src-tauri/src apps crates packages -maxdepth 3 -type d 2>/dev/null \
  | grep -vE '(node_modules|target|dist|build|\.dart_tool|__pycache__|\.venv)' \
  | sort > "$AREAS_FILE"
```

列挙した区画の metadata (stale_score / churn_score / complexity_score の素データ) は
`op patrol repo-map` で bulk 収集する (per-area の `git log` / `find` 生 bash は wave-05 で本 primitive に統合済):

```bash
: "${AREAS_FILE:?AREAS_FILE must be set — 区画列挙 fence で確定した area リストファイル}"
# --last-scanned-at は フェーズ0 の area_state から `<area>=<RFC3339>` 形式で注入可 (任意)。
op patrol repo-map --areas-file "$AREAS_FILE" --json
# 出力 .details.areas[] = { area, file_count, max_file_lines, commits_last_90_days, todo_count,
#   footgun_count, days_since_last_change, risk_categories }。これが区画 metadata の正本。
```

> repo-map の metadata は フェーズ2 `op patrol score` が内部で再計算する値と同一ソース
> (`op-core/src/patrol/repo_meta.rs`)。フェーズ1 は人間向けの repo map overview、フェーズ2 score は
> patrol_score 算出 + `metadata_provenance` 返却を担う (`score --json` が同 metadata を内包する)。

50 区画を超える大規模 repo では、区画列挙を `Agent(subagent_type: Explore)` に委譲し要約のみ受け取る
(Context Window 保護)。metadata 収集自体は `op patrol repo-map --areas-file` が bulk 処理する。

---

## フェーズ2: patrol_score 計算と area 選定

各区画に以下のスコアを付与する。

```text
patrol_score =
    risk_score
  + stale_score             (--stale で重み 1.5x)
  + churn_score
  + complexity_score
  + incident_score
  - recently_scanned_penalty
  + starvation_bonus        (lock-in 解消 + 数ヶ月 floor、wave-03b 追加)
  + jitter                  (random-seed で再現可)
```

各 component (risk_score / stale_score / churn_score / complexity_score / incident_score /
recently_scanned_penalty・starvation_bonus / jitter) の算出式・上限値・実装詳細注記は
`references/patrol-score-formulas.md` を参照する (**area 選定理由を人間に説明する必要が生じたとき、
または score の内訳を検証したいときのみ読む** — 通常の巡回主経路では `op patrol score --json` /
`op patrol repo-map` の出力をそのまま使えば足り、算出式を毎回引く必要はない)。

### 暫定 plan モード (`--dry-run` かつ gh auth なし)

- Ledger を読まない
- `incident_score = 0`
- `recently_scanned_penalty = 0`
- repo map と静的 score (risk / stale / churn / complexity / jitter) のみで plan 作成
- 提示時に「**ledger 未参照の暫定 plan**」と必ず明記する

### area 選定ロジック

```text
1. 全区画の patrol_score を計算
2. --area 指定があれば該当 area を必ず candidates に含める (top 固定)
3. budget に応じて上位 N 区画を選定:
     small  → 1〜2 area
     medium → 2〜3 area
     large  → 4〜6 area
4. 選定した area の合計推定コストを試算 (expert 数 × 並列係数) し、過大なら 1 area 削る
```

選定理由を必ず記録 (フェーズ3 の plan に含める)。

---

## フェーズ3: patrol plan 提示

選定した area・呼ぶ expert・理由・除外した area を提示する。

```
## op-patrol plan (run-2026-05-03-001)

budget: medium
random-seed: (auto)
patrol-ledger: #42 (前回 run-2026-04-01-001 / state_rev 41)

### 今回巡回する area (3 件)

| # | area                                       | score | experts                              | 主な理由                                       |
|---|--------------------------------------------|-------|--------------------------------------|----------------------------------------------|
| 1 | src-tauri/src/commands/export              | 94    | security-expert, debug-expert            | file-io + ipc + 前回巡回から62日              |
| 2 | src-tauri/src/jobs                         | 86    | debug-expert, optimize, refactor         | queue + 90日で変更8回                          |
| 3 | apps/desktop/src/features/job-board        | 72    | ux-ui-audit-expert, designer-expert, debug-expert | 主要導線 + UI変更が直近2週間に集中             |

### 今回除外した上位候補 (参考)

| area                                | score | 除外理由                       |
|-------------------------------------|-------|-------------------------------|
| crates/job_queue                    | 70    | 7日前に巡回済み (recently_scanned) |
| src-tauri/src/auth                  | 68    | budget 超過、次回優先               |

### 推定コスト
- 並列 spawn: 8 expert (3 area)
- 想定時間: 6〜10 分
- Issue 起票上限: Critical/High のみ

この plan で audit を開始しますか?
1. このまま実行
2. area を選択 (例: 1,3)
3. budget を変更 (small/medium/large)
4. キャンセル
```

`--dry-run` の場合はここで停止。
`--auto` の場合はユーザー承認をスキップして即実行。

---

## フェーズ4: expert 並列 spawn (read-only audit)

`_shared/expert-spawn.md` の **パターン1 (scan 用)** に従う。
全 expert を呼ばない。area の性質に応じて 1〜3 expert に絞る。

### area → expert マッピング

| area の性質 | 呼ぶ expert |
|------------|-------------|
| file-io / path / export / import / backup | `security-expert` + `debug-expert` |
| queue / scheduler / worker / job | `debug-expert` + `optimize-expert` + `refactor-expert` |
| Tauri command / IPC 境界 | `security-expert` + `debug-expert` + `ux-ui-audit-expert` + `feature-expert` |
| auth / permission / capability | `security-expert` + `debug-expert` |
| db / migration / schema | `security-expert` + `debug-expert` + `refactor-expert` |
| ext-cmd / subprocess | `security-expert` + `debug-expert` |
| **UI feature (Vue / Flutter component)** | `ux-ui-audit-expert` + `designer-expert` + `debug-expert` (使いやすさ + 美しさ並走) |
| **theme / token / design-system 中央定義** | `designer-expert` + `refactor-expert` (token 体系の整合性確認) |
| **共通 component (Button / Dialog / Form 等)** | `designer-expert` + `ux-ui-audit-expert` + `feature-expert` (silent fork + design 不統一) |
| schema / DTO / API boundary | `debug-expert` + `refactor-expert` + `feature-expert` |
| tests / spec / e2e / fixture / mock / coverage 設定 | `test-expert` + `debug-expert` |
| snapshot / golden / visual regression | `test-expert` + `ux-ui-audit-expert` + `designer-expert` |
| CI / workflow / test runner 設定 | `test-expert` + `debug-expert` |
| flaky 履歴 / skip 多発 / false pass 疑い | `test-expert` |
| 古い巨大 module (stale + complexity 高) | `refactor-expert` + `debug-expert` + `feature-expert` |
| **新規追加 module / 短い history / 高 churn** | `feature-expert` + `debug-expert` (silent fork / pattern deviation 兆候) |
| **同種機能が複数あり実装パターンに揺れ** | `feature-expert` + `refactor-expert` (silent fork / wrapper bypass 兆候) |
| 上記に該当しない汎用 area | `debug-expert` + `refactor-expert` |

#### UI 系 area での ux-ui-audit / designer 併走優先順位

budget が制約されている場合、UI 系 area では以下の優先順位で expert を絞る:

| budget | UI feature area | theme / token area | 共通 component area |
|--------|----------------|---------------------|---------------------|
| small (1〜2 expert) | `ux-ui-audit-expert` のみ (使いやすさ最優先) | `designer-expert` のみ | `designer-expert` のみ |
| medium (2〜3 expert) | `ux-ui-audit-expert` + `designer-expert` | `designer-expert` + `refactor-expert` | `designer-expert` + `ux-ui-audit-expert` |
| large (3 expert+) | 上記 + `debug-expert` / `feature-expert` | 上記 + `feature-expert` | 上記 + `feature-expert` |

> **使いやすさが常に優先される原則**: 主要導線 area (login / 一覧 / 申込 / 提出 等) は budget=small でも `ux-ui-audit-expert` を必ず採用する。
> design system 横断 area (theme / token 定義) は逆に `designer-expert` を必ず採用する。

**feature-expert を呼ぶ典型 suspicion**: `silent_fork` / `wrapper_bypass` / `pattern_deviation` / `missing_error_path` / `spec_divergence` / `stale_todo`。
新規追加 module や複数同種機能のある area は silent fork の温床なので、IPC 境界 / UI feature / schema 境界で feature-expert を併走させる。

### op-patrol-audit Workflow 呼び出し

controller は area→expert マッピングで確定した「各区画 × 1〜3 expert」を **region オブジェクトの配列**にまとめ、
各 expert の model を `model-selection.md §5.2` (`area.audit_model`: single/typical→sonnet, complex/critical→opus) で
確定して `op-patrol-audit` workflow へ args 注入して呼ぶ。spawn prompt 本文・scan-finding schema・refute verdict schema は
`op-patrol-audit.js` (`buildAuditPrompt` / `scanFindingSchema` / `refuteVerdictSchema`) が正本で、本 SKILL.md では重複保持しない。

```
// today は controller が `date -u +%F` で確定する (agent 側 date 実行禁止 = F2 対策)。
// regions は フェーズ2-3 で確定した選定区画。expert_list は area→expert マッピング + installed check 通過後の list。
const auditOut = await Workflow({
  name: "op-patrol-audit",
  args: {
    today: "<YYYY-MM-DD>",                 // date -u +%F
    run_id: "<run-YYYY-MM-DD-NNN>",
    regions: [
      {
        id: "<region 短縮 id (例: export)>",
        area: "<area path (例: src-tauri/src/commands/export)>",
        risk_score: <patrol_score の risk 成分 (任意、audit_report 用)>,
        stale_score: <stale 成分 (任意)>,
        last_scanned_at: "<area_state の RFC3339 or null (初回)>",
        selection_reason: "<選定理由 1-2 行>",
        expert_list: [ { name: "<expert-name>", model: "<area.audit_model 確定値>" } /* , 1〜3 件 */ ],
      },
      /* , ... 選定した全 region */
    ],
  },
});
// auditOut.result.regions[] = { region_id, area, findings:[canonical scan-finding + detected_by + finding_ref],
//   verdicts:[refute verdict], audit_report:{ findings_count / critical_count / high_count / refuted_count ... } }
// auditOut.result.summary  = 全 region 合計 (regions_count / findings_total / critical_total / high_total / refuted_total)
```

戻り値の barrier 挙動 (region × expert を flat 展開し 16-cap 透過キューイング) と `.result.*` unwrap 規約は
`_shared/workflow-calling.md` **§2** が正本 (本 SKILL.md では複製しない)。上記コードの `auditOut.result.regions` /
`auditOut.result.summary` がその実体。

installed check (フェーズ3 / `op core registry-verify`) で除外した planned/未登録 expert を `expert_list` に
含めない・最終報告サマリへ併記する silent 除外禁止規約は `_shared/workflow-calling.md` **§3** が正本。

> **Patrol Finding Policy / canonical schema の正本同期**: `buildAuditPrompt` は後述の Patrol Finding Policy と
> recommended_runner / post_check_expert 規則を inline で埋め込む (workflow spawn された agent は本 SKILL.md を
> 直接読めないため)。両者の drift を避けるため、Patrol Finding Policy を変更したら `op-patrol-audit.js` の
> `buildAuditPrompt` も同期すること。

---

## Patrol Finding Policy (op-scan より厳しい)

巡回エージェントは指摘ノイズを生みやすい。op-patrol では以下を **完全禁止**:

| 禁止 | 理由 |
|------|------|
| 好みのリファクタ提案 | 区画選定が agent 主導なので、好みノイズが膨らむと Issue Tracker を汚す |
| 命名・スタイルの好み | 巡回で命名指摘を作っても優先度が判断不能 |
| 将来不安だけの指摘 | 到達経路・影響範囲が示せないなら起票しない |
| Medium / Low の起票 | severity-rubric の Critical / High 定義を厳格適用 |
| 根拠の薄いセキュリティ指摘 | security が「あるかも」を量産すると noise の源になる |
| 全体設計の大改修提案 | 巡回スコープ外。op-scan で明示要請されてから |
| 未読箇所の推測指摘 | 警備員は見たものだけ報告する |

許可 (Critical/High に限り):

- データ消失・データ破壊への到達経路
- 認証 / 権限 / パス検証の明確な抜け
- 確実に再現するクラッシュ・無限ループ
- 観測可能な race condition
- ファイル上書き事故・任意 IO
- queue 詰まり・dead worker
- IPC / Tauri command 境界の入力検証漏れ
- 主要導線を完全に塞ぐ UX 障害
- 構造的 false pass を生むテスト
- design token bypass / 共通 component bypass の**蔓延** (画面横断で観測可能、theme 切替を物理的に不可能にしているレベル)
- 同一用途 UI が**複数実装に分裂しユーザーに同じ操作と認識されない** (操作ミスの実害が観測可能)

### designer-expert への追加 Patrol Policy

`designer-expert` は patrol で特にノイズを生みやすいため、以下を**完全禁止**:

- 「もっとおしゃれにできる」「もう少し垢抜けさせたい」(主観・好み)
- 「単発の余白が 2px ずれている」(影響が観測できない単発)
- 既存 design system が**未定義な領域**での主観提案 (定義がないなら破綻ではない)
- 「将来こうなったらおしゃれ」(観測事実 + 影響経路がない)
- ux-ui-audit の領域 (使いやすさ・必須 state・a11y) への侵食 (責務違反)

許可されるのは「**観測可能な design system 破綻**」のみ。詳細は `agents/designer-expert.md` の Scan Mode / patrol モード節を参照。

op-run が patrol 起票 Issue を実装するため、ノイズ起票は下流のコスト全てを汚す。
**「報告しない判断」を恐れない。** 警備員は「異常なし」を報告できる。

---

## フェーズ4.5: refute 適用 (起票前 false-positive gate、C3)

/**
 * 機能概要: `op-patrol-audit` workflow の refute stage が返した各 region の `verdicts` を、
 *           フェーズ5 (統合・dedup) / フェーズ5.5 (enrichment) に入る前に finding 集合へ適用する。
 * 作成意図: 偽陽性を Patrol Finding Policy / severity gate / dedup / enrichment (最大 8 spawn/Issue) の
 *           **前** で潰す (CLAUDE.md 不変則8「起票前 review」と同じ哲学、C2 op-scan と対称)。
 * 注意点: refute は **finding ごとの偽陽性除去** であり、enrichment の cross-review
 *         (issue_draft 全体の品質 review) とは別レイヤー (重複実装しない)。region isolation は
 *         `finding_ref` (`<region_id>:<expert>#<idx>`) でデータ上保持される。
 */

`auditOut.result.regions[].verdicts` を、同じ region の `findings` に `finding_ref` で突合して適用する。

### verdict 適用順 (逆転不可)

`refute verdict 適用 → severity gate → 統合(フェーズ5) → dedup(フェーズ5) → enrichment(フェーズ5.5) → 起票(フェーズ6) → Ledger 更新(フェーズ7)` の順。
**downgrade が severity を変えるため severity gate は refute の後でなければならない** (逆順は不可)。

| verdict | 適用 |
|---------|------|
| `confirmed` | severity 不変で通過 |
| `downgrade` | `finding.severity = verdict.confirmed_severity` で上書き → 後段 severity gate で Critical/High 外なら drop |
| `refuted` | finding を **drop** (統合・dedup・enrichment に渡さない) |

drop / downgrade-drop された finding は **フェーズ7 完了報告に「refute で偽陽性/過大判定」+ `evidence_excerpt` を必ず列挙**
する (silent drop 禁止)。`manual_review_bucket` は偽陽性で汚さない。ただし downgrade で
`evidence_grade_observed: requires_runtime` になった finding は既存規約通り `manual_review_bucket` に退避する。

### trust model (op-scan フェーズ1.5 と同一)

trust model の 4 層定義は `skills/op-scan/SKILL.md` の「trust model」節を参照 (正本)。
op-patrol 固有の追記:
> **region isolation**: verdict は `finding_ref` の region prefix で該当 region にのみ適用される (別 region への混線なし)。

### refute が走る / 走らない経路

- **通常巡回 (デフォルト)**: 走る。`--auto` でも走る (`--auto` は人間承認 skip であって品質 gate skip ではない。
  refute で drop された finding は偽陽性のため `manual_review_bucket` に入れない)。
- **`--dry-run` / `--compact-ledger`**: audit fan-out に到達しない (前者は フェーズ3 plan 停止、後者は Ledger 圧縮のみ) ため refute も走らない。

> refute の opt-out flag (`--no-refute`) は v1 では未実装。over-refute が dogfooding で観測されたら follow-up で additive 追加する
> (security 非対称 + drop 可視化で over-refute を当面緩和する)。

---

## フェーズ5: 結果統合・fingerprint 重複除外

### 5-1. 全 expert の出力を統合

各 expert が返した JSON 配列をマージ。重複候補をマージするキー:

- 同一ファイル + 行範囲が ±5 行以内
- title の意味的類似 (キーワード一致)

重複は深刻度の高い方を採用、別 expert の指摘は本文に補足として追加。

### 5-2. fingerprint 生成 + 重複除外

`_shared/dedup-policy.md` の **fingerprint 生成仕様** と **既存 Issue との重複除外** に従う
(op-scan と共通仕様)。スキップ件数は run コメントの `skipped_duplicates` に記録。

### 5-3. バッチ起票判定 (bulk_group)

`bulk_group` が 5 件以上同一なら、`_shared/pr-templates.md` のバッチ Issue テンプレで 1 Issue 化。
patrol で頻出するのは `security` の `unsafe-path-handling` 等。

ただし `domain: "optimize"` の検出は **原則バッチ化しない** (1 Issue = 1 bottleneck 原則、Before/After benchmark を因果評価できなくなるため)。例外条件は op-scan の「domain = optimize の特例」と同じ (同一関数 / 同一 benchmark / 同質改善 / risk_level=low)。

`domain: "refactor"` の検出も **Phase 1 では batch 全面禁止** (1 finding = 1 Issue)。
理由は op-scan の「domain = refactor の特例」と同じ (rollback unit / 責務境界が
bulk_group カテゴリ単位では揃わないため、revert 不能を生む)。
Phase 2 以降で `root_path` / `rollback_unit` / `verification_key` を finding schema に
追加した上で、それらが完全一致する場合のみ batch 化する設計を検討する。

### 5-4. 並び替え

優先順位:
1. severity (critical > high)
2. expert (security > debug > refactor > optimize > ux-ui > design > feature > test)
3. area の patrol_score 降順
4. ファイル名昇順

---

## フェーズ5.5: Issue draft enrichment (起票前 review)

/**
 * 機能概要: フェーズ5 で fingerprint dedup 済みの finding を `issue_draft` に変換し、
 *           `_shared/issue-enrichment.md (>=2)` 経由で Design Plan 生成 + gate +
 *           cross-review を通してから `op issue create` に渡す。op-scan Phase 4 と
 *           同 pattern (proposal 2026-05-10-issue-enrichment-and-op-plan.md section 7 Phase 5)。
 * 作成意図: op-run が patrol 起票 Issue を実装するため、起票時点での品質ゲートを
 *           Single Canonical Source Rule で `_shared/issue-enrichment.md` に集約する。
 *           UI 影響 finding には Design Plan を付け、cross-review で検出 expert 以外の
 *           関連 expert にも review させてから起票することで silent な品質劣化を防ぐ。
 * 注意点: enrichment 完了 → 起票 (フェーズ6) → Ledger 更新 (フェーズ7) の順序を必ず守る。
 *         逆順 (Ledger 先 → 起票後) では起票失敗時に Ledger が誤情報を持つ。
 *         op-scan と異なり、Patrol Finding Policy により Medium/Low は Issue 化しない
 *         (本フェーズで返ってくる `post_create_comments` は op-patrol では空配列扱い)。
 */

フェーズ5 で重複除外・並び替えまで終わった起票候補 (Critical/High のみ) を、`op issue create` する前に
`_shared/issue-enrichment.md (>=2)` の enrichment 層に通す。enrichment は **起票前 (pre-create) review**
であり、GitHub に立った後の Issue にコメントするモードではない (proposal section 3.7.1 不変則)。

> **C4 (ADR-0009 Phase C)**: enrichment の Design Plan 生成→gate / cross-review は内部で
> `workflows/op-enrichment.js` workflow を使う。controller は `issue-enrichment.md` §7.6 の順序で
> auto 解決 → `Workflow({name:'op-enrichment'})` 呼出 → §8 受領 → collision gate → 直列起票 を行う
> (collision gate は controller 保持)。フェーズ5.5 → 6 (起票) → 7 (Ledger) の順序は不変。
>
> **ADR-0012 (design 多役)**: pre-step で controller は `design_depth` / `design_roles[]` / `foundation_exists` も
> 解決し注入する (正本 `issue-enrichment.md` §4 / §7.6、複製しない)。op-patrol は **thin auto caller**: `--auto` 経路では
> `auto_full_downgrade_to_light` (op-config §9) で full→light に丸め、foundation-build / design-spike は
> 起票せず `manual_review_bucket` に退避する (op-scan と同じ非対称)。workflow 側の Design Plan 生成は多役 pipeline。

### 5.5-1. enrichment への入力

各 finding ごとに enrichment の `input contract` を組み立てる:

```json
{
  "issue_draft": {
    "title": "<finding.title>",
    "body": "<指示書フル版 Markdown (pr-templates.md 準拠、フェーズ6 で本文に埋める marker 含む)>",
    "domain": "<finding.domain>",
    "recommended_runner": "<finding.recommended_runner>",
    "scope_files": "<finding.affected_paths 等>",
    "new_files": "<finding が新規追加を含むなら>",
    "severity": "<critical | high>",
    "fingerprint": "<フェーズ5-2 で生成した fingerprint>"
  },
  "options": {
    "with_design_plan": "auto",
    "with_cross_review": "<--with-cross-review があれば true、なければ auto (severity high+ で自動)>",
    "max_review_loops": 2,
    "strict": "<--strict-enrichment があれば true、なければ false>"
  }
}
```

呼び出し詳細・Phase 1〜5 (UI 影響判定 / Design Plan 生成 / gate / cross-review / 統合) の各挙動は
`_shared/issue-enrichment.md` を正本とする。本 SKILL.md は呼び出し契約のみ持つ。

### 5.5-2. flag による挙動切り替え

| flag | 既定値 | 効果 (op-scan と同じ意味、本 SKILL での挙動) |
|------|-------|---------------------------------------------|
| (省略時) | enrichment ON | enrichment 層を呼ぶ。`with_cross_review` は severity high+ で auto |
| `--no-enrichment` | OFF に切替 | enrichment 層を完全に skip し、フェーズ5 の出力をそのまま フェーズ6 に渡す (旧挙動互換、bump 前の patrol を再現したい場合のみ) |
| `--strict-enrichment` | strict | Design Plan spawn 失敗 / gate 失敗 / cross-review 一部失敗 を継続せず即中断扱いにする (`_shared/issue-enrichment.md` の Failure modes 表参照) |
| `--with-cross-review` | 強制 ON | severity Critical 以下 (= High 未満) でも cross-review を実行する。本 SKILL では起票対象が Critical/High しかないため事実上「auto と同じ」となるが、将来 severity 閾値を下げた場合に揃える目的で flag は受け付ける |

### 5.5-3. enrichment 結果の処理

enrichment 層は finding ごとに `output contract` を返す:

- `result: "enriched"` — 起票候補に採用。`enriched_issue.title` / `enriched_issue.body` /
  `enriched_issue.labels_to_add` でフェーズ6 の起票内容を上書きする
- `result: "blocked"` — 起票しない。`escalation_report` を最終報告 (フェーズ7-5) の警告節に列挙し、
  `manual_review_bucket` に退避する (proposal section 3.7.1 の `--auto` block 不変則)。
  `--auto` モードでも block を素通しせず必ず退避する (= 人間承認をスキップする機構ではなく、品質ゲート自体は維持)

`enriched_issue.body` 冒頭には enrichment 層が以下の hidden marker を埋める
(`_shared/issue-enrichment.md` の Hidden marker 節):

```html
<!-- op-enriched: true -->
<!-- op-enrichment-loops: <N> -->
<!-- op-enrichment-design-plan: generated | skipped | failed | blocked -->
<!-- op-enrichment-cross-review: passed | passed_with_changes | blocked | skipped -->
```

op-patrol 固有の hidden marker (`op-source: op-patrol` / `op-area` / `op-run-id` 等、フェーズ6 が埋める
routing metadata) は **enrichment marker と共存** する。enrichment 層は op-patrol 固有 marker を
書き換えない契約 (本 SKILL のフェーズ6 が責任を持つ)。

### 5.5-4. post_create_comments の扱い (op-scan との差分)

enrichment 層は Medium/Low 指摘を `post_create_comments` 配列で返し、op-scan ではこれを `op issue create`
直後にコメント投稿する設計だが、op-patrol は **Patrol Finding Policy** により Medium/Low 自体を起票対象に
含めない厳格基準を取っている。

> 注: op-scan と異なり、op-patrol は Patrol Finding Policy により Medium/Low を Issue 化しない。
> `post_create_comments` は op-patrol では空配列として扱い、投稿しない。

このため、enrichment 層が `post_create_comments` を返してきても op-patrol は **無視する**
(配列が空でなくても投稿しない)。`post_create_comments` を投稿すると「起票しない Medium/Low」を
コメント経由で間接的に Issue Tracker に流し込むことになり、Patrol Finding Policy の前提
(警備員は「異常なし」を報告できる / 「報告しない判断」を恐れない) を実質的に破壊するため。

将来 enrichment 層 schema が Medium/Low 起票を強制する方向に動いた場合は、op-patrol 側で
明示的に弾く実装をここで担保する (上流 schema 変更で本節を見直す)。

### 5.5-5. enrichment 完了 → 起票 → Ledger 更新の順序 (厳守)

```text
フェーズ5   : 結果統合・fingerprint 重複除外
フェーズ5.5 : Issue draft enrichment (本フェーズ)
フェーズ6   : op issue create (Critical/High のみ、enrichment 通過分のみ)
フェーズ7   : Patrol Ledger 更新 (新規 Issue 番号を run コメントに記録、state (body) 更新)
```

この順序を逆転させない (= Ledger 先・起票後にしない)。理由:

- 起票失敗時に Ledger が「起票したつもり」の誤情報を持ち、次回巡回で `seen_count` が膨らむ
- enrichment block で起票キャンセルされた finding が Ledger 上だけ「巡回済 + 検出あり」になり、
  area_state の再現性が崩れる

`--dry-run` はフェーズ3 (patrol plan 提示) で停止するため、本フェーズ (5.5) には到達しない
(audit 自体を走らせないので enrichment spawn コストも発生しない)。詳細な enrichment Cost-control は
`_shared/issue-enrichment.md` の Cost-control 節を参照。

---

## フェーズ6: ユーザー承認 + Issue 起票

フェーズ5.5 で enrichment 通過した finding (`result == "enriched"`) のみを本フェーズの起票候補とする。
enrichment block 分は `manual_review_bucket` に退避済みなので、本フェーズでは扱わない (フェーズ7-5 で
警告として列挙のみ)。`--no-enrichment` で enrichment skip した場合は、フェーズ5 出力をそのまま
起票候補として扱う (旧挙動)。

起票時の本文 (`enriched_issue.body` または `--no-enrichment` 時は フェーズ5 出力本文) には、後述の
op-patrol 固有 hidden marker (`op-source: op-patrol` / `op-area` / `op-run-id` / `op-run-expert` /
`op-post-check-expert` 等) を冒頭に必ず埋める。enrichment 層は op-patrol 固有 marker を書き換えない
契約のため、両者は共存する。

### 対話モード (デフォルト)

```
## op-patrol 巡回結果 (run-2026-05-03-001)

### サマリ
| area                                  | Critical | High | 既存重複 |
|---------------------------------------|----------|------|---------|
| src-tauri/src/commands/export         | 1        | 1    | 1       |
| src-tauri/src/jobs                    | 0        | 2    | 0       |
| apps/desktop/src/features/job-board   | 0        | 1    | 1       |
| **合計**                              | **1**    | **4**| **2**   |

### 起票候補 (5 件)
| # | severity | expert    | area              | title                              |
|---|----------|-----------|-------------------|------------------------------------|
| 1 | critical | security  | commands/export   | 任意ファイル書き込み (パス検証なし) |
| 2 | high     | debug     | jobs              | worker race による job 重複実行    |
| ...

### 既存 Issue 重複でスキップ (2 件)
- #112 と fingerprint 一致: jobs の queue 詰まり懸念
- ...

### 要確認 (--auto では起票されない、対話で判断)
- evidence_grade=requires_runtime の検出 1 件
  - apps/desktop/src/features/job-board: タブ切替時の状態漏れ疑い

起票しますか?
1. すべて起票
2. Critical のみ
3. 番号で個別選択 (例: 1,3,5)
4. キャンセル (Ledger は更新する)
```

### 自動モード (`--auto`)

ユーザー承認をスキップ。本ドキュメント上部の **--auto policy** を満たす検出のみ起票する。
`requires_runtime` や fingerprint 重複は自動的に除外される。

`--auto` でも **enrichment 層 (フェーズ5.5) はスキップされない**。enrichment block 判定の finding は
`op issue create` せず `manual_review_bucket` に退避し、フェーズ7-5 の警告節に列挙する
(proposal section 3.7.1 不変則: `--auto` は人間承認をスキップする機構であり、品質ゲートそのものを
素通しさせる機構ではない)。

### Issue 本文テンプレ (op-scan と共通)

`_shared/pr-templates.md` の **指示書フル版** を必須とする。
op-run がこの Issue を実装するため、scope_in / scope_out / verification_steps / success_criteria / gotchas を欠かしてはいけない。

本文の冒頭に **必ず** hidden marker を埋め込む。marker 名と基本意味の正本は
`skills/_shared/markers/labels-and-markers.md` にあり、以下に示すのは op-patrol 起票時の **routing
metadata 例**である (spawn authorization ではない)。`op-post-check-expert` も**必須**で、
post-check が不要なドメイン (UI 影響なしの debug / refactor / optimize / test / feature) でも
**marker 自体は出力し、値を `null` にする**。値の省略は許さない (op-run の dispatcher が「未解決」と「明示的 skip」を区別できなくなる):

```markdown
<!-- op-fingerprint: security:path-traversal-in-export:src-tauri/src/commands/export.rs:export_report -->
<!-- op-source: op-patrol -->
<!-- op-area: src-tauri/src/commands/export -->
<!-- op-run-id: run-2026-05-03-001 -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature | env> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert (canonical schema の recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | env-expert | null> -->
```

**finding_type が `architecture_debt` / `staged_refactor` / `needs_spec_decision` の場合**、
上記に加えて debt 追跡用の補助 marker を必ず埋める (op-patrol の既存 Issue 検索の優先 1):

```markdown
<!-- op-refactor-debt-key: refactor:<bulk_group>:<root_path>:<symbol_or_boundary> -->
```

詳細は `_shared/dedup-policy.md` の「architecture_debt 補助 marker」節を参照。

domain ごとの marker パターン (`op-run-expert` / `op-post-check-expert` の標準値) は `skills/op-scan/references/routing-and-marker-reference.md` §domain-marker-patterns を canonical source として参照する (Single Canonical Source Rule, Issue #318 Stage 2 完了)。

> feature-expert が apply するが、UI 状態 / a11y / 復帰可能性 / 画面遷移に影響する場合は、
> post-check に `ux-ui-audit-expert` を必ず指定する (silent な UX 退化防止)。

ラベルは以下を必ず付与:
- `auto-report` (op-scan / op-patrol 共通)
- `patrol` (op-patrol で起票したことを示す)
- `severity:critical` または `severity:high`
- `area:<area path の短縮形>` (例: `area:export`)
- `pro-<expert>-expert` ラベル (apply 担当に対応):
  - UX/UI 指摘: `pro-designer-expert` + `pro-ux-ui-audit-expert` の両方
  - security 指摘: 基本 `pro-security-expert` 1 つ。op-run の判定優先順位 1-8 で apply を debug-expert に回す場合は `pro-debug-expert` + `pro-security-expert` の両方
  - **feature 指摘で UI 状態 / a11y / 復帰可能性 / 画面遷移に影響する場合: `pro-feature-expert` + `pro-ux-ui-audit-expert` の両方** (silent な UX 退化防止)
  - **env 指摘: `pro-env-expert`** (env-expert は planned。apply 担当の解決は op-run が `_shared/runtime-contract.md` / `_shared/planned-experts.md` に従って独立に行う。op-patrol はラベル / marker を routing metadata として残すのみ)

バッチ Issue は `batch` ラベルを追加。

> **expert ラベルの完全形式**: `pro-debug-expert` / `pro-refactor-expert` / `pro-optimize-expert` /
> `pro-security-expert` / `pro-ux-ui-audit-expert` / `pro-designer-expert` / `pro-test-expert` /
> `pro-feature-expert` / `pro-env-expert`。短縮形 (`pro-debug`, `pro-designer` 等) は使わない。

#### domain=refactor 固有のラベル付与ルール (finding_type / blocking / human_decision に応じて)

op-patrol が refactor finding を起票するときは、`skills/op-scan/SKILL.md` §「domain=refactor 固有の
ラベル付与ルール」の判定表 (`needs:triage` の op-patrol 行含む) と **完全一致** で適用する
(重複定義を避けるため、判定表は op-scan を正本とする)。

`op:architecture-debt` / `op:staged-refactor` / `needs:spec-decision` の 3 ラベルは
**op-patrol 自身の debt 系 finding 既存 Issue 検索の正本ラベル群**
(本 SKILL のフェーズ5-2 と「architecture_debt の追跡方式」節)。`finding_type` に対応する
ラベルを新規起票時に必ず付与しないと、次回 patrol で既存 Issue を取り逃がし
`seen_count` / `risk_trend` が更新されなくなる。

#### Marker Publish Validate (起票直前 fail-fast、C3 で有効化)

各 `op issue create` の **直前** に、`_shared/expert-spawn.md` の **Marker Publish Validate 節** (2段
validate 手順の正本、内容はここに複製しない) を通す。`source-hint` は `issue-body` を使う (BODY_FILE = 起票する
Issue 本文、hidden marker 埋め込み済・enrichment 反映後)。block された draft は起票せず
manual_review_bucket / escalation に回す (対話モードはユーザー提示で停止、`--auto` は退避、フェーズ5.5 の block
退避と同列)。直列 `op issue create` (1 draft = 1 invocation、並列化禁止) はフェーズ6 / フェーズ7 の起票規約を踏襲する。

> **`||` で握り潰さない**: lint decision は明示確認してから `op issue create` する
> (memory `feedback_op_review_meta_reviewer_field_required`: `op ... || fallback` だと block でも投稿が通ってしまう)。

---

## フェーズ7: Patrol Ledger 更新 + 必要に応じて compact + 完了報告

### 7-1. Ledger Issue が未作成なら作成

フェーズ0 で「未作成」と判定していた場合、ここで `op patrol ledger init` で作成する。
**冪等**: 内部で op-state ラベル検索を行い、既存 Ledger Issue があれば作成せず skip する
(`op-patrol` / `op-state` / `do-not-close` ラベルは primitive が付与する)。body は v2 skeleton
(state 文書) を CLI が内部生成する (`--body-file` のような手書き body 引数は v2 に存在しない)。

```bash
# Patrol Ledger Issue を初回作成 (冪等)。
op patrol ledger init \
  --title "[op-patrol] 巡回監査ステート / Patrol Ledger" \
  --json
```

mcp channel では既存 Ledger 探索に `--input-json <素材>` が必須 (label:op-state の
`mcp__github__search_issues` 生素材)。新規作成時は `op issue create` の create call-spec を emit する
(`github-channel.md` §3-§4 で完遂)。

`--dry-run` ではここに到達しないため作成されない。

### 7-2. run コメント追加 (監査ログ)

run コメントの JSON 構造と field 単位 schema は `~/.claude/skills/_shared/markers/patrol-markers.md` の
「`<!-- op-patrol-run: <run-id> -->` block schema」節を SSoT として参照する。**機械は二度と読まない**
(ADR-0026)。

**第一推奨: `op patrol ledger push --run-comment` の正規経路** を使う。
controller が run 内容 (巡回 area / 使用 expert / 作成 Issue / budget) をフラグで渡すと、
CLI が `op-patrol-run` block body を自動構築して post する。手書き JSON 組み立ては不要:

```bash
# run コメント post (正規経路、--dry-run で body 確認後に本番実行)
# 各フラグ名は CLI 実装 (op-tools/crates/op/src/commands/patrol_ledger.rs) と 1 対 1 で一致
op patrol ledger push \
  --issue "$LEDGER_ISSUE" \
  --run-comment \
  --run-id "run-$(date +%Y-%m-%d)-001" \
  --selected-area "skills/op-patrol" \
  --selected-area "skills/op-scan" \
  --experts-used "refactor-expert" \
  --experts-used "security-expert" \
  --created-issue 641 \
  --created-issue 649 \
  --issues-created-total 2 \
  --skipped-duplicates 0 \
  --budget medium \
  [--dry-run]
```

> **`--updated-area` (7-3 の state 更新 push 専用) と `--selected-area` (run-comment 専用) は
> 用途が異なる — 取り違え注意**:
> - `--run-comment` モードでは **`--selected-area` を使う** (巡回した area。繰り返し可)。
>   `--updated-area` / `--previous-state` は run-comment モードでは無視される (効果を持たない)
>   (`--run-id` と `--selected-area` 系フラグのみが有効)。
> - `--run-id` は state 更新 push (7-3) と run-comment (本節) で共通のフラグ。`run-<date>-NNN` 形式で渡す。
> - フラグ名は `--created-issue` (繰り返し可) であり `--issue-created` ではない。CLI 実装と grep 照合して drift を防ぐ。

> **mcp channel**: 本節の post は既存の `op issue comment` call-spec を emit する。司令官は
> `github-channel.md` §3-§4 の protocol (verbatim 実行 → read-back → ingest) で完遂する。

緊急 fallback として、CLI が使えない場合のみ手書き JSON を `op issue comment` で post してよい
(通常は上の正規経路を使う。`--body-file` 経由で body を渡す = subshell 変数空問題対策):

```bash
# run コメント手動 post (緊急 fallback、通常は上の --run-comment を使う)
COMMENT_BODY=$(mktemp)
cat > "$COMMENT_BODY" << 'RUN_COMMENT'
<run コメント本文 (patrol-markers.md 準拠)>
RUN_COMMENT
op issue comment "$LEDGER_ISSUE" --body-file "$COMMENT_BODY"
rm -f "$COMMENT_BODY"
```

### 7-3. state (body) 更新 push

v2 (ADR-0026) では state が body 1 箇所に一本化されたため、**巡回のたびに state 更新 push を行う**
(v1 の「30 件溜まったら checkpoint コメントで圧縮」という条件付き compact は廃止 — body は常に単一
JSON であり run を重ねても肥大化しないため、圧縮そのものが不要になった)。

`op patrol ledger push` (`--run-comment` なし) で area_state / state_rev / last_run_id を進める:

```bash
# state 更新 push (--dry-run で body 確認後に本番実行)
op patrol ledger push \
  --issue "$LEDGER_ISSUE" \
  --run-id "run-$(date +%Y-%m-%d)-001" \
  --previous-state /tmp/ledger.json \
  --updated-area "<area>=<RFC3339>" \
  [--dry-run]
```

previous state の `last_run_id` が `--run-id` と一致する場合は no-op (`decision: "warn"`) で終わる
(冪等性、`patrol-markers.md` の「冪等性 / 並行制御」節)。

> **mcp channel**: 本節の push は body 全置換の `op issue edit-body` call-spec を emit する。
> 司令官は `github-channel.md` §3-§4 の protocol で完遂する。

> **`--compact-ledger`** は v1 の「run コメント合成の圧縮」を指す flag だったが、v2 では
> state 復元がコメント合成に依存しなくなったため対象が無い。`--compact-ledger` 実行時も
> 本節の state 更新 push を実施すればよい (audit を伴わない手動更新として扱う)。

### 7-4. ローカルファイルは触らない

- `.op/patrol-state.json` は **作らない・更新しない・削除しない**
- `git add` / `git commit` も行わない
- 旧 ローカル state ファイルが残っていても無視する

### 7-5. 完了報告

```
## op-patrol 完了 (run-2026-05-03-001)

### 巡回 area
- src-tauri/src/commands/export (security + debug)
- src-tauri/src/jobs (debug + optimize + refactor)
- apps/desktop/src/features/job-board (ux + debug)

### 起票結果
| # | Issue | severity | expert    | area              | title |
|---|-------|----------|-----------|-------------------|-------|
| 1 | #125 | critical | security  | commands/export   | 任意ファイル書き込み |
| 2 | #126 | high     | debug     | jobs              | worker race による job 重複 |
| ...

### 統計
- 起票: 5 件 / スキップ (重複): 2 件 / 検出 0 件: 0 area
- refute: confirmed 6 件 / refuted (偽陽性 drop) 2 件 / downgrade 1 件 (`auditOut.result.summary` から集計)
- region audit_report: 各 region の findings_count / critical_count / high_count / refuted_count (workflow 戻り値 `auditOut.result.regions[].audit_report`)
- enrichment: enriched 5 件 / blocked 1 件 (manual_review_bucket 退避) / skipped 0 件
- Patrol Ledger: #42 (run コメント追加 / state (body) 更新: state_rev 41→42)

### refute で偽陽性/過大 drop した検出 (D8、silent drop 禁止)

refute で `refuted` / downgrade-drop された finding を **必ず列挙** する (起票しないが可視化する。`manual_review_bucket` には入れない):

- [refuted] <area> / <expert> / "<finding title>" — evidence_excerpt: `<再 Read した実コード片>` (evidence_location: <file:line-line>)
- [downgrade→drop] <area> / "<title>" — confirmed_severity: medium (Critical/High 外で severity gate 落ち)
- (なければ「なし」)

### 次の巡回候補 (参考)
patrol_score 上位で今回除外した area:
- crates/job_queue (score 70, 7日前巡回済)
- src-tauri/src/auth (score 68, budget 超過)

### 警告
- (なければ「なし」)
- ledger Issue が複数検出された場合は #42, #58 のように列挙
- ledger parse warning が出た場合はその旨
- enrichment block: <finding 概要> (reason: design_plan_block | cross_review_block | max_loops_exceeded、human_action_required: ...) — manual_review_bucket に退避済

次は `/op-run` で起票 Issue を並列実装に進めます。
定期巡回するなら `/schedule` で週次 op-patrol を提案できます。
```

---

## 注意事項

本文で繰り返し明示している原則 (read-only / Critical/High のみ / fingerprint 重複除外 / CLAUDE.md 準拠 / canonical schema / 失敗 expert 続行 / 指示書フル版 等) は省略。以下は誤運用で巡回履歴そのものを破壊する原則のみを残す。

- **Ledger Issue は close しない**: `do-not-close` ラベルで保護、巡回履歴の連続性を守る。Ledger を close すると state の正本が消失する
- **run コメントは原則削除しない**: 監査ログとしての完全性を守る (v2 では state は body 1 箇所に一本化されており、コメント圧縮のための checkpoint 追加は不要)
- **--auto は厳格**: severity + evidence_grade=direct + 完全な記述が揃ったものだけ自動起票。閾値を下げると noise が Ledger に滞留して巡回判断を歪める
- **enrichment → 起票 → Ledger 更新の順序**: フェーズ 5.5 → 6 → 7 を逆順で実行しない。Ledger を先に更新すると起票失敗時に「巡回済 + 検出あり」の誤情報が残り、area_state の再現性が崩れる
- **--auto でも enrichment block は素通ししない**: enrichment は品質ゲート、`--auto` は人間承認スキップ機構。block 判定は `manual_review_bucket` に退避してフェーズ 7-5 警告に列挙する (proposal section 3.7.1 不変則)
- **Patrol Finding Policy と post_create_comments**: enrichment が Medium/Low を `post_create_comments` で返しても op-patrol は投稿しない。op-scan より厳格な Critical/High only 方針を維持する

---

## 想定運用パターン

| 頻度 | コマンド | 想定 |
|------|---------|------|
| 週1回 | `/op-patrol --auto` | 通常巡回。--auto policy 通過分のみ自動起票 |
| 月1回 | `/op-patrol --budget large --stale` | 大型巡回。腐敗領域を集中チェック |
| リリース前 | `/op-patrol --risk file-io,ipc,auth` | 危険境界に絞った巡回 |
| 新人参加時 | `/op-patrol --dry-run --budget large` | repo map と patrol_score を可視化、area の地図として |
| 障害後 | `/op-patrol --area <該当 area>` | 障害領域を強制巡回し横展開バグを検出 |
| 任意 | `/op-patrol --compact-ledger` | audit を伴わず Ledger の state (body) だけ手動更新したい場合 (v2 では checkpoint 圧縮は不要) |

`/schedule` で週次 op-patrol を routine 化することを推奨する。
