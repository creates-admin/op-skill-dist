---
name: op-scan
description: デフォルト 6 expert (debug / refactor / optimize / security / ux-ui / design) を並列 spawn して観点別にコードベースを audit し、Critical/High だけを GitHub Issue として起票するスキル。test / feature は --include で追加。--from-issue で人間立て Issue を指示書フル版に正規化する。「スキャン」「op-scan」「監査」「Issue 起票」「正規化」等のキーワードで起動。
---

<!--
schema_version: 3
last_breaking_change: 2026-05-31
notes: 2026-07-22 追記 (ADR-0024 Phase 3 第二波) — Cloud (mcp channel) 対応。
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

## Expert Runtime and Routing Metadata Contract

/**
 * 機能概要: op-scan の scan-time spawn と Issue routing metadata の責務分離契約 (pointer のみ)。
 * 作成意図: 「scan で出力した recommended_expert / hidden marker = apply/fix 担当の確定」と
 *           誤読されないように scope を切る。詳細契約は `_shared/runtime-contract.md` を正本とする。
 * 注意点: planned expert を runtime spawn してはならない。本 SKILL.md でローカル列挙しない。
 */

op-scan の scan-time spawn と Issue routing metadata は責務が分離されている。
詳細契約は `skills/_shared/runtime-contract.md` を正本とする。本節は op-scan
固有の対応 point のみ示す。

- scan-time に runtime spawn 可能な expert は **active expert に限定**する。正本リストは
  `skills/_shared/active-expert-registry.md`
- planned expert (`env-expert` / `release-expert` / `compatibility-expert`) は
  scan-time / apply-time のいずれでも runtime spawn しない (`_shared/planned-experts.md`)。
  Utility Worker (`scout` / `spec-expert`) も op-scan の routing 対象外で scan-time に spawn しない
- Issue 本文に書き出す hidden marker (`op-run-expert` / `op-post-check-expert` ほか) と
  ラベル (`pro-*` / `needs:*` / `severity:*` ほか) は **routing recommendation** であり、
  op-run の apply/fix spawn を authorize しない。op-run は `runtime-contract.md` の
  判定優先順位で実 spawn 先を独立に再解決する
- `review-expert` は op-run フェーズ4 の global review 専任。op-scan は spawn せず、
  routing 値としても指定しない

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

### `--domain` の値

`--domain` には expert 名 (suffix `-expert` を省略してよい) をカンマ区切りで指定する:

```
debug, refactor, optimize, security, ux-ui, design, test, feature
```

alias マッピング:
- `ux` → `ux-ui` (使いやすさ番人、ux-ui-audit-expert を起動)
- `ui` → `ux-ui` (使いやすさ番人、ux-ui-audit-expert を起動)
- `ux-ui-audit` → `ux-ui` (suffix -audit を省略可)
- `designer` → `design` (suffix -er を省略可、designer-expert を起動)
- `theme` / `token` → `design` (designer-expert を起動)

つまり `--domain debug,ui,theme` は `--domain debug,ux-ui,design` と等価。

旧 ui-refactor-expert / ux-audit-expert への参照は op-scan 側で自動的に ux-ui-audit-expert に解決する。

> **責務分離**: `ux-ui` は **使いやすさ・a11y・必須 state** を見る (ux-ui-audit-expert)。
> `design` は **token / 共通 component / 視覚秩序** を見る (designer-expert)。
> 同一画面で両方が指摘を返すことはあり得る (例: focus 不可視 + token bypass) — その場合は両方起票してよい (フェーズ2 の重複統合ロジックで処理)。

`scope` はディレクトリパス。省略時はリポジトリ全体。

**scope 省略時の注意**: 大規模 repo での全体 scan は重く、ノイズも増える。
さらに **token コストが跳ねる** ことに注意する。scope 省略の full-repo は 1 区画として
complexity が `complex` / `critical` 判定に倒れやすく、`region.audit_model`
(model-selection.md §5.2: single/typical→sonnet, complex/critical→opus) が
**全 expert 一律 Opus** に解決される (full-repo × Opus 7 体 ≈ 1.39M tokens を観測)。
op-patrol は区画 (region) ごとに `region.audit_model` を per-region 解決するため、
広域監査でコストを抑えたいなら op-patrol が適切 (op-scan に区画自動分割は実装しない = op-patrol の責務)。

以下のいずれかを推奨:
- 監査したい範囲がはっきりしている → scope を指定 (区画が小さくなれば sonnet に落ちてコスト減)
- 観点だけ絞りたい → `--domain` を指定
- 「どこを見るべきか」自体を agent に任せたい → `op-patrol` を使用 (repo map と Patrol Ledger に基づく区画選定、per-region model 解決でコスト最適)

> **コスト確認 (対話モードのみ)**: scope 省略で対話起動した場合は、上記コスト構造を 1 回だけ
> 提示し「full-repo Opus で続行 / scope を絞る / op-patrol に切替」の選択肢をユーザーに確認する。
> **`--auto` / 非対話では確認を挟まず警告ログ出力のみ** に留め、自動フローを止めない
> (CLAUDE.md 不変則3)。過剰警告を避けるため警告は scope 省略時のみ・1 回に限定する。

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
フェーズ0 で `_shared/version-check.md` の手順に従い整合性を確認する (mismatch 時は warning + ユーザー確認)。

- `~/.claude/skills/_shared/runtime-contract.md` — runtime spawn / fallback / planned expert resolution の正本契約。op-scan の scan-time spawn と op-run の apply/fix spawn の責務分離もここで定義
- `~/.claude/skills/_shared/planned-experts.md` — planned expert (env / release / compatibility / spec) の正本リストと runtime spawn 禁止ポリシー
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
- `~/.claude/workflows/op-scan-audit.js` — フェーズ1 / `--from-issue` Phase 4 観点別並列 audit + 起票前 refute の Dynamic Workflow entry (ADR-0009 Phase C / C2)。controller が確定した expert list / scope / today を args 注入し、audit reader を並列 spawn (exploration-only) → normal mode は High/Critical を refute (偽陽性除去) して `{findings, verdicts}` を返す。args / 戻り値 schema は同ファイル冒頭コメントを正本とする
- `op-tools/docs/adr/0009-dynamic-workflows-for-op-fanout.md` — OP fan-out の Dynamic Workflows 移行決定 (Phase A/B/C、決定5 = フォールバック非保持 / fail-fast)。op-scan の audit fan-out 移行 (C2) の上位決定
- `op-tools/docs/adr/0010-workflow-script-distribution.md` — workflow script (`.js`) の repo 正本配置 (repo-root `workflows/`) と配布経路 (install-local.sh → `~/.claude/workflows/`、skill bundle 対象外 infra)

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

/**
 * 機能概要: フェーズ1 の観点別並列 audit は `op-scan-audit` Dynamic Workflow へ委譲されるため、
 *           Workflow tool (Dynamic Workflows) が利用可能かを起動直後に確認する。
 * 作成意図: ADR-0009 決定5 (フォールバック非保持 / fail-fast)。audit fan-out が workflow になった以上、
 *           capability 不在で warning + 続行すると silent に zero-findings となり「scan したが何も無かった」と
 *           誤認させる (= より悪い)。twin フォールバック (旧 single-message spawn 経路) は保持しない。
 * 注意点: これは 0-pre の schema_version mismatch の「warning に留める」慣習 (CLAUDE.md 不変則2) とは
 *         別レイヤー。schema_version は forward-compat 判断のため warning だが、capability 不在は
 *         audit そのものが実行不能なため hard-fail (即停止) する。
 */

司令官は Dynamic Workflows (`Workflow` tool) が当該セッションで利用可能かを確認する。
利用不可の場合は **即停止** し、以下の actionable message を提示する (audit を旧機構へフォールバックさせない):

> op-scan の観点別 audit は `op-scan-audit` Dynamic Workflow に依存します。現在のセッションで
> Dynamic Workflows が利用できません。Workflows を有効化したセッションで再実行するか、
> `~/.claude/workflows/op-scan-audit.js` が `scripts/install-local.sh` で同期済みか確認してください。

`--from-merged-pr` モード (フェーズ -1〜8) は audit fan-out を持たない (plan-mode 主体 + 決定論抽出) ため、
本 preflight の対象外。`--from-merged-pr` 経路では 0-2 を skip してよい。

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
   ※ security-expert は Phase 2 で active 化済み (subagent_type: security-expert で正式 spawn)。
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
 * 作成意図: 「Expert Runtime and Routing Metadata Contract」節の宣言と spawn 手順の整合を取り、
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
> 失敗時の挙動は exit code != 0 で停止し、SKIPPED_PLANNED 配列に保持する (silent skip 禁止)。
> controller の judgement で `grep` 等に代替してはならない (本 step は prescribed)。

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

# spawn list から registry-verify で error になった / JSON 取得失敗のエージェントを除外。
# 除外された expert は SKIPPED_PLANNED 配列に保持し、最終報告サマリに併記する
# (silent 除外をしない)。
```

skip 時の挙動 (詳細は `skills/_shared/runtime-contract.md` の fallback 規約に従う):

| ケース | 挙動 |
|-------|------|
| デフォルト 6 expert に planned が含まれる (例: env domain を `--domain` 拡張時に env-expert が planned) | silent skip (warning ログのみ)。`SKIPPED_PLANNED` を最終報告のサマリに併記する |
| `--domain <planned>` が明示指定され、対象 expert が planned (例: `--domain env`) | warning + 司令官 fallback scan (grep ベース audit) に切り替え。検出 finding には planned 名を **routing metadata として保持してよい** が runtime spawn はしない (Issue 起票時のラベルは `labels-and-markers.md` 参照) |
| `--domain` で planned のみ指定された場合 (例: `--domain env` のみ) | fallback scan を実行し、結果が空でも空配列で正常終了 |

`--domain security` 等の active expert は通常通り `subagent_type: <expert-name>` で正式 spawn する。
agent 実体が万一削除されている異常状態 (legacy guard) では、`runtime-contract.md` の fallback 規約に従い
司令官 fallback scan に切り替える。fallback の事実は、フェーズ3 のサマリと最終報告の両方に必ず明示する。

silent に「該当観点が見られた」ように振る舞ってはいけない。

### op-scan-audit Workflow 呼び出し

controller は「起動する expert の決定」+ installed check を通過した expert list を、各 model 確定値とともに
`op-scan-audit` workflow へ args 注入して呼ぶ。

```
// today は controller が `date -u +%F` で確定する (agent 側 date 実行禁止 = F2 対策)。
// experts は installed check 通過後の list。各 model は region.audit_model で確定 (model-selection.md §5.2)。
const auditOut = await Workflow({
  name: "op-scan-audit",
  args: {
    mode: "normal",                       // --from-issue 経路は フェーズ4 で mode: "from-issue"
    scope: "<フェーズ0 で確定した対象スコープ>",
    domain: "<--domain 指定時のみ>",       // 省略可
    experts: [ { name: "<expert-name>", model: "<region.audit_model 確定値>" } /* , ... */ ],
    audit_model: "<region.audit_model の fallback 既定値>",
    today: "<YYYY-MM-DD>",                // date -u +%F
    extra_directives: null,               // normal mode は null (--from-issue で controller が組み立て注入)
  },
});
// auditOut.findings = 全 expert の canonical scan-finding を flat 集約 (各 finding に detected_by / finding_ref 付与)
// auditOut.verdicts = normal mode の High/Critical finding に対する refute verdict (→ フェーズ1.5 で適用)
```

> **戻り値が barrier**: `auditOut.findings` / `auditOut.verdicts` は全 expert audit + refute が揃った状態で
> controller に返る。旧来の `run_in_background: true` + Monitor 完了待ち合わせは **不要** (workflow runtime が
> 完了を保証する)。spawn の prompt 本文・schema は `op-scan-audit.js` (`buildAuditPrompt` / `scanFindingSchema`) が
> 正本で、本 SKILL.md では重複保持しない。

> **戻り値アクセス: chat-controller は `.result.*` を掘る (#644-A)**: 上記擬似コードの `auditOut.findings`
> は **概念表記**。実際には chat Claude が Workflow tool を呼ぶと **background task として起動**し、
> task-notification の出力ファイルに `{ summary, logs, result: { findings, verdicts }, agentCount }` 形式で
> **`result` でラップ**されて返る。controller は `auditOut.result.findings` / `auditOut.result.verdicts` を
> 読む (`.findings` 直アクセスは空振りする。2026-06-02 実走で最初の jq が空振りした既知の躓きポイント)。
> in-script (named workflow 内) の同期戻り値とは経路が異なる点に注意する。

> **model 注入**: 各 expert の model は controller が `model-selection.md §5.2` (`region.audit_model`:
> single/typical→sonnet, complex/critical→opus) で確定し `args.experts[].model` に渡す。workflow 内で
> 推測・`date` 実行しない (op-run-discover が `cluster.model` を args 注入するのと同形、F2 対策)。

> **planned expert 除外**: installed check で除外された expert は `args.experts` に含めない。
> 除外した expert は `SKIPPED_PLANNED` として最終報告サマリに併記する (silent 除外をしない)。

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
 * 機能概要: `op-scan-audit` workflow の refute stage が返した `auditOut.verdicts` を、
 *           フェーズ2 (統合・dedup・enrichment) に入る前に finding 集合へ適用する。
 * 作成意図: 偽陽性を severity gate / dedup / enrichment (最大 8 spawn/Issue) の **前** で潰す
 *           (CLAUDE.md 不変則8「起票前 review」と同じ哲学)。
 * 注意点: refute は **finding ごとの偽陽性除去** であり、enrichment §6 の cross-review
 *         (issue_draft 全体の品質 review) とは別レイヤー (重複実装しない)。refute は normal mode のみ。
 */

`op-scan-audit` の戻り値 `auditOut.verdicts` を、各 finding に `finding_ref` で突合して適用する。

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

> **重要**: marker / ラベル定義は routing metadata であり spawn 権限を生まない (冒頭「Expert Runtime and Routing Metadata Contract」参照)。marker schema の正本は `skills/_shared/markers/labels-and-markers.md`。

#### 必須 marker (全 Issue 共通)

```markdown
<!-- op-fingerprint: <domain>:<short-id>:<primary_file>:<symbol> -->
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

> **planned expert (env / release / compatibility / spec) を marker 値に書き出す場合は metadata only**。
> op-scan は scan-time に planned expert を runtime spawn しない (本 SKILL.md 冒頭の Contract 節)。
> op-run 側の apply/fix 解決と post-check 起動も `skills/_shared/runtime-contract.md` /
> `skills/_shared/planned-experts.md` の規約に従い、planned expert は active fallback または
> `needs_human_decision` に倒す。本 SKILL.md でローカルの fallback 表をハードコードしない。

#### domain → marker パターン表 (canonical, op-scan/op-patrol 共通) {#domain-marker-patterns}

<!-- op-scan/op-patrol 間の複製を避けるため canonical 節として明確化 (Issue #318 Stage 1)。
     op-patrol/SKILL.md は Stage 2 (Issue #371) で本節への pointer 1 行に短縮済み。 -->

各 domain で op-scan が書き出す `op-run-expert` / `op-post-check-expert` の標準値:

| domain | op-scan-expert | op-run-expert | op-post-check-expert | 補足 |
|--------|---------------|---------------|----------------------|------|
| `debug` | debug-expert | debug-expert | `null` | post-check 不要 |
| `refactor` | refactor-expert | refactor-expert | `null` | 通常 |
| `refactor` | refactor-expert | refactor-expert | security-expert | file IO / path / capability / shell / secret 系 |
| `refactor` | refactor-expert | refactor-expert | ux-ui-audit-expert | UI state / user flow / a11y / visual 系 |
| `optimize` | optimize-expert | optimize-expert | `null` | post-check 不要 |
| `security` | security-expert | security-expert | security-expert | 検出も post-check も同 expert (op-run の判定優先順位 1-8 で apply を debug-expert に回す場合あり) |
| `ux-ui` | ux-ui-audit-expert | designer-expert | ux-ui-audit-expert | 使いやすさ番人 → 美しさ番人 で実装 |
| `design` | designer-expert | designer-expert | ux-ui-audit-expert | UI files を触る場合 |
| `design` | designer-expert | designer-expert | `null` | 非 UI 配置 (token / config) |
| `test` / `feature` (UI 影響なし) | test/feature-expert | test/feature-expert | `null` | additive 検出 |
| `feature` (UI 影響あり) | feature-expert | feature-expert | ux-ui-audit-expert | silent な UX 退化防止 |
| `env` (planned) | env-expert | env-expert | env-expert | routing metadata only。runtime spawn しない |

refactor の post-check 選択条件詳細は
`skills/expert-refactor/references/post-check-policy.md` を参照する。
planned expert (env / release / compatibility / spec) は scan-time / apply-time
いずれでも runtime spawn しない。fallback / `needs_human_decision` 化は
`skills/_shared/runtime-contract.md` および `skills/_shared/planned-experts.md` の規約に従う
(op-scan 側でハードコードしない)。

> feature-expert が apply するが、UI 状態 / a11y / 復帰可能性 / 画面遷移に影響する場合は、
> post-check に `ux-ui-audit-expert` を必ず指定する (silent な UX 退化防止)。

marker の値は **canonical schema (`_shared/expert-spawn.md`) の `recommended_runner` / `post_check_expert` を機械的に転写する**。
expert が schema 上で `recommended_runner` を返さなかった場合は、op-scan が domain → 標準 runner 表 (上記) で補完する。

> ここで marker に書き出す `recommended_runner` / `post_check_expert` (= `recommended_expert` 一般) は
> **routing recommendation** であり、op-run の apply/fix runtime spawn を authorize しない (本 SKILL.md 冒頭の
> 「Expert Runtime and Routing Metadata Contract」を参照)。op-run は `skills/_shared/runtime-contract.md` の
> 判定優先順位で実 spawn 先を独立に再解決する。

#### ラベル付与

- `auto-report` (op-scan / op-patrol 共通)
- `severity:critical` または `severity:high` (severity ラベルは `severity:*` 形式に統一。clustering.md は旧 `critical` / `high` も互換読みする)
- `pro-<expert>-expert` ラベル (例: `pro-debug-expert`、apply 担当に対応)
- ux-ui / design Issue で post-check が必要なら `pro-ux-ui-audit-expert` を追加
- **security domain Issue は基本 `pro-security-expert` (apply 兼 post-check) 1 つで起票する**。op-run の判定優先順位 1-8 で apply を debug-expert に回す場合は `pro-debug-expert` (apply) + `pro-security-expert` (post-check) の両方を付与する
- **feature domain Issue で feature-expert が apply するが、UI 状態 / a11y / 復帰可能性 / 画面遷移に影響する場合は、`pro-feature-expert` (apply 担当) と `pro-ux-ui-audit-expert` (post-check 担当) の両方を必ず付与する** (silent な UX 退化防止)
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

各 `op issue create` の **直前** に、組み立てた Issue body の hidden marker を fail-fast で検証する
(`_shared/expert-spawn.md` の **Marker Publish Validate 節** が正本)。
marker の typo / 必須フィールド漏れ / format drift を起票前に検出する。

```bash
# BODY_FILE = 起票する Issue 本文 (hidden marker 埋め込み済、enrichment 反映後)。
# marker 名・schema の参照は `op help marker <name>`。block 条件は op core marker-lint --strict。
LINT_JSON=$(op core marker-lint --body - --source-hint issue-body --strict < "$BODY_FILE" 2>/dev/null) || true
LINT_DECISION=$(printf '%s' "$LINT_JSON" | jq -r '.decision' 2>/dev/null)
if [ "$LINT_DECISION" != "pass" ]; then
  echo "❌ marker-lint block: $(printf '%s' "$LINT_JSON" | jq -c '.blocking_reasons // []' 2>/dev/null)"
  echo "→ hidden marker を修正してから再起票する。block された draft は起票せず manual_review_bucket / escalation に回す"
  # 対話モードはユーザーに提示して停止、--auto は manual_review_bucket に退避 (フェーズ2-4 の block 退避と同列)
fi
# LINT_DECISION == "pass" のときのみ op issue create に進む
```

> **`||` で握り潰さない**: `LINT_DECISION` を jq で取り出し `pass` を明示確認してから `op issue create` する
> (memory `feedback_op_review_meta_reviewer_field_required`: `op ... || fallback` だと block でも投稿が通ってしまう)。
> 直列 `op issue create` (1 draft = 1 invocation、並列化禁止) はフェーズ5/Phase 7 の起票規約を踏襲する。

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

## `--from-issue` モード詳細 (Issue 正規化)

人間立て Issue / 古い形式 Issue を **指示書フル版に正規化した派生 Issue** として再起票するモード。
op-run のフェーズ1.5 から委譲呼び出しされることを主用途とするが、単独でも使える。

```
/op-scan --from-issue #42
/op-scan --from-issue #42 --auto              # 承認スキップ
/op-scan --from-issue #42 --domain debug      # 起動 expert を絞る
```

### なぜ別モードか

通常 op-scan は「コードを起点に問題を検出 → 起票」だが、`--from-issue` は
「**既存 Issue を起点に scope を推定 → audit → 指示書フル版で再起票**」という
逆向きフロー。severity / Patrol Finding Policy 等の前提も異なるため、
通常モードと混在させずに専用モードとして分離する。

### 1. 元 Issue 取得

`op issue view "$ISSUE_NUM" --include meta --json` で title / body / labels / state を 1 fetch で取得する。
内部実装は ADR-0005 の `FetchSession::pull_issue_meta` / `pull_issue_comments`
(`crates/op/src/commands/issue.rs`)。`--include` で取得対象を絞れる
(`meta` / `comments` / `both`、default は `both`)。

state が `closed` / 既に `superseded-by-scan` ラベル付きならエラーで中断する
(同じ Issue を二重正規化しない)。

mcp channel では `op issue view` が fail-closed するため、司令官が `mcp__github__issue_read`
(method: get) で直接取得する。hidden marker は sanitize されるが、scope 推定は可視 body / labels
のみに依存するため成立する (marker 依存の照合はしない、`github-channel.md` §6)。

### 2. scope 推定

元 Issue から以下の手順で scope を推定する。

| 信号 | 抽出方法 | 重み |
|------|---------|-----|
| ラベル `module:xxx` | `gh issue view --json labels` | 高 (確定的) |
| 本文中のファイルパス | `grep -oE '[a-zA-Z0-9_/-]+\.(rs\|ts\|tsx\|vue\|dart\|py)'` で抽出 | 高 |
| 本文中のディレクトリ言及 | `grep -oE 'src[/-][a-zA-Z0-9_/-]+/'` 等 | 中 |
| タイトル中のモジュール名 | `auth`, `export`, `login` 等のキーワード照合 | 中 |
| ラベル `area:xxx` | op-patrol 由来の area ラベル | 中 |
| 本文中の Tauri command 名 | `#[command]`, `invoke('xxx')` | 中 |

**scope 推定不能** (上記すべて空) の場合:
- 元 Issue にコメントで「op-scan が scope を推定できませんでした。本文に対象ファイル / モジュール名を追記してください」と返信
- 終了 (派生 Issue は起票しない)

### 3. expert 絞り込み

scope が推定できたら、`op-patrol` の **area → expert マッピング** (op-patrol/SKILL.md フェーズ4) を流用して
1〜3 expert に絞る。`--domain` 指定時はそれを優先。
判定不能なら `debug-expert` + `refactor-expert` の 2 体で進める。

ラベルからの追加ヒント:
- `bug` / `defect` → debug-expert を必ず含める
- `security` / `vulnerability` → security-expert を必ず含める
- `performance` / `slow` → optimize-expert を必ず含める
- `ux` / `ui` / `usability` / `accessibility` → ux-ui-audit-expert を必ず含める
- `design` / `theme` / `token` / `design-system` → designer-expert を必ず含める
- `feature` / `enhancement` / `new` → feature-expert を必ず含める
- `refactor` / `cleanup` / `tech-debt` → refactor-expert を必ず含める

> ラベルが `ux` と `design` の両方を含む場合 (例: 「使いにくい上にダサい」) は、両方の expert を spawn する。
> 結果統合はフェーズ2-1 の重複ルールに従う (使いやすさ優先)。

### 4. read-only audit (op-scan-audit Workflow、severity フィルタ無効化)

選定した expert を `op-scan-audit` workflow へ `mode: "from-issue"` で委譲する。元 Issue の番号 / タイトル / 本文を
structured args で渡し、severity フィルタ緩和等の追加指示は `args.extra_directives` に組み立てて注入する
(workflow が `buildAuditPrompt` の末尾に結合する)。**from-issue mode は refute stage を skip する**
(人間 Issue の正規化であり偽陽性除去は不適切、`auditOut.verdicts` は `[]`)。

```
const auditOut = await Workflow({
  name: "op-scan-audit",
  args: {
    mode: "from-issue",
    scope: "<Phase 2 で推定した scope>",
    experts: [ { name: "<Phase 3 で選定した expert>", model: "<region.audit_model>" } /* , ... */ ],
    audit_model: "<region.audit_model の fallback 既定値>",
    today: "<YYYY-MM-DD>",                 // date -u +%F
    from_issue_number: <元Issue番号>,
    from_issue_title: "<元タイトル>",
    from_issue_body: "<元本文の全文>",
    extra_directives: "<↓ severity 緩和ブロックを controller が組み立てる>",
  },
});
// auditOut.findings = 派生 Issue 化する候補。auditOut.verdicts は from-issue では [] (refute skip)。
```

`extra_directives` に組み立てる severity 緩和ブロック (旧 spawn テンプレ追加指示と同内容):

```
推定 scope: <推定したファイル / モジュール一覧>

このモードは元 Issue が起票時点で意味のある問題を含んでいることを前提とする。
通常モードの「Critical/High のみ報告」制約を **緩和** し、以下を含めて報告してよい:
  - severity = critical / high / medium / low (元 Issue が要求するなら medium も起票対象)
  - feature 追加要望 (severity 概念に当てはまらない場合は severity = "n/a")
  - refactor 提案 (元 Issue が refactor を求めている場合)
ただし以下は依然禁止:
  - 推測のみで根拠のない指摘
  - 元 Issue と無関係な領域の指摘 (scope 外)
  - CLAUDE.md 規約に従うコードへの「規約違反」指摘
元 Issue の意図 (バグ修正 / 機能追加 / リファクタ) を fingerprint と recommendation に必ず反映する。
```

### 5. 派生 Issue 起票 (指示書フル版)

`_shared/pr-templates.md` の **指示書フル版** で起票する。本文冒頭に hidden marker:

> **enrichment 経路の遵守**: `--from-issue` 経路でも、派生 `issue_draft` は通常モードと同じく
> フェーズ 2-4 (enrichment) を必ず通す (proposal 3.7.1 不変則)。`--no-enrichment` 指定時のみ
> skip。block 判定なら派生 Issue を起票せず、元 Issue に「enrichment で block されました」と
> コメント返信する (元 Issue 本体・`superseded-by-scan` ラベルは触らない、二重正規化保護は維持)。

```markdown
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-source: op-scan -->
<!-- op-mode: from-issue -->
<!-- op-derived-from: #<元Issue番号> -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert (canonical schema の recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | null> -->
```

> `op-domain` 値の domain 列挙・expert マッピング詳細は本 SKILL.md §domain-marker-patterns を参照。

> `op-post-check-expert` の null 出力義務は § `#### 必須 marker (全 Issue 共通)` を参照。

ラベル:
- `auto-report` (op-run が拾う)
- `derived-from-issue` (派生 Issue であることを示す)
- `severity:critical|high|medium|low|n/a` (適切なもの)
- 元 Issue から継承可能なラベル (例: `module:xxx`, `bug`, `feature`)

検出が複数になった場合 (audit で副次的問題が見つかった場合):
- 元 Issue の **本来の意図に最も近い検出を 1 件のみ派生 Issue 化**
- それ以外の検出は通常の op-scan 起票として別ラベル (`auto-report` のみ、`derived-from-issue` なし) で起票
- 派生 Issue は元 Issue 1 件 → 派生 Issue 1 件の 1:1 対応を保つ (op-merge の連動 close を単純化するため)

### 6. 元 Issue へのコメント + ラベル

元 Issue へのコメント本文は固定テンプレで生成する (派生 Issue 番号 `${NEW_ISSUE}` を埋め込む)。
本文を `--body-file` 経由で渡し、生成中の文字列 escape 事故を避ける:

> 🔍 op-scan が指示書フル版を #${NEW_ISSUE} として起票しました。
>
> この Issue は op-run で実装可能な形式に正規化された派生 Issue (#${NEW_ISSUE}) に
> 置き換えられます。今後の議論・実装は派生 Issue 側で進んでください。
>
> 派生 Issue がマージされたら、op-merge がこの Issue を一緒に close するか確認します。

op CLI 呼び出し手順:

- `op issue comment "$ISSUE_NUM" --body-file "<tmp>"` でコメント投稿
- `op issue edit-add-label "$ISSUE_NUM" --label "superseded-by-scan"` でラベル付与 (close しない)

`op issue edit-add-label` は内部で gh issue edit --add-label を 1 invocation = 1 FetchSession で呼ぶ。
ラベル `superseded-by-scan` の repo への新規作成 (gh label create) は op CLI 経由では行わない
(gh CLI 側で repo 設定済の前提)。未設定時の挙動は gh エラー → SKILL.md 側で対話案内。

mcp channel では `op issue edit-add-label` の**直前に fresh な `mcp__github__issue_read` (method: get)
を取り直して** `--input-json` で渡す (手順 1 の snapshot を再利用しない — `issue_write` の labels は
**全置換 semantics** のため、古い素材だと取得後に付いた label が silent に消える)。emit された
call-spec は `github-channel.md` §3-§4 の protocol (verbatim 実行 → read-back → ingest) で完遂する
(comment は従来どおり)。

**元 Issue を自動 close しない理由**:
- 人間が立てた Issue を機械が勝手に close するのは強い権限
- 派生 Issue の実装中に元 Issue 側で議論が続く可能性がある
- close は op-merge の連動 close フェーズでユーザー判断を仰ぐ

### 7. 完了報告 (--from-issue 専用)

```
## op-scan --from-issue 完了

### 入力
- 元 Issue: #42 "ログイン画面で時々落ちる"

### 推定 scope
- src-tauri/src/auth/login.rs (本文中言及)
- src-tauri/src/auth/session.rs (label module:auth から推定)

### 起動 expert
- debug-expert (label `bug` から)
- security-expert (auth 領域のため)

### 起票結果
- 派生 Issue: #87 "auth/login: 不正トークン処理での panic 修正"
  - severity: high
  - fingerprint: debug:panic-on-invalid-token:src-tauri/src/auth/login.rs:verify
  - 元 Issue: #42 (superseded-by-scan ラベル付与済み)

### 副次検出 (別 Issue として起票)
- なし

次は `/op-run` で派生 Issue (#87) を実装可能です。
```

### `--from-issue` 時の注意

- **severity フィルタ無効化** は `--from-issue` モードでのみ。通常モード / `--auto` / op-patrol の policy には影響しない
- **副次検出は 1:1 維持のため別 Issue 化**。派生 Issue (`derived-from-issue` ラベル) は 1 元 → 1 派生
- **fingerprint 重複判定は通常通り**。派生 Issue が既存 open Issue と被ったら起票せず、元 Issue にコメントで「既存 #N と同等のため、そちらで進めてください」と返信
- **scope 推定不能なら静かに終了**。元 Issue にコメントで scope 追記を依頼するのみ
- **元 Issue が既に closed / superseded-by-scan ラベル付きなら中断**。二重正規化を防ぐ
- **--auto 時も派生 Issue は起票する** (元 Issue が起票時点で人間判断を経ているため)
- **enrichment フェーズ (2-4) は走る**。`--no-enrichment` 指定時のみ skip。`--strict-enrichment` / `--with-cross-review` も通常モードと同様に有効

---

## `--from-merged-pr` モード詳細 (follow-up Issue 半自動起票)

> **Cloud (mcp channel) 非対応**: 素材 (完了報告 / review-finding marker) は PR コメント内にあり、
> MCP のコメント read は hidden marker を sanitize するため成立しない (`github-channel.md` §6)。
> ローカル (gh channel) で実行すること。fence は fail-closed で停止する。

/**
 * 機能概要: merged PR から残存リスク / review-finding / post-check Notes を抽出し、
 *           enrichment + plan モード承認を経て follow-up Issue を半自動起票するモード。
 * 作成意図: op-run + op-merge 完了後、派生する follow-up Issue を毎回手動起票している
 *           コスト (今回 cycle で #103-#110 の 8 件を Claude が手動起票) を削減する。
 *           Phase A (pr-meta-helpers.md canonical 化) の上に乗る Phase C として設計。
 * 注意点: op-source は現時点で op-scan を流用する。
 *         Phase E (#128) 完了後に `op-scan-from-merged-pr` への切替を別 PR で対応する予定。
 *         §7.5 collision gate は --no-enrichment でも bypass 不可 (silent fork 防止の最重要 contract)。
 */

merged PR から 7 source field を抽出し、plan モード承認後に follow-up Issue を起票する。
`_shared/pr-meta-helpers.md (>=1)` の helper 群を再利用して PR メタを取得し、
`_shared/issue-enrichment.md (>=2)` §7.5 collision gate を必ず通す。

```
/op-scan --from-merged-pr <PR>                    # 単一 PR
/op-scan --from-merged-pr <PR1> <PR2> ...         # 複数 PR (空白区切り)
/op-scan --from-merged-pr --since <ISO8601>       # 指定日時以降の merged PR を batch
/op-scan --from-merged-pr <PR> --dry-run          # 起票せずコマンド表示
/op-scan --from-merged-pr <PR> --no-enrichment    # collision gate のみ、cross-review skip
```

### なぜ別モードか

通常 op-scan は「コードを起点に問題を検出 → 起票」だが、`--from-merged-pr` は
「**merged PR の完了報告 / review-finding / post-check から派生 follow-up を抽出 → 起票**」という
別の情報ソースから起票するフロー。plan モード承認で人間 gate を必ず挟む点で `--from-issue` とも異なる。

### Phase -1: プランモード自動遷移

司令官は本モード起動直後に `EnterPlanMode` tool を呼ぶ。
以降の Phase 0〜5 (環境確認 / PR メタ取得 / follow-up 抽出 / fingerprint / enrichment / plan file 書き出し) が
Claude Code の plan mode 下で進行し、**Edit / Write / Bash の書き込み系が権限機構レベルでブロック**される
(op-plan/SKILL.md フェーズ -1 と同パターン、bundled `/batch` と同方式)。

#### plan mode 状態判定

- `EnterPlanMode` を呼んでユーザーが Yes → plan mode 入りを記録し Phase 0 へ
- ユーザーが No → read-only 規律を SKILL.md 内の指示で守りつつ Phase 0 へ (機能停止しない)
- 既に plan mode に居る場合は no-op として扱われ Phase 0 へ直進 (冪等)

#### plan mode 下での許可 / 禁止操作

| 許可 | 禁止 |
|------|------|
| `Read` / `Grep` / `Glob` (探索) | `op issue create` / `op issue comment` / `op pr comment` 等の write 系 |
| `op pr view` / `op issue view` 等の read-only op CLI コマンド | `Edit` / `Write` / `Bash` 書き込み系 |

### Phase 0: 環境確認 + PR 状態確認

env precondition (git / gh auth) は cwd ローカル前提のため CLI 化対象外。
フェーズ 0-1 の env check (本 SKILL.md 上部) と同じ手順を採用し、
失敗時は `--dry-run` で続行できる旨を案内する。

PR 状態の確認は op CLI 経由で行う:

```bash
PR_STATE=$(op pr view "$PR_NUM" --include meta --json | jq -r '.state')
if [ "$PR_STATE" != "MERGED" ]; then
  echo "エラー: PR #${PR_NUM} は ${PR_STATE} 状態です。--from-merged-pr は MERGED PR のみ対象です。" >&2
  echo "open PR / draft PR は対象外 (race condition 防止)。"
  exit 1
fi
```

open PR / draft PR を渡された場合は明示エラーで中断する (race condition 防止)。
内部実装は ADR-0005 の `FetchSession::pull_pr_meta` を 1 fetch で呼ぶ。

`--since <ISO8601>` 指定時は `op pr list-merged --since` で対象 PR を列挙する
(client-side で `mergedAt >= since` filter、内部 `FetchSession::list_merged_prs` を呼ぶ):

```text
op pr list-merged --since "$SINCE" --limit 30 --plain
```

`--limit 30` を明示することで context 爆発を防ぐ (Issue #193)。
大規模 repo で `--since` を省略または古い ISO 日付を指定すると全件取得になる恐れがあるため、
SKILL.md 経路では `--limit 30` を推奨上限値として明示する (30 は gh CLI の default 値を踏襲)。
より多くの PR が必要な場合は `--limit N` を適宜調整する。

`--plain` 明示で 1 行 1 PR 番号の plain mode (shell pipe で `while read` できる)。
default ないし `--json` 明示で `[{number, mergedAt}, ...]` の top-level JSON 配列を返す
(#278 option B で default を JSON envelope に揃えた。`--json` は backwards compat のため残置)。

### Phase 1: trusted PR メタ抽出

`_shared/pr-meta-helpers.md (>=1)` の helper 群を参照して PR メタを取得する。
**helper の実装を本 SKILL.md に duplicate しない** (Single Canonical Source Rule)。

`extract_latest_trusted_review_meta` / `extract_latest_trusted_post_check_meta` /
`get_meta` 等の関数定義は `_shared/pr-meta-helpers.md` § 1〜3 を正本とし、本 SKILL.md
からは関数名で呼び出すだけにとどめる。`TRUSTED_REVIEW_AUTHORS` の default / additive
規約 (§ 1)、`review_meta` / `review_result` / `security_kv` / `security_notes` /
`security_result` / `ux_kv` / `ux_notes` / `ux_result` の取得 (§ 2-3) はすべて pr-meta-helpers.md
を参照する。helper の CLI 化は別 wave で扱い、本 wave では従来通り bash 関数として呼び出す。

PR 本文・全コメント・全 commit body の取得は `op pr view --include body-comments-commits --json`
を 1 fetch で実行する (内部実装は ADR-0005 の `FetchSession::pull_pr_body_with_comments_commits`、
gh_calls 圧縮の core 経路):

```text
PR_VIEW_JSON=$(op pr view "$PR_NUM" --include body-comments-commits --json)
PR_BODY=$(printf '%s' "$PR_VIEW_JSON" | jq -r '.body')
PR_COMMENTS=$(printf '%s' "$PR_VIEW_JSON" | jq -r '[.comments[]? | try .body // .] | join("\n---\n")')
PR_COMMITS=$(printf '%s' "$PR_VIEW_JSON" | jq -r '[.commit_message_bodies[]?] | join("\n---\n")')
```

> `op pr view --include body-comments-commits` は 1 fetch で body / comments[] /
> reviewComments[] / commits[].messageBody を一括取得する。個別 3 fetch する旧 bash
> 実装 (gh pr view を body / comments / commits ごとに 3 回呼ぶ) は `gh_calls` soft
> ceiling 200 を不必要に圧迫するため廃止。

### Phase 2: follow-up source 抽出 (7 field)

以下の 7 source field を PR 本文・コメント・commit body から抽出する。
各 field が空の場合はスキップ (draft を生成しない)。

| Source field | 抽出元 | severity default | domain 推定 |
|--------------|--------|-----------------|------------|
| `recommended_followup_experts[]` | apply 完了報告 (PR 本文 / commit body の完了報告節) | medium | 当該 expert の domain |
| `needs_human_decision` (boundary) | 完了報告 `needs_human_decision` 節 | high | needs_human_decision として apply blocked |
| `needs_human_decision` (scope/behavior) | 同上 | medium | 同上 |
| `proposed_stages[1+]` | commit body `proposed_stages` 節 (staged_refactor の残 Stage) | medium | refactor (staged_refactor 由来) |
| `<!-- op-review-finding -->` scope:new-issue | PR コメントの review-finding block | finding 継承 | finding lens → expert mapping |
| `<!-- op-post-check-meta -->` Notes (PASS_WITH_NOTES) | PR コメントの post-check-meta block | low | post-check expert の domain |
| `assumptions[]` (未解消) / `blocked_actions[]` | 完了報告節 | low | apply expert の domain |
| `## 残存リスク / follow-up` section bullet (Issue #213) | PR 本文 / commit body の自由 markdown section | low | parent PR の `op-domain` (取得不可なら `unknown`) |

> **followup_section 抽出 (Issue #213, #473)**: heading alias `残存リスク` /
> `残存リスク / follow-up` / `残存リスク・follow-up` / `Remaining Risk` /
> `Follow-up` を H2〜H6 の任意 heading level で検出し、直後の bullet list
> (`-` / `*` / `1.`) を 1 hit = 1 bullet で抽出する。
> H2 (`## `) のみでなく H3 (`### `) / H4 (`#### `) 等も対象 (Issue #473 修正)。
> 「なし」「無し」「N/A」「— なし —」「-」のみ等 no-op 表現は 0 hit。severity は決定論で固定 `low`
> (LLM 推定不要)、domain は parent PR の `op-domain` を caller 側で transfer する

#### 抽出手順

7 source field の抽出は `op core extract-pr-markers` を 1 invocation で実行する。
内部実装は pure 関数 `op_core::scan::pr_markers::extract_pr_markers` で、
LLM 解釈ゼロ / 同じ入力なら必ず同じ出力 (決定論)。

```text
# 0. Phase 2 開始前に配列を初期化 (Phase 3 で使用する蓄積バッファ)
FINDING_DRAFT_FILES=()
# OP_RUN_REPO: op-run 経由なら export 済みだが、スタンドアロン実行では未設定のため動的解決
: "${OP_RUN_REPO:=$(git remote get-url origin 2>/dev/null | sed 's|https://github.com/||; s|git@github.com:||; s|\.git$||')}"

# 1. Phase 1 で取得した PR_VIEW_JSON から extract-pr-markers の input 形式を組み立て
EXTRACT_INPUT=$(mktemp /tmp/op-scan-extract-input-XXXXXX.json)
printf '%s' "$PR_VIEW_JSON" | jq '{
  pr_body: .body,
  pr_comment_bodies: .comments,
  commit_message_bodies: .commit_message_bodies
}' > "$EXTRACT_INPUT"

# 2. 7 source field を一括抽出 (--plain で hits 配列のみ stdout)
HITS_JSON=$(op core extract-pr-markers --input-json "$EXTRACT_INPUT" --plain)
rm -f "$EXTRACT_INPUT"

# 3. hits を source_kind 別に処理 (caller が follow-up draft に変換)
# source_kind:
#   recommended_followup_experts / needs_human_decision / proposed_stages /
#   review_finding_new_issue / post_check_notes / assumptions / blocked_actions /
#   followup_section (Issue #213: `## 残存リスク / follow-up` 自由 markdown bullet)
HITS_RFE=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "recommended_followup_experts")]')
HITS_NHD=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "needs_human_decision")]')
HITS_PS=$(printf '%s' "$HITS_JSON"  | jq -c '[.[] | select(.source_kind == "proposed_stages")]')
HITS_RFNI=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "review_finding_new_issue")]')
HITS_PCN=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "post_check_notes")]')
HITS_ASM=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "assumptions")]')
HITS_BA=$(printf '%s' "$HITS_JSON"  | jq -c '[.[] | select(.source_kind == "blocked_actions")]')
HITS_FS=$(printf '%s' "$HITS_JSON"  | jq -c '[.[] | select(.source_kind == "followup_section")]')

# 4. 各 hit を draft JSON ファイルに書き出し、FINDING_DRAFT_FILES に追加
#    (HITS_* を iterate して draft を生成する caller 実装例)
# DRAFT_FILE=$(mktemp /tmp/op-scan-draft-XXXXXX.json)
# printf '%s' "<draft_json>" > "$DRAFT_FILE"
# FINDING_DRAFT_FILES+=("$DRAFT_FILE")
```

> **post-check Notes について**: `post_check_notes` 種別の hit は raw_text が自然文。
> follow-up severity 推定は LLM に委ねるが、`severity:low` + 「LLM 推定」を必ず draft body に明記。
> `post_check_notes` 自体の検出 (PASS_WITH_NOTES marker と notes block の境界) は
> pure 関数で決定論。

> **review_finding 抽出**: `<!-- op-review-finding ... -->` 1 block を 1 hit に変換し、
> `scope: new-issue` を含む block のみ残る (`_shared/markers/review-markers.md` 整合)。

> **proposed_stages 抽出**: `Stage [2-9]` または `stage_[2-9]` を含む block のみ hit
> (Stage 1 のみは通過)。staged_refactor の残 Stage を follow-up 化する。

### Phase 3: fingerprint 生成 + dedup

`_shared/dedup-policy.md (>=3)` の fingerprint 生成規約に従い、各 draft の fingerprint を生成する。
既存 open Issue と重複する draft はスキップし、plan file に「既存 #N と重複」として記録する。

```bash
# --findings-json 一括呼び出し (PR #283 Stage B):
#   N 件の finding draft を 1 invocation で dedup 判定し、gh fetch を N 回 → 1 回に集約する。
#   手本: op scan bulk-group の --findings-json amortize 設計 (SKILL.md §2-1-b) を踏襲。
#
# 注意: N=0 (空配列) のときは op scan dedup は fail-closed にならず decision: pass を返す。
#       controller 側で drafts が空か否かを事前確認し、空なら Phase 3 全体を skip することを推奨。
#
# FINDING_DRAFT_FILES: 各 finding draft の JSON ファイルパスを格納した bash 配列

# 1. 全 draft を JSON 配列化して一時ファイルに保存 (jq -s で配列化)
FINDINGS_JSON_PATH=$(mktemp /tmp/op-scan-findings-XXXXXX.json)
jq -s '.' "${FINDING_DRAFT_FILES[@]}" > "$FINDINGS_JSON_PATH"

# 2. 一括 dedup 判定 (gh fetch 1 回で全件照合)
DEDUP_RESULT=$(op scan dedup \
  --findings-json "$FINDINGS_JSON_PATH" \
  --repo "$OP_RUN_REPO" \
  --json 2>/dev/null)
rm -f "$FINDINGS_JSON_PATH"

# 3. 各 finding の判定結果を index 別に dispatch
#    .details.results[] を iterate し、pass なら PASS_INDICES に記録、block なら plan file に記録
#    PASS_INDICES: dedup を通過した finding の index 配列。Phase 4 で FINDING_DRAFT_FILES[$i] を
#                 取り出すために使用する。
PASS_INDICES=()
RESULTS_COUNT=$(printf '%s' "$DEDUP_RESULT" | jq -r '.details.results | length' 2>/dev/null)
if [ -z "$RESULTS_COUNT" ] || [ "$RESULTS_COUNT" = "null" ]; then
  echo "dedup 取得失敗: 全 finding を fail-closed で block 扱い"
else
  for i in $(seq 0 $(( RESULTS_COUNT - 1 ))); do
    ITEM_DECISION=$(printf '%s' "$DEDUP_RESULT" | jq -r ".details.results[$i].decision" 2>/dev/null)
    ITEM_FINGERPRINT=$(printf '%s' "$DEDUP_RESULT" | jq -r ".details.results[$i].fingerprint" 2>/dev/null)
    case "$ITEM_DECISION" in
      pass)  PASS_INDICES+=("$i") ;;  # Phase 4 対象として index を記録
      block) echo "dedup block[$i] ($ITEM_FINGERPRINT): 既存 Issue と重複 (plan file に記録)" ;;
      *)     echo "dedup 想定外値[$i] ($ITEM_DECISION / $ITEM_FINGERPRINT): fail-closed で block 扱い" ;;
    esac
  done
fi
```

重複判定結果 (finding 単位):
- `pass` → Phase 4 (enrichment) へ進む
- `block` → draft をスキップし、plan file に「既存 Issue と重複 (dedup block)」として記録
- その他 / 取得失敗 → fail-closed で block 扱い (DedupResult は NoMatch / Matched の 2 値のみ、`warn` は存在しない)

### Phase 4: enrichment 呼び出し

Phase 3 の `PASS_INDICES` 配列を使い、dedup を通過した finding のみを enrichment に渡す:

```bash
# PASS_INDICES に記録された index を順に処理し、対応する draft ファイルを enrichment に渡す
for i in "${PASS_INDICES[@]}"; do
  DRAFT_FILE="${FINDING_DRAFT_FILES[$i]}"
  # _shared/issue-enrichment.md (>=2) §3 の input contract に従って enrichment を呼び出す
  # (collision gate は --no-enrichment 時も必須、Phase 5 前に collision_gate.verdict を確認)
done
```

`_shared/issue-enrichment.md (>=2)` §3 の input contract に各 draft を渡す。

**重要**: §7.5 Cross-instance Collision Gate は `--no-enrichment` 指定時でも **bypass 不可**。
これは silent fork 防止の最重要 contract。

`--from-issue` モードと同一の enrichment flag 規約を踏襲する:

- `--no-enrichment` → enrichment 全体を skip するが、collision gate のみは実行する
  (enrichment 全体の skip ≠ collision gate の skip)
- `--strict-enrichment` → block 判定時に対象 draft を起票せず、plan file に
  escalation 記録に回す
- `--with-cross-review` → severity Critical 以下でも cross-review 実行

具体的な enrichment 層への入出力 (UI 影響判定 / Design Plan gate / cross-review 表 /
max_review_loops / collision gate verdict) は `_shared/issue-enrichment.md (>=2)` を
正本として参照する (本 SKILL.md では再記述しない、Single Canonical Source Rule)。

`collision_gate.verdict` の確認:
- `pass` → Phase 5 へ進む
- `warn` → `collision_gate.similar_issues` を plan file に表示 (ユーザーが Phase 6 承認時に判断)
- `block` → draft を plan file の「起票ブロック」欄に移動し、理由を記録

### Phase 5: plan file 書き出し

`ExitPlanMode` への引き継ぎ前に plan file を書き出す。
path は `~/.claude/plans/op-scan-followup-PR<N>-<YYYYMMDD-HHMMSS>.md`。

plan file 構成 (markdown):

1. ヘッダ「op-scan --from-merged-pr: follow-up 起票予定」 + 対象 PR (番号 / タイトル / 実行日時)
2. サマリテーブル: `# / タイトル / domain / severity / fingerprint / collision (pass/warn/block)`
3. 起票予定 Issue 詳細: 各 draft を `<details><summary>` で folding し、Labels / Body
   (`enriched_issue.body` 全文) を内側に展開
4. スキップ (重複) テーブル: `fingerprint / 既存 Issue`
5. 起票ブロック (collision gate block) テーブル: `fingerprint / 理由`
6. 起票後の実行ステップ (Phase 7 で実施): 承認された draft を `op issue create --body-file`
   で起票 → `op issue comment` で post_create_comments 追加 → 親 PR に trace コメント (optional)

複数 PR batch 時 (10 PR で 30-50 draft になる可能性) は summary table を先頭に置き、
各 draft の詳細を `<details>` タグで folding する。

### Phase 6: ExitPlanMode 承認

司令官は plan file を準備した後 `ExitPlanMode` tool を呼ぶ。ユーザーに以下の承認オプションが提示される:

| 承認オプション | 挙動 |
|---|---|
| **Approve and accept edits** (推奨) | `acceptEdits` モードに遷移し、Phase 7 (gh issue create + trace コメント) が permission prompt なしで進行する |
| Approve and start in auto mode | auto mode でフェーズ 7 を実行 |
| Approve and review each edit manually | `default` モードで Phase 7 に進む |
| **Keep planning with feedback** | plan mode に留まり、フィードバックを受けて plan file を修正後、再度 ExitPlanMode を呼ぶ |

「Approve and accept edits」を推奨として案内する。
人間承認 gate = ExitPlanMode 承認が完了した時点で、後続の起票は permission prompt 不要 (op-plan と同 UX)。

#### EnterPlanMode / ExitPlanMode が利用できない環境

tool が提供されない場合 (古い CLI / 特殊環境) は、plan file を表示してユーザーに
「起票してよいですか? (yes/no)」と対話で確認するフォールバック挙動に切り替える。

### Phase 7: Issue 起票

承認された draft を順に起票する。新規作成系コマンドの並列化禁止 (memory:
gh issue create 並列化事故、2026-05-17) は引き続き守る。1 draft = 1 invocation で
逐次起票する。

各 draft について:

```bash
NEW_ISSUE_NUMS=()  # ループ開始前に初期化 (Phase 8 の trace コメントで全番号を参照)
```

1. `enriched_issue.body` を一時ファイル (例: `mktemp /tmp/op-scan-followup-XXXXXX.md`) に書き出す
2. `op issue create --title <title> --label <csv> --body-file <tmp>` で起票
   - 内部で gh issue create を 1 invocation = 1 FetchSession で呼ぶ
   - stdout に Issue URL を返す (gh CLI 互換)
3. URL から `#NNN` を抽出して `NEW_ISSUE_NUM` を組み立て; `NEW_ISSUE_NUMS+=("$NEW_ISSUE_NUM")`
4. 一時ファイルを削除
5. `post_create_comments` があれば **1 Issue = 1 集約コメント**に束ねて追加投稿 (consolidation 規約
   `issue-enrichment.md §8.2`、個別投稿は spam のため禁止 #643。インライン展開禁止: 日本語/改行が欠損する):
   - `POST_COMMENT_TMP=$(mktemp /tmp/op-scan-post-comment-XXXXXX.md)`
   - `post_create_comments[]` を §8.2 の集約フォーマット (severity/category 別セクション + 冒頭に
     「Critical/High は本文統合済み」明記 + cap 適用時は「他 M 件省略」可視化) で `$POST_COMMENT_TMP` に書き出す
   - `op issue comment "$NEW_ISSUE_NUM" --body-file "$POST_COMMENT_TMP"` (1 回だけ呼ぶ)
   - `rm -f "$POST_COMMENT_TMP"`
   - 空配列なら投稿しない
6. `起票: #${NEW_ISSUE_NUM} - <draft.title>` を stdout に表示

hidden marker (Issue 本文冒頭に必ず埋め込む):

```markdown
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-source: op-scan-from-merged-pr -->
<!-- op-mode: from-merged-pr -->
<!-- op-derived-from: #<PR_NUM> -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert (recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | null> -->
```

> `op-domain` 値の domain 列挙・expert マッピング詳細は本 SKILL.md §domain-marker-patterns を参照。

> `op-scan-expert` の値は source_kind から推定する: `review-finding` → `review-expert`、`security post-check` → `security-expert`、`needs_human_decision` → 元 Issue の `op-run-expert` を参照。

> `op-post-check-expert` の null 出力義務は § `#### 必須 marker (全 Issue 共通)` を参照。

> **op-source の注意**: 現時点では `op-scan` を流用する。Phase E (#128) で
> `labels-and-markers.md` に `op-scan-from-merged-pr` が追加された後、
> 別 PR で `op-scan-from-merged-pr` へ切り替える。

ラベル:
- `auto-report` (op-run が拾う)
- `derived-from-pr` (merged PR 由来であることを示す)
- `severity:<medium|high|low>` (source field の default に従う)
- domain label (例: `pro-refactor-expert`)

### Phase 8: 完了報告 + 親 PR trace コメント

```
## op-scan --from-merged-pr 完了

### 対象 PR
- PR: #<N> "<PR タイトル>"

### 抽出 source
- recommended_followup_experts: <N> 件
- needs_human_decision: <N> 件
- proposed_stages[1+]: <N> 件
- review-finding (scope:new-issue): <N> 件
- post-check Notes (PASS_WITH_NOTES): <N> 件
- assumptions[] / blocked_actions[]: <N> 件

### 起票結果
| # | Issue | severity | fingerprint |
|---|-------|---------|-------------|
| 1 | #<M> "<タイトル>" | medium | <fingerprint> |
| 2 | #<M+1> "<タイトル>" | high | <fingerprint> |

### スキップ (重複)
- fingerprint <X>: 既存 #<K> と重複

### 起票ブロック
- fingerprint <Y>: collision gate block (理由: ...)

次は `/op-run` で起票した Issue を実装可能です。
```

親 PR への trace コメント (optional、`--no-trace` で skip 可):

trace コメント本文 (起票した follow-up Issue 一覧 + skip / block 件数) を一時ファイルに書き出し、
`op pr comment "$PR_NUM" --body-file "<tmp>"` で投稿する。`op pr comment` は内部で
`gh pr comment` を 1 invocation = 1 FetchSession で呼ぶ。本文テンプレ:

> ## op-scan --from-merged-pr: follow-up Issue 起票完了
>
> 起票した follow-up Issue:
> $(for n in "${NEW_ISSUE_NUMS[@]}"; do echo "> - #$n"; done)
> (0 件の場合はこの行なし)
>
> スキップ (重複): N 件
> ブロック (collision gate): N 件

### `--from-merged-pr` 時の注意

- **MERGED 必須**: open / draft PR を渡されたら明示エラーで中断 (race condition 防止)
- **collision gate は `--no-enrichment` でも bypass 不可**: enrichment 全体の skip ≠ collision gate の skip (silent fork 防止の最重要 contract)
- **post-check Notes は LLM 推定**: 自然文 parse のため非決定的。severity:low + 「LLM 推定」を draft body に明記
- **op-source は op-scan を流用**: Phase E (#128) 完了後に `op-scan-from-merged-pr` へ切替予定 (別 PR で対応)
- **plan file は batch で大量になる可能性**: summary table + details folding の二段構成で肥大を防ぐ
- **親 PR への trace コメントは optional**: `--no-trace` で skip 可。trace が不要な場合は Phase 8 末尾のコメント投稿を省略

---

## 注意事項

本文で繰り返し明示している原則 (read-only / CLAUDE.md 準拠 / canonical schema / 失敗 expert 続行 等) は省略。以下は誤運用で他スキルとの contract が壊れる原則のみを残す。

- **`--from-issue` の元 Issue は close しない**: 派生 Issue は元 Issue と 1:1 対応、close は op-merge の連動 close フェーズに委ねる。ここで close すると追跡が破壊される
- **Critical/High のみ起票**: noise 抑制の核心。判定基準は `_shared/severity-rubric.md` 厳守 (`--from-issue` のみ severity フィルタ無効化)

