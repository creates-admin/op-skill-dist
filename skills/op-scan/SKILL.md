---
name: op-scan
description: デフォルト 6 expert (debug / refactor / optimize / security / ux-ui / design) を並列 spawn して観点別にコードベースを audit し、Critical/High だけを GitHub Issue として起票するスキル。test / feature は --include で追加。--from-issue で人間立て Issue を指示書フル版に正規化する。「スキャン」「op-scan」「監査」「Issue 起票」「正規化」等のキーワードで起動。
---

<!--
schema_version: 3
last_breaking_change: 2026-05-31
notes: 2026-07-29 追記 (ADR-0029 Wave B1) — progressive disclosure 分割。`--from-issue` /
       `--from-merged-pr` モード詳細と routing/marker lookup (Contract / `--domain` alias /
       scope 省略時コスト確認 / domain→marker 表) を references/ 3 ファイルへ無改変移設
       (本文は「いつ読むか」付き pointer 化)。契約内容の変更なしのため schema_version 据え置き。
       2026-07-22 追記 (ADR-0024 Phase 3 第二波) — Cloud (mcp channel) 対応。
       `github-channel.md (>=2)` を pin 追加、dedup array / bulk-group に `--input-json` 併用注記、
       registry-verify の path flag は CLI 自動解決に委譲、`--from-issue` の Issue 取得 / edit-add-label
       に mcp 注記、`--from-merged-pr` は Cloud 非対応の明示 degrade を追加。非破壊 additive のため
       schema_version 据え置き。
       v3 (2026-05-31) — ADR-0009 Phase C / C2 wave。フェーズ1 観点別並列 audit を
       single-message Agent (run_in_background) + Monitor 待ちから Dynamic Workflow
       (`Workflow({name:'op-scan-audit'})`) へ全面移行。あわせて起票前 refute stage
       (新フェーズ1.5、finding ごとの独立 skeptic で偽陽性/severity 過大/起票不適格を反証、
       security は非対称ルール) を同梱。spawn テンプレ本文は workflow の buildAuditPrompt へ
       verbatim 移送、controller 側 Monitor 待ち合わせを廃止 (戻り値が barrier)。
       Marker Publish Validate fail-fast を フェーズ4 起票直前で有効化 (#529 で null block 解消済)。
       フェーズ1 spawn 機構の破壊的変更扱い。詳細は ADR-0009 / 配布は ADR-0010。
       v2 (2026-05-11) — enrichment 統合 (proposal Phase 4)。default 挙動として
       UI 影響あり Issue に Design Plan を付与し、必要に応じて cross-review を行う
       (`_shared/issue-enrichment.md` 参照)。`--no-enrichment` で旧挙動互換、
       `--strict-enrichment` で failure mode を strict、`--with-cross-review` で
       severity Critical 以下でも cross-review 強制実行。`--auto` / `--from-issue`
       経路でも enrichment フェーズ (フェーズ 2-4) が走る (proposal section 3.7.1 不変則)。
       UI 影響あり Issue の default 出力が変わるため破壊的変更扱い。
       v1 (起動時、暗黙) — 初版。観点別並列 spawn + Critical/High Issue 起票 +
       `--from-issue` 正規化 + `--auto` 自動起票 + バッチ Issue 起票判定。
-->

# op-scan: 観点別並列 audit + Issue 起票

/**
 * 機能概要: デフォルト 6 expert (debug / refactor / optimize / security / ux-ui / design) を並列 spawn し、
 *           --include-test / --include-feature / --all-experts で 8 expert まで拡張可能。
 *           Critical/High の問題だけを GitHub Issue として起票する。
 *           --from-issue モードでは既存 Issue を入力に取り、指示書フル版に正規化した派生 Issue を起票する。
 * 作成意図: 旧 pro-debug / pro-refactor 等を観点軸で再編。
 *           並列実行で audit 時間を圧縮、ノイズ抑制で Critical/High のみに絞る。
 *           test / feature は性質が違うため (additive 検出が中心) opt-in に設計。
 *           --from-issue は人間立て Issue / 古い形式 Issue を op-run で実装可能にするための正規化入口。
 *           op-run 側に補完ロジックを内蔵せず、起票責務を op-scan に集約する単一責任分離。
 * 注意点: scan は read-only。Issue 起票はユーザー承認後 (--auto モード除く)。
 *         --auto でも既存 open Issue と重複するものは起票しない。
 *         --from-issue は severity フィルタを無効化する (元 Issue が起票されている時点で意味がある)。
 */

コードベースを並列 audit し、Critical/High の問題を GitHub Issue 化する。
**Issue 起票はユーザー承認後のみ。** scan 自体はコードを変更しない。

---

## Expert Runtime and Routing Metadata Contract (references/ へ分離)

scan-time spawn と Issue routing metadata の責務分離契約 (active expert 限定 spawn / planned expert
spawn 禁止 / hidden marker・ラベル = routing recommendation であって spawn authorization ではない /
review-expert 非 spawn) は `references/routing-and-marker-reference.md`
§Expert Runtime and Routing Metadata Contract へ移設した。詳細契約の正本は従来どおり
`skills/_shared/runtime-contract.md`。

**読むタイミング**: フェーズ1 の installed check で planned / 未登録 expert の扱いを判断するとき、
およびフェーズ4 で hidden marker / ラベルを書き出す前に「spawn authorization と誤読していないか」を
確認するときに、上記 references 節を読む (通常経路でそれ以外の場面では読まなくてよい)。

---

## expert 構成

### デフォルト (6 expert)

不具合・構造・性能・脅威・体験・意匠の検出を司る基本セット:

- `debug-expert` — バグ・エッジケース・例外握りつぶし
- `refactor-expert` — 散乱 token / god function / large file / large component / 責務境界混線 / ディレクトリ構造劣化 / 依存逆流 / 重複ロジック / dead code / architecture debt
- `optimize-expert` — ボトルネック・N+1・メモリリーク
- `security-expert` — 脆弱性・入力検証・認証バイパス・IPC / file IO / shell / capability の深掘り
- `ux-ui-audit-expert` — **使いやすさの番人**: UX 障害パス + 必須 state 欠如 + 復帰不能 + accessibility 違反
- `designer-expert` — **美しさの番人**: design token bypass + 共通 component bypass + visual hierarchy 崩壊 + design system 構造的負債

### 追加オプション (opt-in)

| フラグ | 追加される expert | 想定用途 |
|-------|-----------------|---------|
| `--include-test` | `test-expert` | ゴミテスト検出・カバレッジ穴・テスト不足 |
| `--include-feature` | `feature-expert` | silent fork (重複実装) / wrapper bypass / implementation gap / pattern deviation / spec divergence の検出 |
| `--all-experts` | 上記 2 体すべて | 8 expert 一括実行 |

test / feature は additive 検出 (削除や追加が中心) のため、デフォルトには含めない。
opt-in する典型タイミング:
- **テスト整備フェーズ** (`--include-test`): プロジェクト初期化時、CI 安定化、カバレッジ拡張
- **資産整理フェーズ** (`--include-feature`): リファクタ前の重複洗い出し、新規 module 流入後の silent fork チェック、運用安定後の implementation gap 棚卸し
- **大規模 audit** (`--all-experts`): 引き継ぎ時、四半期レビュー、メジャーバージョン更新前

---

## 実行モード

| モード | 起動 | Issue 起票 | 想定 |
|-------|------|-----------|------|
| 対話 (デフォルト) | `/op-scan [scope]` | ユーザー承認後 | 通常運用 |
| 自動 | `/op-scan --auto [scope]` | 自動 (重複除外あり) | ルーティーン化・夜間バッチ |
| 観点限定 | `/op-scan --domain debug,security` | 通常通り | 特定領域のみ |
| expert 拡張 | `/op-scan --include-test` | 通常通り | テスト整備時 |
| 全 expert | `/op-scan --all-experts` | 通常通り | 大規模 audit |
| Issue 正規化 | `/op-scan --from-issue #N` | severity フィルタ無効、派生 Issue を起票 | 人間立て Issue / 古い形式 Issue を op-run で実装可能にする |
| merged PR follow-up | `/op-scan --from-merged-pr <PR>` | plan モード承認後に follow-up Issue を起票 | merged PR の残存リスク / review-finding / post-check Notes から follow-up を半自動起票 |
| enrichment skip | `/op-scan --no-enrichment` | enrichment 層を skip (旧挙動互換) | フェーズ 2-4 を無効化したい場合 (詳細はフェーズ 2-4 参照) |
| enrichment strict | `/op-scan --strict-enrichment` | block 時に対象 Issue を起票せず escalation | UI Issue の Design Plan 必須化、cross-review block を hard fail させたい場合 |
| cross-review 強制 | `/op-scan --with-cross-review` | severity Critical 以下でも cross-review 実行 | Medium/Low 検出でも cross-review を走らせたい場合 |

### `--domain` の値 / scope (references/ へ分離)

`scope` はディレクトリパス。省略時はリポジトリ全体。

- **`--domain` 指定時のみ** `references/routing-and-marker-reference.md` §`--domain` の値 を読み、
  alias (ux / ui / ux-ui-audit / designer / theme / token 等) を正規化してから expert list を確定する
- **scope 省略 (full-repo) 時のみ** 同ファイル §scope 省略時の注意 を読む。対話モードでは同節の
  **コスト確認 gate** (「full-repo Opus で続行 / scope を絞る / op-patrol に切替」の選択肢を
  ユーザーに 1 回だけ確認) を必ず実施する。**`--auto` / 非対話では確認を挟まず警告ログのみ**
  (CLAUDE.md 不変則3)。コスト構造・推奨の詳細は同節を正本とする

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
フェーズ0 で `_shared/version-check.md` の手順に従い整合性を確認する (mismatch 時は warning + ユーザー確認)。

- `~/.claude/skills/_shared/runtime-contract.md` — runtime spawn / fallback / planned expert resolution の正本契約。op-scan の scan-time spawn と op-run の apply/fix spawn の責務分離もここで定義
- `~/.claude/skills/_shared/planned-experts.md` — planned expert (env / release / compatibility) の正本リストと runtime spawn 禁止ポリシー
- `~/.claude/skills/_shared/markers/labels-and-markers.md` — OP labels / hidden marker (op-domain / op-source / op-scan-expert / op-run-expert / op-post-check-expert ほか) の正本定義
- `~/.claude/skills/_shared/expert-spawn.md` — subagent prompt 規約、canonical schema、planned expert spawn 禁止、release-expert 再分類、review-expert global review、security-expert active post-check / apply 契約 (commits_added required (v14) を含む)。**Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) — controller が `gh issue create` で hidden marker を埋める前に `op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict` を通す契約。post-check 不要 domain では `op-post-check-expert: null` を必ず埋める規約は維持する
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — active expert / planned expert / agent frontmatter `skills` 対応の canonical runtime registry。agent 名から `skills/expert-<agent-name>/` を機械生成しないための参照表 (本 SKILL.md が runtime spawn 可能とする expert の正本)
- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode の対話可否契約 + needs_human_decision schema
- `~/.claude/skills/_shared/severity-rubric.md` (>=1) — Critical / High / 起票しない の判定基準
- `~/.claude/skills/_shared/project-profile.md` (>=1) — Rust / Flutter / Vue / Tauri 想定スタックと検証コマンド
- `~/.claude/skills/_shared/pr-templates.md` (>=13) — Issue 本文テンプレ + op-review-meta / op-review-finding / op-security-post-check (8 観点 + usable_security / aux post-check 状態 / needs_human_decision) / op-post-check-meta / op-manual-override machine-readable block + op-security-requires-aux-post-check hidden marker + 新ラベルカタログ (pro-security-* / pro-env-expert 含む) + pro-review-expert は Issue routing 対象外 + Needs Human Decision テンプレ
- `~/.claude/skills/_shared/common-setup.md` (>=2) — 言語検出・git 確認の共通手順 + Invocation Mode Overrides
- `~/.claude/skills/_shared/auto-policy.md` (>=3) — `--auto` 自動起票の判定 8 項目 + manual_review_bucket (op-patrol と共通)
- `~/.claude/skills/_shared/dedup-policy.md` (>=3) — fingerprint 生成仕様 + 既存 Issue 重複除外 4 段優先順位 + `op-refactor-debt-key` (refactor の debt 追跡補助 marker、v3 から) (op-patrol と共通)
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック手順 + Invocation Mode 上の責務分離
- `~/.claude/skills/_shared/issue-enrichment.md` (>=2) — Issue draft → enriched Issue 変換層 (Design Plan 付与 + cross-review)。フェーズ 2-4 から呼び出す正本
- `~/.claude/skills/_shared/model-selection.md` (>=1) — expert spawn 時の model (Opus / Sonnet / Haiku、具体 version は §1) 選択 / task_complexity / 区画 complexity の canonical 正本。op-scan の audit 並列 spawn で区画 complexity から model を決め、起票 gate (severity + enrichment) では Opus を割り当てる
- `~/.claude/skills/_shared/op-config-schema.md` (>=1) — `op-config.yaml` schema 定義の canonical 正本。op-scan は本ファイルの `domain_tags` / `complexity_thresholds` を読んで区画 complexity / `region.audit_model` を決定する
- `~/.claude/skills/_shared/read-economy.md` (>=1) — Read Economy 原則 (R1〜R5) + 「Controller への適用」節。controller は既読 Issue/PR/file の再 Read を避け、Issue/PR body は meta/list で取得し、subagent の completion_report 取り込みを圧縮する (読まなさすぎへの退行は避ける)
- `~/.claude/skills/_shared/github-channel.md` (>=2) — GitHub I/O channel / call-spec protocol。mcp channel (Cloud) での素材注入手順 (§6) と司令官の call-spec 実行義務 (§3-§4) の正本
- `~/.claude/skills/op-scan/references/from-issue-mode.md` (>=1) — `--from-issue` モード詳細 (Issue 正規化) の正本。**`--from-issue #N` 指定時のみ読む** (op-run フェーズ1.5 からの委譲呼び出し含む。通常 scan では読まない)
- `~/.claude/skills/op-scan/references/from-merged-pr-mode.md` (>=1) — `--from-merged-pr` モード詳細 (follow-up Issue 半自動起票、Phase -1〜8) の正本。**`--from-merged-pr <PR>` 指定時のみ読む** (Cloud/mcp channel 非対応)
- `~/.claude/skills/op-scan/references/routing-and-marker-reference.md` (>=1) — Expert Runtime and Routing Metadata Contract + `--domain` alias 表 + scope 省略時コスト確認 gate + domain → marker パターン表 (canonical, op-scan/op-patrol 共通) の lookup 集。**`--domain` 指定時 / scope 省略時 / フェーズ1 installed check で planned expert の扱い判断時 / フェーズ4 marker 値の補完・照合時に読む**
- `~/.claude/workflows/op-scan-audit.js` — フェーズ1 / `--from-issue` Phase 4 観点別並列 audit + 起票前 refute の Dynamic Workflow entry (ADR-0009 Phase C / C2)。controller が確定した expert list / scope / today を args 注入し、audit reader を並列 spawn (exploration-only) → normal mode は High/Critical を refute (偽陽性除去) して `{findings, verdicts}` を返す。args / 戻り値 schema は同ファイル冒頭コメントを正本とする
- `op-tools/docs/adr/0009-dynamic-workflows-for-op-fanout.md` — OP fan-out の Dynamic Workflows 移行決定 (Phase A/B/C、決定5 = フォールバック非保持 / fail-fast)。op-scan の audit fan-out 移行 (C2) の上位決定
- `op-tools/docs/adr/0010-workflow-script-distribution.md` — workflow script (`.js`) の repo 正本配置 (repo-root `workflows/`、skill bundle 対象外 infra) の経緯。配布経路は ADR-0023 に統合済み
- `op-tools/docs/adr/0023-workflow-plugin-distribution.md` — workflow script の現行配布経路 (2026-07-21 移行後の正本)。plugin 同梱の `${CLAUDE_PLUGIN_ROOT}/workflows/op-*.js` を SessionStart hook (`hooks/hooks.json`) が `~/.claude/workflows/` へ冪等 staging する (旧経路は deprecated、詳細は CLAUDE.md「配布・運用方式」節)

---

## フェーズ0: 環境確認

### 0-pre. _shared 整合性チェック

`_shared/version-check.md` の「起動時チェック手順」に従い、下記「## 参照ドキュメント」節の `(>=N)` と各 `_shared/*.md` 冒頭の `schema_version` を照合する。mismatch 検出時は warning を表示し、ユーザーに続行可否を確認する (`--auto` モードでも一旦停止)。pass なら以降の確認に進む。

加えて、`_shared/version-check.md` の「installed op binary 鮮度確認」節 (Issue #249) に従い、`op version --json` の `details.git_sha` と `git log --format='%h' -n1 -- op-tools/crates/` の最新 SHA を比較する (比較元 path は binary 挙動に影響する範囲に絞る。docs-only commit の false-drift 回避 = Issue #641)。不一致時は warning + `cargo install --path op-tools/crates/op` を案内 (hard fail なし)。

> **controller の read 規律**: controller は本スキル全フェーズで `_shared/read-economy.md` の
> 「Controller への適用」節に従う (既読 Issue/PR/file を再 Read しない / Issue・PR body は
> meta・list で取得し full body を居座らせない / completion_report を圧縮取り込み)。詳細は同節を正本とする。

### 0-1. git / gh 確認

```bash
# git リポジトリか確認
git rev-parse --is-inside-work-tree || { echo "not a git repo"; exit 1; }

# gh 認証 (mcp channel = call-spec 経路では gh 不要 — github-channel.md)
if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要)"
else
  gh auth status || { echo "gh login が必要"; exit 1; }
fi

# 対象スコープ
SCOPE="${1:-.}"
```

gh channel (未設定含む) のみ未認証で中断する。mcp channel は `! gh auth login` 案内をスキップする。

### 0-2. Dynamic Workflows capability preflight (hard-fail)

フェーズ1 の観点別並列 audit は `op-scan-audit` Dynamic Workflow へ委譲されるため、`_shared/workflow-calling.md`
**§1 capability preflight** (正本、hard-fail の理由・actionable message 文言は複製しない) の通り起動直後に
Workflow tool 利用可否を確認する。

**op-scan 固有**: `--from-merged-pr` モード (フェーズ -1〜8) は audit fan-out を持たない (plan-mode 主体 +
決定論抽出) ため本 preflight の対象外 (§1「対象外の経路」に該当、0-2 を skip してよい)。

---

## フェーズ1: 観点別並列 spawn (op-scan-audit Workflow へ委譲)

controller は観点別 audit を `op-scan-audit` Dynamic Workflow へ委譲する。controller の責務は次の前段ロジックに限る:
(1) 起動する expert list の決定、(2) installed check (planned / 未登録 expert の除外)、
(3) 各 expert の model 確定 (`region.audit_model`)、(4) `Workflow({name:'op-scan-audit', args})` 呼び出し、
(5) 戻り値 (`findings` + `verdicts`) の受領。

spawn の並列管理 (16 並列上限の透過キューイング) は workflow runtime が担い、**controller は人為 cap しない**
(op-run discover/fanout と同方針)。read-only audit の prompt 本文 (旧 spawn テンプレ) は `op-scan-audit.js` の
`buildAuditPrompt()` が正本で、本 SKILL.md からは verbatim 移送済 (重複保持しない、Single Canonical Source Rule)。

### 起動する expert の決定

```
1. デフォルト: 6 expert (debug / refactor / optimize / security / ux-ui-audit / designer)
   ※ security-expert は Phase 2 で active 化済み (subagent_type: "op-skill:security-expert" で正式 spawn)。
     installed check は agent 実体削除等の異常状態を検出する legacy guard として残る。
2. --domain a,b,c が指定された場合: そのリストのみ
   - alias: ux → ux-ui (ux-ui-audit-expert)
   - alias: ui → ux-ui (ux-ui-audit-expert)
   - alias: ux-ui-audit → ux-ui (suffix 省略形)
   - alias: designer → design (designer-expert)
   - alias: theme → design (designer-expert)
   - alias: token → design (designer-expert)
   - suffix `-expert` は省略可
3. --include-test: test-expert を追加
4. --include-feature: feature-expert を追加
5. --all-experts: 8 expert すべて (6 + test + feature)
```

### installed check (planned expert の dispatcher)

/**
 * 機能概要: spawn 直前に「agent 実体が active expert として登録されているか」を確認し、
 *           planned expert / 未登録 expert を spawn list から除外する
 * 作成意図: 「Expert Runtime and Routing Metadata Contract」(references/routing-and-marker-reference.md) の宣言と spawn 手順の整合を取り、
 *           存在しない expert を spawn して失敗する事故と、planned expert の誤 spawn を防ぐ
 * 注意点: 司令官 (commander) は本 dispatcher を必ず通す。直接 spawn は禁止。
 *         planned expert の正本リストは `skills/_shared/planned-experts.md`、
 *         active expert の正本リストは `skills/_shared/active-expert-registry.md`。
 *         本 SKILL.md でローカル列挙はせず、参照のみで解決する。
 */

上で計算した spawn list を、以下の手順で「scan-time に runtime spawn する list」に絞り込む。
planned expert の正本リストは `skills/_shared/planned-experts.md`、active expert の正本リストは
`skills/_shared/active-expert-registry.md`。本 SKILL.md ではリスト本体をハードコードせず、
読み取り時に参照する。

active expert の installed check は `op core registry-verify --lens registry-agent` を呼ぶ:

> **必ず実走する**。skip した場合、planned expert / 未登録 expert を runtime spawn して失敗する。
> controller の judgement で `grep` 等に代替してはならない (本 step は prescribed)。
> SKIPPED_PLANNED 可視化 (silent 除外禁止) の規約は `_shared/workflow-calling.md` **§3** が正本
> (以下このフェーズ内での適用箇所のみ簡潔に注記する)。

```bash
# path flag は省略し CLI の plugin-aware 解決チェーンに委譲する
# (cwd → $CLAUDE_PLUGIN_ROOT → binary 相対 plugin root → $HOME/.claude legacy)。
# Cloud は $HOME/.claude/agents 等が存在しないため、この自動解決が必須。
# 全 active expert を一括検査し、JSON 出力から各エージェントの欠落を特定する。
# exit code: 0 = 全 pass / 1 = 1 件以上 error (block)
REGISTRY_VERIFY_JSON=$(op core registry-verify \
  --lens registry-agent \
  2>/dev/null) || true

# JSON から error 発生エージェント名を抽出 (MISSING-FILE / NOT-IN-REGISTRY 系)
REGISTRY_ERROR_AGENTS=$(printf '%s' "$REGISTRY_VERIFY_JSON" \
  | jq -r '.. | objects | select(.rule_id? and (.effective_severity? == "error")) | .target? // empty' \
  2>/dev/null | sort -u)

# spawn list から registry-verify で error になった / JSON 取得失敗のエージェントを除外
# (SKIPPED_PLANNED への保持は上記 note の通り)。
```

skip 時の挙動 (詳細は `skills/_shared/runtime-contract.md` の fallback 規約に従う):

| ケース | 挙動 |
|-------|------|
| デフォルト 6 expert に planned が含まれる (例: env domain を `--domain` 拡張時に env-expert が planned) | silent skip (warning ログのみ)。`SKIPPED_PLANNED` を最終報告のサマリに併記する |
| `--domain <planned>` が明示指定され、対象 expert が planned (例: `--domain env`) | warning + 司令官 fallback scan (grep ベース audit) に切り替え。検出 finding には planned 名を **routing metadata として保持してよい** が runtime spawn はしない (Issue 起票時のラベルは `labels-and-markers.md` 参照) |
| `--domain` で planned のみ指定された場合 (例: `--domain env` のみ) | fallback scan を実行し、結果が空でも空配列で正常終了 |

`--domain security` 等の active expert は通常通り `subagent_type: "op-skill:<expert-name>"` で正式 spawn する
(plugin scoped-name 規約の正本は `_shared/expert-spawn.md` §Plugin scoped-name 規約)。
agent 実体が万一削除されている異常状態 (legacy guard) では、`runtime-contract.md` の fallback 規約に従い
司令官 fallback scan に切り替える。fallback の事実は、フェーズ3 のサマリと最終報告の両方に必ず明示する
(silent に「該当観点が見られた」ように振る舞ってはならない、という原則の適用箇所。原則本体は
`_shared/workflow-calling.md` **§3**)。

### op-scan-audit Workflow 呼び出し

controller は「起動する expert の決定」+ installed check を通過した expert list を、各 model 確定値とともに
`op-scan-audit` workflow へ args 注入して呼ぶ。

```
// today は controller が `date -u +%F` で確定する (agent 側 date 実行禁止 = F2 対策)。
// experts は installed check 通過後の list。各 model は region.audit_model で確定 (model-selection.md §5.2)。
const auditOut = await Workflow({
  name: "op-scan-audit",
  args: {
    mode: "normal",                       // --from-issue 経路は references/from-issue-mode.md §4 で mode: "from-issue"
    scope: "<フェーズ0 で確定した対象スコープ>",
    domain: "<--domain 指定時のみ>",       // 省略可
    experts: [ { name: "<expert-name>", model: "<region.audit_model 確定値>" } /* , ... */ ],
    audit_model: "<region.audit_model の fallback 既定値>",
    today: "<YYYY-MM-DD>",                // date -u +%F
    extra_directives: null,               // normal mode は null (--from-issue で controller が組み立て注入)
  },
});
// auditOut.result.findings = 全 expert の canonical scan-finding を flat 集約 (各 finding に detected_by / finding_ref 付与)
// auditOut.result.verdicts = normal mode の High/Critical finding に対する refute verdict (→ フェーズ1.5 で適用)
```

戻り値の barrier 挙動・`.result.*` unwrap 規約は `_shared/workflow-calling.md` **§2** が正本 (本 SKILL.md では
複製しない)。上記コードの `auditOut.result.findings` / `auditOut.result.verdicts` がその実体。spawn の prompt
本文・schema は `op-scan-audit.js` (`buildAuditPrompt` / `scanFindingSchema`) が正本。

各 expert の model 注入 (`args.experts[].model`) は `model-selection.md §5.2` (`region.audit_model`:
single/typical→sonnet, complex/critical→opus) で確定する。per-run 動的値の注入規約全般は
`_shared/workflow-calling.md` **§4** を参照。

installed check で除外した planned/未登録 expert を `args.experts` に含めない・`SKIPPED_PLANNED` へ併記する
silent 除外禁止規約は `_shared/workflow-calling.md` **§3** が正本。

### 各 expert の出力

すべて `_shared/expert-spawn.md` の **canonical schema** に従う。
op-scan は本スキーマを前提に Issue 本文・バッチ判定・apply 指示書展開を行う。
スキーマ外のフィールドは無視する (forward compatibility)。

#### domain=refactor の正式 extension fields (例外)

ただし `domain: "refactor"` の finding に限り、以下の **refactor extension fields** が
canonical schema の正式拡張として扱われ、op-scan は **必ず Issue 本文へ転写する**
(`_shared/pr-templates.md` の「🧱 Refactor Execution Control」節へ展開)。

主要 field:

- 必須 (常時): `finding_type` / `execution_mode` / `direct_apply_safe` / `blocking` / `blocking_reason`
- `architecture_debt` / `staged_refactor` で必須: `safe_first_step` / `proposed_stages` /
  `affected_paths` / `why_not_direct_apply` (architecture_debt のみ)
- `architecture_debt` で必須: `first_detected_at` / `last_seen_at` / `seen_count` / `risk_trend`
  (architecture_debt メタセクションに転写)
- `needs_human_decision` (構造化 block: `required` / `reason` / `decision_type` / `options[]` /
  `recommended_option` / `safest_default` / `blocked_actions[]` / `can_continue_without_decision` /
  `next_safe_action`): `required: true` の Issue で必須。ラベル `needs:human-decision` を付与し、
  `can_continue_without_decision: true` かつ `finding_type != needs_spec_decision` のときは追加で
  opt-out ラベル `needs:human-decision-followup` を付与
- 任意: `forbidden_stage_actions` / `recommended_followup_experts` (op-run フェーズ3 で PR 本文
  「残存リスク / follow-up」節に再転記、フェーズ4 review への入力、Issue 自動起票はしない) /
  `human_decision_points`

転写先は `_shared/pr-templates.md` の「🧱 Refactor Execution Control」節と各 hidden marker
(`op-finding-type` / `op:blocking-finding` ラベル等)。詳細スキーマは
`_shared/expert-spawn.md` の §domain extension および
`~/.claude/skills/expert-refactor/references/report-schema.md` を正本として参照する。

欠落させた refactor finding は **不完全 finding** として op-scan で reject し、
expert 再 spawn または `manual_review_bucket` に回す (op-run でも安全に展開できないため)。

#### domain=security の正式 extension fields (例外)

`domain: "security"` の finding に限り、`security.*` / `threat_model.*` / `usable_security.*` /
`post_check.*` の各 group が canonical schema の正式拡張として扱われ、op-scan は **必ず Issue 本文へ転写する**
(`_shared/pr-templates.md` の Issue 起票テンプレに hidden marker および本文セクションとして展開)。

主要 field group:

- `security.*`: attack_surface / trust_boundary / source (kind/file/symbol/input_name) /
  sink (kind/file/symbol/operation) / attack_path (reachable, steps) / exploitability /
  impact (C/I/A) / data_sensitivity — Issue 本文「Threat Model」「Source → Sink Reachability」「Attack Path」節へ
- `threat_model.*`: actor / preconditions / required_user_action / asset_at_risk — Issue 本文「Threat Model」表へ
- `usable_security.*`: affected_user_capability / legitimate_workflow_preserved / ux_impact /
  preferred_mitigation / forbidden_shortcuts — Issue 本文「Usable Security 方針」「触ってはいけない範囲」節へ
- `post_check.*`: primary_post_check_expert / requires_aux_post_check / aux_post_check_experts —
  hidden marker `<!-- op-post-check-expert: ... -->` と `<!-- op-security-requires-aux-post-check: ... -->` へ

各 field の **必須性 / 詳細スキーマ** は `_shared/expert-spawn.md` の §domain extension: security 拡張
および `~/.claude/skills/expert-security/references/report-schema.md` を正本として参照する。
本 SKILL.md では field 名と転写先の対応のみ示し、詳細フォーマットは再記述しない (Single Canonical Source Rule)。

欠落させた security finding は **不完全 finding** として op-scan で reject し、
expert 再 spawn または `manual_review_bucket` に回す。
`security.attack_path.reachable: false` または `usable_security.legitimate_workflow_preserved: false` で
mitigation を提案している finding は起票しない (前者は到達不可 = severity に届かない、後者は
usable_security 違反 = forbidden_shortcuts 抵触で blocker)。

---

## フェーズ1.5: refute 適用 (起票前 false-positive gate、C2)

/**
 * 機能概要: `op-scan-audit` workflow の refute stage が返した `auditOut.result.verdicts` を、
 *           フェーズ2 (統合・dedup・enrichment) に入る前に finding 集合へ適用する。
 * 作成意図: 偽陽性を severity gate / dedup / enrichment (最大 8 spawn/Issue) の **前** で潰す
 *           (CLAUDE.md 不変則8「起票前 review」と同じ哲学)。
 * 注意点: refute は **finding ごとの偽陽性除去** であり、enrichment §6 の cross-review
 *         (issue_draft 全体の品質 review) とは別レイヤー (重複実装しない)。refute は normal mode のみ。
 */

`op-scan-audit` の戻り値 `auditOut.result.verdicts` を、各 finding に `finding_ref` で突合して適用する。

### verdict 適用順 (逆転不可)

`refute verdict 適用 → severity gate → 統合(2-1) → bulk-group(2-1-b) → dedup(2-2) → ...` の順。
**downgrade が severity を変えるため severity gate は refute の後でなければならない** (逆順は不可)。

| verdict | 適用 |
|---------|------|
| `confirmed` | severity 不変で通過 |
| `downgrade` | `finding.severity = verdict.confirmed_severity` で上書き → 後段 severity gate で Critical/High 外なら drop |
| `refuted` | finding を **drop** (統合・dedup・enrichment に渡さない) |

drop / downgrade-drop された finding は **最終報告サマリに「refute で偽陽性/過大判定」+ `evidence_excerpt` を必ず列挙**
する (silent drop 禁止、`SKIPPED_PLANNED` と同じ可視化哲学)。`manual_review_bucket` は偽陽性で汚さない。
ただし downgrade で `evidence_grade_observed: requires_runtime` になった finding は既存規約通り `manual_review_bucket` に退避する。

### trust model (決定論照合が無い前提の安全側規約)

finding には commit のような決定論照合が無い (主張の正否は最終的に LLM 判断)。以下の層で信頼を構造化する:

1. **schema 強制 (workflow 側)**: `evidence_excerpt` (minLength:1) / `reread_performed` / `supports_claim` 必須。空証拠は構造 block 済。
2. **controller literal 照合 (drop 方向のみ)**: `refuted` / downgrade-drop の verdict は、controller が `evidence_excerpt` を
   `evidence_location` (`file:line-line`) のファイル内に literal 存在するか grep / Read で確認する。不在なら verdict を信頼せず安全側に倒す。
3. **verdict↔severity 整合 + 安全側規約**: 非整合 (例 `verdict: confirmed` だが `refuted: true`) は controller reject。
   - **非 security**: 安全側 = `refuted` (drop)。skeptic default。
   - **security**: 安全側 = `confirmed` (keep)。security の取りこぼし (false negative) は実害が大きいため。
4. **security 非対称ルール (D7)**: `domain: security` の Critical/High を `refuted` にするには `security_unreachable_proof`
   (到達不可の積極的証拠) が必須。欠落 / 弱い場合は controller が `confirmed` に override (keep)。

> **限界の明示**: refute は false-positive の **近似 gate** であって証明ではない (`evidence_excerpt` の literal 存在は
> 照合できるが、そのコードが到達経路 / 被害を本当に生むかは LLM 判断に依存する)。drop は可視化し、取りこぼしは
> 次回 scan / op-patrol 巡回で再検出される前提とする。

### refute が走る / 走らない経路

- **normal mode (デフォルト)**: 走る。`--auto` でも走る (enrichment 不変則8 と同じ: auto は人間承認 skip であって品質 gate skip ではない)。
  refute で drop された finding は偽陽性のため `manual_review_bucket` に入れない。
- **`--from-issue` / `--from-merged-pr`**: skip (人間 Issue / merged PR の正規化であり偽陽性除去は不適切。workflow が `verdicts: []` を返す)。

> refute の opt-out flag (`--no-refute`) は v1 では未実装。over-refute が dogfooding で観測されたら follow-up で additive 追加する
> (security 非対称 + drop 可視化で over-refute を当面緩和する)。

---

## フェーズ2: 結果統合・重複除外

### 2-1. 全 expert の出力を統合

各 expert が返した JSON 配列をマージ。重複候補をマージするキー:

- 同一ファイル + 行範囲が ±5 行以内
- title の意味的類似 (簡易的にはキーワード一致)

重複は深刻度の高い方を採用、別 expert の指摘は本文に補足として追加。

#### ux-ui と design の重複ルール (NEW)

`ux-ui-audit-expert` と `designer-expert` は責務が分離されているが、同一画面・同一 component に
両方が指摘を返すことはあり得る (例: 1 つのボタンに focus 不可視 + token bypass)。

| ケース | 処理 |
|-------|------|
| 同一ファイル・別観点 (使いやすさ vs 美しさ) | **両方起票する** (責務が違うので統合しない) |
| 同一ファイル・同一観点が両者から重複 | **使いやすさ優先**: ux-ui-audit-expert の指摘を採用、designer の指摘は本文に補足 |
| 例: contrast 不足 (ux-ui の a11y 観点) と hardcoded-color (design の token 観点) が同一行 | 両方起票 (使いやすさ + 美しさ両面の問題) |
| 例: focus 不可視 (ux-ui) と outline 装飾 hard-code (design) が同一 selector | 統合: ux-ui を採用、design は補足 |

### 2-1-b. バッチ起票判定 (bulk_group)

bulk_group 集計・バッチ判定・domain 別特例 (optimize 原則禁止 / refactor Phase 1 全面禁止) は
`op scan bulk-group` CLI に委譲する:

```sh
# op scan bulk-group --findings-json <findings_json> で判定結果 JSON を返す
op scan bulk-group --findings-json findings.json
```

mcp channel では素材を `github-channel.md` §6 の手順 (`mcp__github__search_issues`) で取得し、
`--input-json` を上記と併用する (第一波 singular と同じ意味論)。

詳細仕様 (閾値 / optimize 特例条件 / refactor 特例 / Phase 2 設計方針) は
`op-tools/docs/specs/scan-bulk-group.md` を参照 (PR #95 で新規作成、merge 後に反映)。

domain 別の clustering 方針は `_shared/clustering.md` § optimize 特例 および
`skills/expert-refactor/SKILL.md` § Refactor Clustering / Batch 特例 が正本。

### 2-2. fingerprint 生成 + 重複除外

`_shared/dedup-policy.md` の **fingerprint 生成仕様** と **既存 Issue との重複除外** に従う
(op-patrol と共通仕様)。スキップした検出は「既存 Issue #N と重複」として最終報告に記録。

mcp channel では `op scan dedup --findings-json <findings_json> --input-json <素材JSON>` のように、
`github-channel.md` §6 で取得した素材を `--input-json` で併用する。

### 2-3. 並び替え

優先順位:
1. severity (critical > high)
2. expert (security > debug > refactor > optimize > ux-ui > design > feature > test)
3. ファイル名昇順

> 使いやすさ (ux-ui) は美しさ (design) より優先される。同 severity でレビュー順を決めるとき、
> ux-ui の指摘を先に確認する。design は最後に流す。

### 2-4. Issue draft enrichment (起票前 review、proposal Phase 4)

/**
 * 機能概要: fingerprint dedup 後の各 issue_draft を、`_shared/issue-enrichment.md (>=2)` の
 *           input/output contract に従って enrichment 層に渡し、UI 影響あり Issue には
 *           Design Plan を付与し、必要に応じて cross-review を行う。
 * 作成意図: op-architect フェーズ 4.6 で実装されていた起票前 review ロジックを
 *           「人間立て対話」だけでなく、op-scan / op-patrol / op-plan の全自動起票経路に
 *           広げる。Issue 品質をデフォルトで上げ、UI Issue の Design Plan 欠落を防ぐ。
 * 注意点: `gh issue create` の前に走る pre-create review。GitHub に立った後の Issue に
 *         コメント追加するモードではない (proposal 3.7.1 不変則)。block 判定なら起票自体を
 *         キャンセルする。具体的なロジック (UI 影響判定 / Design Plan gate / cross-review 表 /
 *         max_review_loops / output contract) は `_shared/issue-enrichment.md` を正本として参照する。
 *         本 SKILL.md では入出力境界と op-scan 固有の flag マッピングだけを記述する。
 */

`gh issue create` の前に、フェーズ 2-2 (fingerprint dedup) と 2-3 (並び替え) を通過した
各 `issue_draft` を `_shared/issue-enrichment.md (>=2)` の input contract に渡し、enriched
Issue (Design Plan 付与済 / cross-review 反映済) に変換してから起票する。具体的な変換ロジック (UI 影響判定 / Design Plan
gate / cross-review 表 / max_review_loops / output contract) は `issue-enrichment.md` を
正本として参照し、本節では再記述しない (Single Canonical Source Rule)。

> **C4 (ADR-0009 Phase C)**: enrichment の Design Plan 生成→gate / cross-review は内部で
> `workflows/op-enrichment.js` workflow を使う (controller 直接 spawn から移行)。controller は
> severity gate / dedup の後、`issue-enrichment.md` §7.6 の順序で auto 解決 → `Workflow({name:'op-enrichment'})`
> 呼出 → §8 受領 → collision gate → 直列起票 を行う。collision gate (§7.5) は controller 保持で `--no-enrichment` でも bypass 不可。
>
> **ADR-0012 (design 多役)**: pre-step で controller は `design_depth` / `design_roles[]` / `foundation_exists` も
> 解決し注入する (正本 `issue-enrichment.md` §4 / §7.6、複製しない)。op-scan は **thin auto caller**: `--auto` 経路では
> `auto_full_downgrade_to_light` (op-config §9) で full→light に丸め、foundation-build / design-spike は
> 起票せず `manual_review_bucket` に退避する (対話 caller の能動承認とは非対称)。workflow 側の Design Plan 生成は多役 pipeline。

#### flag マッピング

| flag | default | 効果 |
|------|---------|------|
| (省略時) | enrichment 有効 | enrichment 層を呼ぶ。UI 影響あり Issue には Design Plan を付与し、severity high+ では cross-review を auto で実行 |
| `--no-enrichment` | enrichment 無効化 | enrichment skip (旧挙動互換、UI 影響あり Issue でも Design Plan 無し)。`issue_draft` をそのまま起票する |
| `--strict-enrichment` | failure mode strict | Design Plan gate が BLOCK / cross-review が block を返した場合、対象 Issue を起票せず escalation report に回す (default の continue-on-soft-fail を strict に切替) |
| `--with-cross-review` | severity Critical 以下でも cross-review 強制 | default は high+ で auto。本 flag を指定すると Medium / Low / `severity:n/a` でも cross-review を実行する |

`--no-enrichment` と `--strict-enrichment` / `--with-cross-review` は相互排他。
`--no-enrichment` 指定時に他 2 flag が指定されたら warning を出し、`--no-enrichment` を優先する
(enrichment 層自体を呼ばないため他 flag は意味を持たない)。

#### 呼び出し経路ごとの挙動 (proposal 3.7.1 不変則、すべての経路で enrichment が走る)

| 経路 | enrichment 実行 | block 判定時の挙動 |
|------|----------------|------------------|
| 対話モード (デフォルト) | 走る | enriched 結果をフェーズ3 の承認テーブルに表示。block された draft は「起票候補」から除外しユーザーに理由を提示 |
| `--auto` | 走る (人間承認だけスキップ) | 起票せず `manual_review_bucket` に記録する (`_shared/auto-policy.md` の block 退避ロジックに従う)。auto モードは人間承認 gate を skip するための機構であり、enrichment 品質 gate を素通しするものではない |
| `--from-issue` | 走る | 元 Issue 取得 → 派生 `issue_draft` 生成 → enrichment → enriched で派生 Issue 起票 (元 Issue 本体は触らない)。block 時は派生 Issue を起票せず、元 Issue に「enrichment で block されました (理由: ...)」とコメントで返信 |
| `--no-enrichment` 同時指定 | skip | 旧挙動互換。`issue_draft` のまま起票 (`--from-issue` と組み合わせた場合も同様) |

#### enrichment marker の埋め込み

enrichment 層は output contract で `enriched_issue.body` 内に enrichment marker
(`op-enrichment-design-plan` / `op-enrichment-cross-review` ほか) を埋め込んで返す。
marker 名の正本は `skills/_shared/markers/labels-and-markers.md` を参照する
(op-scan 側でハードコードしない)。`--no-enrichment` 経路ではこれらの marker は付かないので、
op-run / op-merge 側はその欠落をもって「enrichment 未実行 Issue」と判別できる。

---

## フェーズ3: ユーザー承認

### 対話モード (デフォルト)

```
## op-scan 検出結果

### サマリ
| expert              | Critical | High | 既存重複 |
|--------------------|----------|------|---------|
| debug-expert       | 0        | 2    | 1       |
| security-expert    | 1        | 0    | 0       |
| ux-ui-audit-expert | 0        | 1    | 0       |
| designer-expert    | 0        | 2    | 1       |
| ...                | ...      | ...  | ...     |
| **合計**           | **1**    | **5**| **3**   |

### 起票候補 (6 件)
| # | severity | expert       | title                              | files            |
|---|----------|-------------|------------------------------------|------------------|
| 1 | critical | security    | SQL Injection の可能性             | api/query.py:45  |
| 2 | high     | debug       | 例外握りつぶしでエラー隠蔽         | service.ts:120   |
| ...

### 既存 Issue と重複でスキップ (3 件)
- #34 と同等: api/handler.py の null check 漏れ
- ...

起票しますか?
1. すべて起票
2. Critical のみ
3. 番号で個別選択 (例: 1,3,5)
4. キャンセル
```

### 自動モード (`--auto`)

ユーザー承認をスキップ。`_shared/auto-policy.md` の起票条件 (op-patrol と共通仕様) を
すべて満たす検出のみ自動起票する。`requires_runtime` は `manual_review_bucket` として保持し、
op-scan / commander が後で対話モード提示時に「要確認」枠としてユーザーに見せる
(expert subagent は質問せず構造化返却する)。

---

## フェーズ4: Issue 起票

> mcp channel では本フェーズの `op issue create` / `op issue comment` / `op pr comment` は
> それぞれ call-spec を emit する — `github-channel.md` §3-§4 の protocol で完遂し、
> `$NEW_ISSUE_NUM` 等の後続値は ingest envelope から取る (fence 自体は無改変)。

`_shared/pr-templates.md` の **指示書テンプレ** に従って Issue を起票する。
2 種類のテンプレを使い分ける:

> **enrichment 後の起票**: フェーズ 2-4 を通過した `issue_draft` は enrichment 層が返した
> `enriched_issue.body` / `enriched_issue.labels_to_add` を反映した状態で本フェーズに入る。
> 本フェーズの hidden marker / ラベル付与ロジックは enriched body に **追記** する形で動く
> (enrichment が埋めた enrichment marker は破壊しない)。`--no-enrichment` 指定時は
> `issue_draft` をそのまま起票し、enrichment marker は付かない。
> block されて起票キャンセルされた draft は本フェーズに到達しないため、ここでは block 処理を
> 再記述しない (フェーズ 2-4 で `manual_review_bucket` / escalation report に振り分け済み)。

### 通常検出 → 指示書フル版 (個別 Issue)

scan の hypothesis / excluded_hypotheses / scope_in / verification_steps / success_criteria / gotchas
をすべて Issue 本文に展開する。これで apply は context を完全継承できる。

`_shared/pr-templates.md` の「Issue 本文 (指示書フル版)」セクションをそのまま使用。

### バッチ検出 (5 件以上同 bulk_group) → バッチ Issue

`_shared/pr-templates.md` の「op-scan: バッチ Issue 起票テンプレ」に従う。
対象一覧テーブルに各検出を行展開し、apply は 1 PR で全件処理。

### additive 検出 (test 不足、機能追加等)

`recommendation` フィールドに **構造化された実装計画** が含まれているはず
(`_shared/expert-spawn.md` の「実装計画の埋め込み」参照)。
Issue 本文の「推奨アクション」または「指示書」節に Markdown 構造のまま貼り付ける。
apply はこの計画をテンプレとして即実装。

### Issue 本文 hidden marker (op-patrol と共通)

すべての Issue 本文の冒頭に **必ず** hidden marker を埋め込む。op-scan / op-patrol
双方の重複判定 (フェーズ2-3) はこの marker を最優先で使用し、op-run はこれを expert / post-check 解決に使う。

> **重要**: marker / ラベル定義は routing metadata であり spawn 権限を生まない (`references/routing-and-marker-reference.md` §Expert Runtime and Routing Metadata Contract 参照)。marker schema の正本は `skills/_shared/markers/labels-and-markers.md`。

#### 必須 marker (全 Issue 共通)

```markdown
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-source: op-scan -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature | env> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert の routing recommendation (canonical schema の recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | env-expert | null> -->
```

> `op-run-expert` / `op-post-check-expert` は **routing recommendation** であり spawn authorization ではない。
> op-run はこの値を参考にしつつ、`skills/_shared/runtime-contract.md` の判定優先順位で実 spawn 先を再解決する。

> `op-post-check-expert` は **必須**。post-check が不要なドメイン (debug / refactor / optimize / test / feature でかつ
> UI 影響なし) でも、**marker 自体は必ず出力し、値を `null` にする**。値を省略してはいけない (op-run の dispatcher が
> marker の有無で「未解決」と「明示的に skip」を区別できなくなる)。canonical schema (`_shared/expert-spawn.md`) の
> `post_check_expert` field と完全一致させる。

> **planned expert (env / release / compatibility) および Utility Worker (spec-expert) を marker 値に書き出す場合は metadata only**。
> op-scan は scan-time に planned expert を runtime spawn しない (`references/routing-and-marker-reference.md` の Contract 節)。
> op-run 側の apply/fix 解決と post-check 起動も `skills/_shared/runtime-contract.md` /
> `skills/_shared/planned-experts.md` の規約に従い、planned expert は active fallback または
> `needs_human_decision` に倒す。本 SKILL.md でローカルの fallback 表をハードコードしない。

#### domain → marker パターン表 (references/ へ分離)

各 domain の `op-scan-expert` / `op-run-expert` / `op-post-check-expert` 標準値の canonical 表
(op-scan/op-patrol 共通)、feature (UI 影響あり) の post-check 必須理由、refactor の post-check
選択条件 pointer、planned expert の metadata-only 規約は
`references/routing-and-marker-reference.md` §domain → marker パターン表 へ移設した。
**読むタイミング**: 本フェーズで marker 値を組み立てる際、expert が `recommended_runner` /
`post_check_expert` を返さず domain からの補完が必要になったとき、または標準値との妥当性照合を
行うときに読む。

marker の値は **canonical schema (`_shared/expert-spawn.md`) の `recommended_runner` / `post_check_expert` を機械的に転写する**。
expert が schema 上で `recommended_runner` を返さなかった場合は、op-scan が domain → 標準 runner 表
(`references/routing-and-marker-reference.md` §domain → marker パターン表) で補完する。

> ここで marker に書き出す `recommended_runner` / `post_check_expert` (= `recommended_expert` 一般) は
> **routing recommendation** であり、op-run の apply/fix runtime spawn を authorize しない
> (`references/routing-and-marker-reference.md` §Expert Runtime and Routing Metadata Contract を参照)。
> op-run は `skills/_shared/runtime-contract.md` の
> 判定優先順位で実 spawn 先を独立に再解決する。

#### ラベル付与

- `auto-report` (op-scan / op-patrol 共通)
- `severity:critical` または `severity:high` (severity ラベルは `severity:*` 形式に統一。clustering.md は旧 `critical` / `high` も互換読みする)
- `pro-<expert>-expert` ラベル (例: `pro-debug-expert`、apply 担当に対応)
- ux-ui / design Issue で post-check が必要なら `pro-ux-ui-audit-expert` を追加
- **security domain Issue は基本 `pro-security-expert` (apply 兼 post-check) 1 つで起票する**。op-run の判定優先順位 1-8 で apply を debug-expert に回す場合は `pro-debug-expert` (apply) + `pro-security-expert` (post-check) の両方を付与する
- **feature domain Issue で UI 影響あり (`references/routing-and-marker-reference.md` §domain → marker パターン表 の注記参照) の場合は、`pro-feature-expert` (apply 担当) と `pro-ux-ui-audit-expert` (post-check 担当) の両方を必ず付与する**
- **env domain Issue は `pro-env-expert` ラベルを付与する** (routing metadata only)。
  env-expert は planned のため scan-time / apply-time の runtime spawn 対象外。
  active fallback への解決と `needs_human_decision` への退避は
  `skills/_shared/runtime-contract.md` および `skills/_shared/planned-experts.md` を正本とする
  (op-scan 側でハードコードしない)
- バッチ Issue は `batch` ラベルを追加

> **expert ラベル / その他 OP ラベル / hidden marker の正本定義** は `skills/_shared/markers/labels-and-markers.md`。
> 本 SKILL.md でラベル文字列を例示する際もそちらの形式に従う (短縮形 `pro-debug` / `pro-designer` 等は使わない)。

##### domain=refactor 固有のラベル付与ルール (finding_type / blocking / human_decision に応じて)

refactor finding は finding 固有 field に応じて以下のラベルを **必ず追加で付与** する。
これは architecture_debt 追跡 / blocking gate / human decision routing の中核:

| 条件 | 追加ラベル | 用途 |
|------|-----------|------|
| `post_check_expert == "security-expert"` | `pro-security-expert` | post-check 担当を ラベル経由でも明示 (marker 破損 / 古い Issue の fallback) |
| `post_check_expert == "ux-ui-audit-expert"` | `pro-ux-ui-audit-expert` | 同上 |
| `finding_type == "architecture_debt"` | `op:architecture-debt` | op-patrol が既存 debt Issue を検索する正本ラベル (これが付かないと再検出時に重複起票) |
| `finding_type == "staged_refactor"` | `op:staged-refactor` | safe_first_step 限定で実装する Issue 群の識別 |
| `finding_type == "needs_spec_decision"` | `needs:spec-decision` | apply せず人間判断待ちにする |
| `blocking == true` | `op:blocking-finding` | op-run で最優先単独実行、op-merge gate 19 で他 PR の merge を止める |
| `needs_human_decision.required == true` (構造化 block) | `needs:human-decision` | 人間判断が必要な finding。block 全体 (decision_type / options / blocked_actions ほか) を Issue 本文に転写 |
| `needs_human_decision.required == true` かつ `needs_human_decision.can_continue_without_decision == true` (opt-out) | `needs:human-decision-followup` | 判断は将来必要だが、`safe_first_step` の範囲だけは現 PR で進めてよい opt-out フラグ。op-run はこの両ラベルが付いた Issue を `manual_review_bucket` に落とさず通常 apply に流す。apply 担当は `safe_first_step` のみ実行し、`blocked_actions[]` を厳守、`needs_human_decision` block を PR 本文「残存リスク / follow-up」節と完了報告に転記する |
| `needs_human_decision.required == true` かつ `finding_type == "needs_spec_decision"` の場合 | (上記 followup ラベルは付与しない) | 仕様判断は常に blocking。`finding_type=needs_spec_decision` と `can_continue_without_decision: true` を併発させた finding は不完全 finding として reject する |
| `needs_human_decision.decision_type == "boundary"` | `needs:boundary-decision` | 境界判断が必要な人間決定点があることを示す。**単独では apply を止めない** (manual_review_bucket は `needs:human-decision` の単独付与で判定) |
| `needs_human_decision.decision_type == "spec"` | `needs:spec-decision` | 仕様判断が必要な人間決定点があることを示す (finding_type=needs_spec_decision と併用) |
| `seen_count >= 3` または `affected_paths` 増加 | `needs:triage` | op-patrol の責務 (op-scan では `seen_count == 1` 起点のため通常付与しない) |

起票時のラベル決定ロジックは以下を順に評価する (refactor finding の例):

1. base: `auto-report` + `severity:<value>` (high / critical) + `pro-refactor-expert`
2. `post_check_expert == "security-expert"` → `pro-security-expert` を追加
3. `post_check_expert == "ux-ui-audit-expert"` → `pro-ux-ui-audit-expert` を追加
4. `finding_type == "architecture_debt"` → `op:architecture-debt` を追加
   (op-patrol 再検出フローが既存 debt Issue を検索する正本ラベル)
5. `finding_type == "staged_refactor"` → `op:staged-refactor` を追加
6. `finding_type == "needs_spec_decision"` → `needs:spec-decision` を追加
7. `blocking == true` → `op:blocking-finding` を追加 (op-run 単独実行 + op-merge gate 19)
8. `needs_human_decision.required == true` → `needs:human-decision` を追加
9. `needs_human_decision.required == true` AND
   `needs_human_decision.can_continue_without_decision == true` AND
   `finding_type != "needs_spec_decision"` → `needs:human-decision-followup` を追加 (opt-out)
10. `needs_human_decision.decision_type == "boundary"` → `needs:boundary-decision` を追加
11. `needs_human_decision.decision_type == "spec"` → `needs:spec-decision` を追加 (重複可)

ラベル配列を組み立てた後、起票時は `op issue create --label "auto-report,severity:high,..."` の
形式でカンマ区切りに join して渡す。`op issue create` 内部で gh issue create の `--label`
flag に転写される。

#### Marker Publish Validate (起票直前 fail-fast、C2 で有効化)

各 `op issue create` の **直前** に、`_shared/expert-spawn.md` の **Marker Publish Validate 節** (2段
validate 手順の正本、内容はここに複製しない) を通す。`source-hint` は `issue-body` を使う (BODY_FILE = 起票する
Issue 本文、hidden marker 埋め込み済・enrichment 反映後)。block された draft は起票せず
manual_review_bucket / escalation に回す (対話モードはユーザー提示で停止、`--auto` は退避、フェーズ2-4 の block
退避と同列)。直列 `op issue create` (1 draft = 1 invocation、並列化禁止) はフェーズ5/Phase 7 の起票規約を踏襲する。

> **`||` で握り潰さない**: lint decision は明示確認してから `op issue create` する
> (memory `feedback_op_review_meta_reviewer_field_required`: `op ... || fallback` だと block でも投稿が通ってしまう)。

`finding_type=needs_spec_decision` + `can_continue_without_decision: true` の組み合わせは
**不完全 finding として reject** する (仕様判断は常に blocking のため opt-out 不可)。
本 reject は SKILL.md 側のロジック (canonical schema check) で実施し、`op issue create` まで
到達させない。

`op:architecture-debt` ラベルは **op-patrol の architecture_debt 追跡の正本キー**。
起票時に必ず付与しないと、op-patrol 再検出フロー (`op-patrol/SKILL.md` フェーズ5-2) が
既存 Issue を取り逃がして重複起票し、`seen_count` / `risk_trend` が更新されなくなる。

#### post_create_comments の投稿 (起票成功後、consolidation 規約 #643)

enrichment が返した `post_create_comments[]` (Medium/Low 指摘) は **1 件 = 1 コメントで投稿しない**。
`issue-enrichment.md §8.2` の consolidation 規約に従い、**1 Issue = 1 集約コメント**に束ねて投稿する
(severity / category 別セクションでまとめ、冒頭に「Critical/High は本文統合済み」を明記)。
件数が多い場合 (実害: 2026-06-02 op-scan で 1 Issue に 12 件) でも個別投稿は spam になるため禁止。

```bash
# post_create_comments を controller 側で 1 本に束ねて一時ファイルへ書き出し、1 回だけ投稿する
# (severity/category 別セクション化 + 「他 M 件省略」可視化は §8.2 cap 規約に従う、silent truncation 禁止)。
POST_COMMENT_TMP=$(mktemp /tmp/op-scan-post-comment-XXXXXX.md)
# … §8.2 の集約フォーマットで $POST_COMMENT_TMP を生成 …
op issue comment "$NEW_ISSUE_NUM" --body-file "$POST_COMMENT_TMP"
rm -f "$POST_COMMENT_TMP"
```

`post_create_comments` が空配列なら投稿しない。consolidation 正本は `issue-enrichment.md §8.2`
(controller 責務、workflow は分離して返すまで)。

---

## フェーズ5: 完了報告

```
## op-scan 完了

### 起票結果
| # | Issue | severity | expert | title |
|---|-------|----------|--------|-------|
| 1 | #62 | critical | security | SQL Injection の可能性 |
| 2 | #63 | high     | debug    | 例外握りつぶし |
| ...

### 統計
- 起票: 6 件
- スキップ (重複): 3 件
- 検出 0 件: ux-ui-audit-expert

次は `/op-run` で Issue を読み込み、並列実装に進めます。
```

---

## 特殊モード (references/ へ分離)

以下 2 モードは毎回は通らない別経路のため、詳細手順を references/ へ移設した (ADR-0029 Wave B1)。
該当 flag が指定されたときのみ読む — 通常 scan では読まない。

- **`--from-issue #N` 指定時のみ** (op-run フェーズ1.5 からの委譲呼び出し含む)
  `references/from-issue-mode.md` を読む — Issue 正規化の全手順 (元 Issue 取得 / scope 推定 /
  expert 絞り込み / severity フィルタ無効の from-issue audit / 派生 Issue 起票 / 元 Issue への
  コメント + `superseded-by-scan` ラベル / 完了報告) の正本
- **`--from-merged-pr <PR>` 指定時のみ** `references/from-merged-pr-mode.md` を読む — Phase -1
  (EnterPlanMode) 〜 Phase 8 のフル別経路 (7 source field 抽出 / dedup / enrichment + collision
  gate / plan file 書き出し / ExitPlanMode 人間 gate / 直列起票 / 親 PR trace コメント) の正本。
  Cloud (mcp channel) 非対応の注意も同ファイル冒頭に記載

---

## 注意事項

本文で繰り返し明示している原則 (read-only / CLAUDE.md 準拠 / canonical schema / 失敗 expert 続行 等) は省略。以下は誤運用で他スキルとの contract が壊れる原則のみを残す。

- **`--from-issue` の元 Issue は close しない**: 派生 Issue は元 Issue と 1:1 対応、close は op-merge の連動 close フェーズに委ねる。ここで close すると追跡が破壊される
- **Critical/High のみ起票**: noise 抑制の核心。判定基準は `_shared/severity-rubric.md` 厳守 (`--from-issue` のみ severity フィルタ無効化)

