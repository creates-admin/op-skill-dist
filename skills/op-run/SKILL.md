---
name: op-run
description: GitHub Issue を読み込み、共通機能でクラスタリングして worktree 並列で実装、PR open、別 context で独立レビューまで自動完了するスキル。「op-run」「並列実装」「Issue 実装」等のキーワードで起動。
# ADR-0009 L20: 計画フェーズの effort 無保証対策。effort は session 値を override (floor 不可) するため、
# どの session も降格させない max を pin。scope=起動 turn → clustering (フェーズ1-2、最初の plan gate より前) をカバー。
# 対話モードは plan gate 後の apply turn で session 値へ自動復帰 (--auto は単一 turn のため全工程 max)。
effort: max
---

<!--
schema_version: 3
last_breaking_change: 2026-06-15
notes: v3 (2026-06-15): ADR-0016 ClusterOrchestrator 移行。controller を薄型 dispatcher に変え、各クラスター
       の apply→PR→post-check→review→round 管理→verdict ライフサイクルを ClusterOrchestrator (Agent tool spawn) に委譲。
       op-run-fanout.js / op-run-review.js / op-run-postcheck.js を削除。op-run-discover.js は維持。
       v2 (2026-05-16): クラスタリング後の plan mode gate 追加。op-plan v2 同パターン。
       対話モード起動時は EnterPlanMode → フェーズ 0-1.5 を read-only 進行 →
       フェーズ 1-3 で plan file + ExitPlanMode によるユーザー承認 → acceptEdits 自動進行。
       --auto 時は plan mode 自体を skip。詳細は references/plan-mode-gate.md。
       v1 (〜2026-05-15): クラスタリング → cluster table 提示 → 対話承認 → 実装。
-->

# op-run: クラスタ並列実装 + 自動 PR + 独立レビュー

/**
 * 機能概要: open Issue を読み込んでクラスタリングし、worktree 並列で実装、PR open、
 *           別 context で review-expert を spawn して global review まで完了させる。
 *           各クラスターのライフサイクル (apply→PR→post-check→review→round 管理) は
 *           ClusterOrchestrator (Agent tool) が独立コンテキストで担い、
 *           controller には compact summary (~200 bytes) のみが返る (ADR-0016)。
 * 作成意図: 旧 pro-feature / pro-pull-requester / pro-reviewer を統合。
 *           並列 worktree でデバッグ効率と時間効率を両立、self-review バイアスを構造的に抑制。
 *           review-expert は監査専任とし、修正は ClusterOrchestrator が specialist expert に再委任する責務分離。
 * 注意点: コンフリクトは絶対に起こさない方針。クラスタ間でファイル重複があれば直列化。
 *         レビューは apply とは別の Agent + 別 worktree で実施 (独立性確保)。
 *         ClusterOrchestrator は cluster-orchestrator-directives.md に従い 1 クラスターの
 *         10 フェーズ構成ライフサイクルを完結させる (ADR-0016)。
 */

GitHub Issue を読み込み、共通機能でクラスタリング → worktree 並列実装 → PR 自動 open →
別 context で review-expert による独立 global review → `pro-reviewed` ラベル付与までを自動完了する。
各クラスターのライフサイクル管理 (apply → PR → post-check → review → Review Fix Loop) は
ClusterOrchestrator (Agent tool) が担い、controller には ClusterSummary を compact に返す (ADR-0016)。

**司令官 (main Claude) はコードを直接編集しない。** すべて expert subagent に委譲する。

---

## Shared Runtime Contracts

/**
 * 機能概要: op-run が apply / fix / post-check / review の各 spawn を行う前に従う、
 *           OP runtime 全体共通の正本契約への entry point。
 * 作成意図: expert 解決 / planned expert 正規化 / marker / label / spawn schema は
 *           リポジトリ全体で 1 ファイル正本に集約済み。op-run は実行責任者であり、
 *           ここでは「どこを正本として読むか」と「op-run の責務」を宣言するだけにする。
 * 注意点: ローカルに要約を書く場合でも「これが正本」と読める表現は禁止。
 *         必ず正本 pointer を伴わせる。
 */

apply / fix runtime spawn を行う前に、`op-run` は以下の正本を必ず読み合わせる:

- `~/.claude/skills/_shared/runtime-contract.md` — runtime spawn / fallback 動作契約
- `~/.claude/skills/_shared/active-expert-registry.md` — active runtime-spawnable experts (canonical runtime registry。frontmatter は mechanical linkage の確認用)
- `~/.claude/skills/_shared/planned-experts.md` — planned experts (env / release / compatibility / spec) の取り扱い契約
- `~/.claude/skills/_shared/markers/labels-and-markers.md` — label / hidden marker 仕様の正本
- `~/.claude/skills/_shared/expert-spawn.md` — subagent prompt 規約・canonical schema・mode 指示

`op-run` は **apply / fix runtime spawn の最終解決責任者** である。上記正本に従い、
`subagent_type` に渡せる expert 名を決定する責任は op-run が負う。

> **Issue marker / PR marker は routing metadata にすぎず、runtime spawn を authorize しない。**
> op-scan / op-patrol / op-architect が埋め込んだ `<!-- op-run-expert: ... -->` /
> `<!-- op-post-check-expert: ... -->` / `<!-- op-domain: ... -->` は判断材料として使うが、
> spawn 許可そのものは op-run が `active-expert-registry.md` を参照して再解決する。

> **`active-expert-registry.md` に列挙された active expert のみ spawn できる。**
> `planned-experts.md` の planned expert (env-expert / release-expert / compatibility-expert)
> は必ず active expert / `needs_human_decision` (内部 enum) / 文書化された planned-skip /
> abort のいずれかに正規化してから spawn フェーズに渡す (planned expert を `subagent_type` に
> 直接渡してはならない)。Utility Worker の `spec-expert` (op-spec 専用) も op-run routing 対象外であり、
> `op-run-expert: spec-expert` marker は `feature-expert` へ正規化してから spawn する。

### Runtime Snapshot

active / planned expert の正本リストは `~/.claude/skills/_shared/active-expert-registry.md` および
`~/.claude/skills/_shared/planned-experts.md` を参照。op-run は spawn 前に op core registry-verify
でこれらを実行時検証する。

### feature 正本の native auto-inject (ADR-0017)

op-run は apply / discover / review の各 expert を **ClusterOrchestrator が `op worktree-provision`
で用意した cluster worktree 内**で spawn する。このとき feature 正本 (`.claude/rules/<feature>.md`)
は path-scoped frontmatter (`paths:`) を持ち、spawn された expert が **その `paths:` に該当するファイルを
touch する作業のとき、対応する正本が native に context へ auto-inject される**
(ADR-0017 W-spike 2026-06-20 で実証済)。
constitution (`.claude/rules/00-constitution.md`) は always-on。

- **controller は spawn prompt に正本を明示注入しない** — native binding が効くため、明示 inject は
  native が効かない環境向けの contingency としてのみ残す (二重ロードは context 肥大の原因)。
- **運用条件 = 正本が tracked (commit 済) であること** — untracked だと `git worktree add` で worktree に
  伝播せず binding が silent に効かなくなる (ADR-0017 G1-op)。
- 正本の所在・spawn 規約の正本は `~/.claude/skills/_shared/expert-spawn.md` のパターン2 注記を参照。

> **検証 (canary)**: 正本に prompt 外の canary 文字列を仕込み、worktree で expert を spawn → expert が
> その canary を引けるか確認する (ADR-0017 W-spike の Q-A / Q-B 再走)。引ければ native binding が効いている。
> 引けない場合は正本の tracking 状態 (commit 済か) と `paths:` の一致を疑う。

---

## 実行モード

| モード | 起動 | クラスタ提案 | 想定 |
|-------|------|-------------|------|
| 対話 (デフォルト) | `/op-run` | ユーザー承認後実行 | 通常運用 |
| 自動 | `/op-run --auto` | 競合なし & 非 Critical のみ自動実行 | ルーティーン化 |
| 指定 | `/op-run #42 #43 #45` | 指定 Issue のみクラスタリング | 限定実行 |
| ラベル絞り | `/op-run --label bug` | 該当ラベルのみ | テーマ別 |
| 正規化同期 | `/op-run --normalize` | partial Issue を op-scan に委譲して同期待ち、結果も自動取り込み | 人間立て Issue を含めて一気通貫 |
| 正規化非同期 | `/op-run --no-wait-normalize` | partial Issue は op-scan 委譲のみで持ち越し | 委譲投げっぱなし、次回 op-run で拾う |

並列度: `op cluster max-parallel` が cluster 数 + 競合グラフ density から動的算出する (parallel/serial の partition 設計用、ADR-0007 v3 §4.2-v3)。
`OP_RUN_MAX_PARALLEL=N` 環境変数で explicit override (`=0` で hard cap (32) まで撤廃モード、CLI `--ceiling 0` と等価)。

**探知フェーズは Dynamic Workflows runtime が担う** (ADR-0009 / ADR-0010、Phase C C1)。
**修正・レビュー・Review Fix Loop フェーズは ClusterOrchestrator (Agent tool) が担う** (ADR-0016)。
controller は Workflow (`op-run-discover`) と ClusterOrchestrator (Agent tool) を呼び出すだけで、
並列上限 (16 並列) は runtime が透過的にキューイングする (超過分は runtime が順次起動)。
controller 人為 cap (chunk 起動 / `CONTROLLER_CHUNK_BUDGET`) は撤廃した。
`op cluster max-parallel` の算出値はフェーズ 2-B の **parallel_clusters / serial_chains の partition 設計** (どの cluster を直列化するか) に使う。
動的算出 fence の実体はフェーズ 1 末 (`EFFECTIVE_MAX_PARALLEL` 確定) と フェーズ 2-B 直後 (density 再計算) に置く。

`--auto` と `--normalize` を併用すると、partial Issue も自動で op-scan 委譲 + 派生 Issue 取り込みが走る (フルオートライン)。
`--auto` 単独では partial Issue は委譲対象から外し、人間レビューを挟む (安全寄り default)。

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
フェーズ0 で `_shared/version-check.md` の手順に従い整合性を確認する (mismatch 時は warning + ユーザー確認)。

- `~/.claude/skills/_shared/runtime-contract.md` — runtime spawn / fallback 動作契約 (op-run の最終解決責任の上位契約)
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — active runtime-spawnable expert の canonical registry。frontmatter とは責務が異なり、矛盾時は contract error として停止する。agent 名から `skills/expert-<name>/` を機械生成しない
- `~/.claude/skills/_shared/planned-experts.md` — planned expert (env / release / compatibility / spec) の取り扱い契約 (lifecycle / fallback 方針正本)
- `~/.claude/skills/_shared/markers/labels-and-markers.md` — label / hidden marker 仕様の正本 (op-run はこれを routing metadata として読む)
- `~/.claude/skills/_shared/clustering.md` (>=6) — クラスタリング・競合検出ロジック (v6: density 算出方法を明文化)
- `~/.claude/skills/_shared/worktree-ops.md` (>=3) — worktree ライフサイクル (v3: soft warning >16 / hard cap >32 fail-fast gate、ADR-0007 v3 §4.1-v3 整合)
- `~/.claude/skills/_shared/expert-spawn.md` — subagent prompt 規約、canonical schema、planned expert spawn 禁止、release-expert 再分類、review-expert global review、security-expert active post-check / apply 契約 (invocation_mode 必須化 / reviewed_head_sha 記録 / Review Fix Loop / 判定優先順位 1-8 / needs-fix 3 条件 AND / commits_added required (v14) を含む)。**Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) — controller が `op pr create` / marker 付き comment を publish する前に `op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict` を通す契約
- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode の対話可否契約 + needs_human_decision schema
- `~/.claude/skills/_shared/project-profile.md` (>=1) — 検証コマンド (Rust / Flutter / Vue / Tauri)
- `~/.claude/skills/_shared/pr-templates.md` (>=13) — PR 本文 (二層構造必須) ・review コメント (op-review-meta + op-review-finding 必須) ・UX/UI post-check (op-ux-ui-audit) ・Security post-check (op-security-post-check, 8 観点 + usable_security / aux post-check 状態) ・op-post-check-meta header ・op-security-requires-aux-post-check hidden marker ・op-manual-override block (gate 12〜13 / 15〜16 例外運用) ・pro-review-expert は Issue routing 対象外 ・pro-env-expert ラベル ・Needs Human Decision テンプレ
- `~/.claude/skills/_shared/common-setup.md` (>=2) — Invocation Mode Overrides
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック手順 + Invocation Mode 上の責務分離
- `~/.claude/skills/_shared/model-selection.md` (>=4) — expert spawn 時の model (Opus / Sonnet / Haiku、具体 version は §1) 選択 / task_complexity / 区画 complexity の canonical 正本。op-run は apply spawn 時に Issue の task_complexity と expert から model を決定 (主 consumer)。post-check (フェーズ 3.5) は常に Opus。global review (フェーズ 4) は Opus default だが §7.1 narrow opt-down 5 条件 AND を満たす狭い PR は Sonnet、さらに §7.1.3 (>=4) sensitive ∩ doc-only small PR は investigate phase のみ Sonnet に段階下げ (verify/gate は Opus 固定)。`--quality` flag による上書き対応
- `~/.claude/skills/_shared/op-config-schema.md` (>=1) — `op-config.yaml` schema 定義の canonical 正本。op-run は本ファイルの `model_overrides` / `quality_defaults` を読み、§6 controller 決定フロー step 2-3 で適用する
- `~/.claude/skills/op-run/references/plan-mode-gate.md` (>=1) — フェーズ -1 (EnterPlanMode) / フェーズ 1-3 (ExitPlanMode + plan file) の詳細仕様。SKILL.md 本体 god file 抑制のため分離 (v2 で追加)
- `~/.claude/skills/op-run/references/issue-health-check.md` (>=1) — フェーズ1.5 (Issue 健全性判定 + 正規化委譲 + 派生 Issue 取り込み + ループ防止 + タイムアウト) の詳細仕様。SKILL.md 本体 god file 抑制のため分離 (Issue #425 Stage 2)
- `~/.claude/skills/op-run/references/global-review-spawn.md` (>=3) — Global Review の詳細仕様。review worktree 作成 / review_model 決定 (narrow opt-down) / per-phase model 解決 / review_round 算出 / OP_RUN_SESSION_ID 払い出し / marker 組立 + 投稿 / apply_review_labels を集約。ClusterOrchestrator フェーズ5-6 のポインタ参照先 (ADR-0016 移管済)
- `~/.claude/skills/op-run/references/review-fix-loop.md` (>=1) — Review Fix / Specialist Decision Loop の詳細仕様。review_result 別動作 / round 上限管理 (4.5-1 / 4.5-1A) / finding 抽出条件 (4.5-2-pre 8 条件 AND) / dispatch 判定優先順位 1-8 (4.5-2) / planned expert fallback (4.5-2-fallback) / specialist handoff (4.5-2A) / same worktree 判断基準 (4.5-3) / 再委任フロー (4.5-4) を集約。ClusterOrchestrator フェーズ7 のポインタ参照先 (ADR-0016 移管済)
- `~/.claude/skills/op-run/references/expert-resolution.md` (>=1) — フェーズ1-2-c (expert 解決ロジック) / フェーズ1-2-d (Active Apply Expert Normalization) の詳細仕様。marker / label → expert の解決軸、Resolved → Runtime 正規化表、release-expert 再分類、normalize_to_active_apply_expert 判定軸を集約。SKILL.md 本体 god file 抑制のため分離 (Issue #467 Stage 6)
- `~/.claude/skills/op-run/cluster-orchestrator-directives.md` (>=1) — ClusterOrchestrator の指示書正本。1 クラスターの apply → PR → post-check → review → round 管理 → compact summary 返却の 10 フェーズ構成 (ADR-0016)
- `~/.claude/skills/op-run/references/apply-prompt-directives.md` (>=1) — apply フェーズの expert 別 load-bearing 指示の canonical 正本。controller が common 節 + 当該 expert の節を結合し、ClusterOrchestrator spawn 時の apply-expert prompt に注入する
- `~/.claude/skills/op-plan/SKILL.md` フェーズ -1 (行 140-180) / フェーズ 6 (行 514-610) — plan mode 自動遷移パターンの出元 (op-run v2 で参照)
- Claude Code 公式 [Choose a permission mode](https://code.claude.com/docs/en/permission-modes) — EnterPlanMode / ExitPlanMode の権限機構レベル仕様、承認オプション (Approve and accept edits / start in auto mode / review each manually / Keep planning with feedback) と acceptEdits / auto 自動遷移挙動 (v2 で参照)
- `~/.claude/skills/_shared/markers/claim-markers.md` (>=1) — op-run Issue claim 機構の marker schema 正本 (op-claim block / op-cluster-manifest block / TTL ルール / race 調停 / 除外条件)
- `~/.claude/skills/_shared/apply-completion-verify.md` (>=1) — controller 側 apply 完了 verify gate の正本 (gate3 recovery 判断の receipt 仕様 / 不一致分岐 / SendMessage retry 文面 / worktrees-failed/ 隔離手順)。Phase 2-E §2-E-0 の手順詳細はこちら
- ADR-0009 (Dynamic Workflows 移行) / ADR-0010 — op-run の探知フェーズを Dynamic Workflows 駆動へ移行する設計判断の正本。controller は named workflow を呼び、workflow が expert agent を別 context で spawn する。フォールバック経路は持たない (ADR-0009 決定5)
- ADR-0016 (ClusterOrchestrator アーキテクチャ) — 修正・レビュー・Review Fix Loop を ClusterOrchestrator (Agent tool) に委譲する設計判断の正本。controller を薄型 dispatcher に変え、各クラスターのライフサイクルを独立コンテキストで完結させる
- `~/.claude/workflows/op-run-discover.js` — フェーズ2-A 探知 workflow の entry。controller が provision 済 worktree で investigation reader を並列 spawn し investigation report を返す (Stage2 barrier 供給)。args/戻り値 schema は本ファイル冒頭コメント参照
- `~/.claude/skills/_shared/read-economy.md` (>=1) — Read Economy 原則 (R1〜R5) + 「Controller への適用」節。controller は既読 Issue/PR/file の再 Read を避け、Issue/PR body は meta/list で取得し、subagent の completion_report 取り込みを圧縮する (読まなさすぎへの退行は避ける)

---

## フェーズ-1: プランモード自動遷移 (対話モード時、v2)

司令官は op-run を対話モードで起動した直後、フェーズ 0 に入る前に **`EnterPlanMode` tool を呼ぶ**。
これによりフェーズ 0 (環境確認) / フェーズ 1 (Issue 取得・クラスタリング) /
フェーズ1.5 (健全性チェック) / フェーズ 1-3 (ユーザー承認) が Claude Code の plan mode 下で進行し、
**Edit / Write / Bash の書き込み系が権限機構レベルでブロック** される
(bundled `/batch` および op-plan v2 と同方式、公式仕様:
[Choose a permission mode](https://code.claude.com/docs/en/permission-modes))。

要点:

- **対話モード専用**。`--auto` 起動時は plan mode を skip し、現状の自動除外ルール
  (競合のあるクラスタ / Critical 系 / `low` confidence をスキップ、残りを自動実行) に従う
- 既に plan mode に居る場合 (`defaultMode: "plan"` 等) は `EnterPlanMode` は no-op (冪等)
- plan mode 拒否時 (ユーザー No / tool 未提供) は v1 互換の対話プレビューにフォールバック (機能停止しない)
- plan mode 下では `Read` / `Grep` / `Glob` / 読み取り gh コマンド / git 読み取り / audit モード spawn のみ許可
- write 系 (`op issue create` / `git push` / `op pr create` / worktree 作成 / apply expert spawn) は
  フェーズ 2 以降に集約され、ExitPlanMode 承認後の permission モードに従って実行される

詳細仕様 (`-1.1` plan mode 状態判定 / `-1.2` read-only 保証範囲 / `-1.3` `--auto` との関係 /
v1 互換フォールバック) は `references/plan-mode-gate.md` を参照。

---

## フェーズ0: 環境確認

### 0-pre. _shared 整合性チェック

`_shared/version-check.md` の「起動時チェック手順」に従い、上記「## 参照ドキュメント」節の `(>=N)` と各 `_shared/*.md` 冒頭の `schema_version` を照合する。mismatch 検出時は warning を表示し、ユーザーに続行可否を確認する (`--auto` モードでも一旦停止)。pass なら以降の bash へ。

加えて、`_shared/version-check.md` の「installed op binary 鮮度確認」節 (Issue #249) に従い、`op version --json` の `details.git_sha` と `git log --format='%h' -n1 -- op-tools/crates/` の最新 SHA を比較する (比較元 path は binary 挙動に影響する範囲に絞る。docs-only commit の false-drift 回避 = Issue #641)。不一致時は warning + `cargo install --path op-tools/crates/op` を案内 (hard fail なし)。

さらに、`op core schema-check` で _shared prose / Rust types / SKILL.md pin の drift を確認する。
`stats.errors_total >= 1` または `stats.warnings_total` が 5 以上の場合は warning を表示し、ユーザーに続行可否を確認する (`--auto` モードでも一旦停止)。
CI (CLAUDE.md ### 10) と異なり runtime では hard fail しない (CLAUDE.md 不変則2)。

> **controller の read 規律**: controller は本スキル全フェーズで `_shared/read-economy.md` の
> 「Controller への適用」節に従う (既読 Issue/PR/file を再 Read しない / Issue・PR body は
> meta・list で取得し full body を居座らせない / completion_report を圧縮取り込み)。詳細は同節を正本とする。

```bash
# schema-check: drift 可視化 (runtime hard fail なし、warning のみ)
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

### 0-1. git / gh

```bash
git rev-parse --is-inside-work-tree || exit 1
gh auth status || exit 1
```

### 0-base. BASE_REF 決定 (OP_RUN_BASE_REF / OP_RUN_BASE_SHA)

/**
 * 機能概要: op-run 起動時に唯一の base ref / base SHA を確定させる。
 * 作成意図: worktree 作成・apply prompt・post-run diff・PR base・post-check diff・global review が
 *           それぞれ別の base を見て事故が起きるのを構造的に防ぐ。
 * 注意点: PR 作成後に op pr create が内包する baseRefName verify で読み戻す値ではない。
 *         worktree 作成段階ではまだ PR が無いため、必ず controller が先に決め、
 *         その値を PR 作成時にも使う。origin/main の直接参照は禁止。
 */

op-run controller は worktree 作成前に `OP_RUN_BASE_REF` を必ず決定する。

優先順位:

1. CLI / 環境変数で明示された `OP_RUN_BASE_REF`
2. 既に export 済みの `BASE_REF`
3. `origin/HEAD` が指す default branch
4. 最終 fallback として `main`

決定した値は、この op-run 実行中の唯一の base ref として扱う。

以降のすべての処理は同じ `OP_RUN_BASE_REF` / `OP_RUN_BASE_SHA` を使う:

- worktree 作成
- apply agent prompt の起点 commit 表示
- post-run diff
- PR create の `--base`
- UX/UI post-check diff
- security post-check diff
- auxiliary UX post-check diff
- global review の baseRefName 検証

`origin/main` を直接参照してはいけない。

```bash
# 1. 明示指定 → 既存 BASE_REF → origin/HEAD → main の順で解決
OP_RUN_BASE_REF="${OP_RUN_BASE_REF:-${BASE_REF:-}}"

if [ -z "$OP_RUN_BASE_REF" ]; then
  OP_RUN_BASE_REF="$(
    git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null \
      | sed 's#^origin/##'
  )"
fi

if [ -z "$OP_RUN_BASE_REF" ]; then
  OP_RUN_BASE_REF="main"
fi

# 2. 並列タスクの起点 commit を統一する準備 (release / develop / hotfix branch も対応)
git fetch origin "$OP_RUN_BASE_REF:refs/remotes/origin/$OP_RUN_BASE_REF"

# 3. 起点 SHA を固定 (worktree / apply / post-check / global review に共有)
# 呼出側 (op-loop 等) が層ごとに前進させた base を OP_RUN_BASE_SHA として事前 export した場合はその値を尊重する
# (ADR-0019 D6 base 前進)。未指定 (空文字) の場合のみ origin/${OP_RUN_BASE_REF} から計算する = 従来挙動。
if [ -z "${OP_RUN_BASE_SHA:-}" ]; then
  OP_RUN_BASE_SHA="$(git rev-parse "origin/${OP_RUN_BASE_REF}")"
fi

export OP_RUN_BASE_REF
export OP_RUN_BASE_SHA

# 4. run 全体で共有する bundle-level task ID を確定する
#    - 目的: claim acquire (1-2-e) / release (フェーズ2-E) で同一 owner ID を共有させ、
#            空文字 task-id 経由の stale claim 蓄積を構造的に防ぐ (Fixes #232)。
#    - cluster 単位の `TASK_ID` (フェーズ2-A) とは別物。bundle は run 全体 = 複数 cluster を包む実行単位。
#    - `:=` 形式で初期化することで、CLI / 環境変数で明示された値を尊重しつつ、未指定時は秒粒度タイムスタンプで一意化する。
: "${OP_RUN_TASK_BUNDLE_ID:=op-run-bundle-$(date +%Y%m%d-%H%M%S)}"
export OP_RUN_TASK_BUNDLE_ID
```

### 0-cap. Dynamic Workflows capability preflight

/**
 * 機能概要: op-run の探知フェーズ (フェーズ2-A) は Dynamic Workflows runtime に
 *           hard dependency する (ADR-0009 Phase C C1)。起動可能性を起点で fail-fast 検査する。
 * 作成意図: ADR-0009 決定5 により **フォールバック経路 (旧 single-message Agent spawn) は持たない**。
 *           Workflows が使えない環境で探知フェーズが動作しない場合、actionable message を出す。
 *           修正・review フェーズは ClusterOrchestrator (Agent tool) が担うため Workflows capability は不要。
 * 注意点: twin フォールバック経路は作らない。Workflows 不可 = op-run の探知フェーズを実行しない。
 */

op-run の探知フェーズ (フェーズ2-A) は `op-run-discover` Workflow に依存する。
**Dynamic Workflows が利用できない環境では op-run の探知フェーズが動作しない。**
修正・review フェーズは ClusterOrchestrator (Agent tool) が担うため Workflows capability は不要。
controller はフェーズ 1 (clustering) に進む前に Workflows capability を確認し、
不可なら以下の actionable message を出して **即停止** する (フォールバックは試みない):

```
❌ op-run の探知フェーズ (フェーズ2-A) には Dynamic Workflows が必要です。
   - /config で Dynamic Workflows を有効化してください
   - Claude Code v2.1.154 以降が必要です
   - Pro 以上のプランが必要です
   ADR-0009 決定5 により、Workflows が使えない場合のフォールバック経路 (旧 single-message Agent spawn) は提供しません。
   修正・レビューフェーズは ClusterOrchestrator (Agent tool) が担うため、探知フェーズのみが制約です。
```

---

## フェーズ1: Issue 取得とクラスタリング

### 1-1. Issue 取得

```bash
# デフォルト: auto-report ラベルの open Issue
# --label 指定: そのラベルの Issue
# 番号指定: op issue view <N> で個別取得
# --search で op:in-progress / op-state / do-not-close を持つ Issue を除外
# (他 instance が claim 中 / Patrol Ledger 等の永続 Issue を初期段階で除外。claim-markers.md §除外条件 参照)

op issue list --label "auto-report" --state open \
  --search "-label:op:in-progress -label:op-state -label:do-not-close" \
  --limit 50
```

除外条件:
- 既に `Fixes #N` する open PR が存在する Issue
- Critical/High セキュリティ Issue (`--auto` モード時のみ)
- `superseded-by-scan` ラベル付き Issue (派生 Issue で実装中のため)

**ファイルパスが本文にない Issue を「対象不明」として弾かず**、フェーズ1.5 の健全性チェックに回す。
これにより人間立て Issue / 古い形式 Issue も op-scan 委譲経由で取り込める。

#### 1-1-a. 人間判断待ち Issue の分離 (manual_review_bucket)

取得後、**以下のラベルを持つ Issue は通常の apply クラスタに混ぜない** (expert を spawn しても
no-op になるため、最初から分離して `manual_review_bucket` に回す):

- `needs:human-decision` (`needs_human_decision.required: true` の構造化 block を含む)
- `needs:spec-decision` (`finding_type: needs_spec_decision` または `decision_type: "spec"`)
- `needs:triage` (op-patrol が `seen_count >= 3` / `affected_paths` 増加で付与)

**ただし以下は manual_review_bucket に落とさず通常 apply に流す** (opt-out):

- `needs:human-decision` と **`needs:human-decision-followup` の両方** が付いた Issue
  (`can_continue_without_decision: true` の opt-out フラグ。`safe_first_step` の範囲だけは
  現 PR で進めて、残った判断は follow-up として PR 本文 / global review に渡す運用)
- `needs:boundary-decision` 単独 (`needs:human-decision` が付いていない参考タグのみ。
  境界判断点の存在を示すマーカーで、それ自体は apply を止めない)

`needs:human-decision-followup` opt-out が有効になる条件は op-scan / op-patrol 側で
**`finding_type != needs_spec_decision`** に制限済み (仕様判断は常に blocking)。

```bash
# manual_review_bucket に分離する Issue 抽出例
# op issue list の envelope (.details.issues[]) を controller 側で絞り込む。
# label は文字列配列のため gh の {name:...} ではなく要素直接 (.labels[]) で比較する。
# needs:human-decision-followup が同時に付いている Issue は除外する (opt-out)
op issue list --label "auto-report" --state open --limit 50 \
  | jq '[.details.issues[] | select(
           ((any(.labels[]; . == "needs:human-decision"))
              and (all(.labels[]; . != "needs:human-decision-followup")))
           or any(.labels[]; . == "needs:spec-decision")
           or any(.labels[]; . == "needs:triage")
         ) | .number]'
```

これらの Issue は:
- 通常の cluster table に出さず、ユーザー承認画面の **「人間判断待ち」セクション** に列挙する
- 司令官 (op-run の起動者) が判断 → ラベル除去 / scope 変更 してから再度 op-run に回す
- 自動 spawn しないため expert の無駄使いと、誤った no-op PR の作成を防ぐ

`needs:human-decision-followup` opt-out が付いた Issue については:
- 通常の cluster table に表示 (apply 担当 expert に流す)
- ただし apply 担当は **`safe_first_step` のみ実行** + `blocked_actions[]` 厳守 +
  `needs_human_decision` block を完了報告 / PR 本文「残存リスク / follow-up」節に転記
- 詳細は本 SKILL のフェーズ2-Orchestrate 内「apply-prompt-directives.md 注入」を参照

→ 残り (manual_review_bucket 以外) の Issue がフェーズ1.5 (健全性チェック) を経由してから
   クラスタリング (1-2) に進む。

### 1-2. クラスタリング (Plan-time)

**フェーズ1.5 で正規化された派生 Issue も含めて**クラスタリングする。partial として
op-scan 委譲に回された Issue (元 Issue) はクラスタ対象から除外し、派生 Issue (`derived-from-issue`
ラベル付き) のみが取り込まれる。

`_shared/clustering.md` のアルゴリズムに従う:

1. 各 Issue から対象ファイルを抽出 (Rust / Tauri / Vue / Flutter のパス形式)
2. **モジュール推定の優先順位**: ラベル `module:xxx` > 本文明示語 > プロジェクト `module_map` > LCP
3. ラベルからカテゴリ・expert を推定
4. `(module, category)` でグルーピング (上限 5 Issue / クラスタ)
5. **confidence (high/medium/low) を付与**
6. **Stage 1 競合検出**: ファイル重複 + global_conflict_files + 同一 symbol を検証

ステップ 4-6 (= **どう束ね並列化するかのグルーピング決定**) は「単発 / 不可逆 / 深い推論」で、
判定不能を 1 案に丸める従来手法は低 tier 司令官で品質劣化する (ADR-0009 L20)。
judge-panel 有効時 (既定) は、このグルーピングを **1-2-judge の judge-panel workflow に委譲** する
(ステップ 1-3 = file/module/category 抽出は司令官が prep し、グルーピングだけ N 案競争にする)。

#### 1-2-judge. clustering judge-panel (案出し、ADR-0014 Wave A)

グルーピング (ステップ 4-6) を **N 案を別角度で並列生成 → evaluator が比較選定** する judge-panel に置き換える。
**案出し=workflow / 確定=司令官+人間 gate** (ADR-0009 L158 厳守。確定は 1-3 / `--auto` 自動採択)。

**有効条件 (op-config gated)**: `planning_judge_panel.enabled` (既定 `true`)。`false` または workflow が
`ok:false` (全候補不正) を返した場合は、従来の司令官単発グルーピング (ステップ 4-6 を司令官が 1 案で実施) に
**フォールバック** する (機能停止しない)。`--auto` でも有効 (確定が人間選定→recommended 自動採択に変わるだけ)。

**司令官 prep (workflow 呼出前)**:

1. ステップ 1-3 を司令官が実施し、各 Issue に `files_declared` / `module_hint` / `category_hint` / `severity` を付した
   **enriched issues** を組む (3 angle が同一入力を共有 = 公平比較)。
2. 1-2-pre の `op:blocking-finding` Issue は **panel に渡さず** 強制単独クラスタ (forced singleton) として取り分ける
   (1 Issue=1 PR 厳守ゆえ案出し対象外)。panel には残りの Issue 集合のみ渡す。
3. 1-2-b の global_conflict_files リストを `global_conflict_files` として渡す (risk-first angle の判定材料)。
4. `planning_judge_panel.candidate_count` (既定 1) と model (`model-selection.md` §5.1: generate=Sonnet / evaluate=Opus) を解決する。angles は Wave A では workflow default (標準/risk-first/throughput-first) に委ねる。

**workflow 呼出** (`op-run-discover` と同形式、動的値は args 注入):

```javascript
const judgeOut = Workflow({
  name: 'op-run-judge-clustering',
  args: {
    issues: enriched_issues,                 // [{number, files_declared, module_hint, category_hint, severity}]
    global_conflict_files: GLOBAL_CONFLICT_FILES,
    candidate_count: PJP_CANDIDATE_COUNT,    // op-config (既定 1)
    // angles は省略可: workflow が標準/risk-first/throughput-first を default。surface 別上書きは Wave B 以降 (op-config-schema §10)
    cap: 5,                                  // clustering.md Step4 の 1 cluster 上限
    models: { generate: PJP_GEN_MODEL, evaluate: PJP_EVAL_MODEL },
  },
})
// judgeOut = { ok, recommended:{angle, plan, corrected}, candidates:[{angle, clusters, score}], js_ranking, evaluator:{recommended_angle, rationale, ranking}, dropped }
```

**戻り値の扱い**:

- `ok:false` → フォールバック (従来単発グルーピング)。`dropped` を warning に出す。
- `ok:true` → `candidates[]` の各 `clusters[]` は op-core ClusterPlan schema (cluster_id/issues/primary_runner/
  post_check_expert/files/global_conflict_files/confidence/needs_serialization) に一致。**forced singleton (blocking) を
  各 candidate に merge** し、1-3 で人間が選んだ (または `--auto` で recommended の) candidate を cluster manifest に確定する。
- workflow は **shell-out 不可** ゆえ `op cluster max-parallel` を呼ばない。正確な density-based 並列度は **選定後** に
  1-2-f で司令官が算出する (judge-panel の JS score は parallelism/conflict/confidence/balance/cap の純 proxy で、選定の参考)。

選定後、確定 candidate の clusters に対して 1-2-c (expert 解決) / 1-2-d (正規化) / 1-2-e (claim) / 1-2-f (max-parallel) を
通常どおり適用する (これらは grouping 確定後の per-cluster 操作)。

#### 1-2-0. 司令官 model advisory guard (clustering / 並列化設計の品質保証)

clustering (= どの Issue を束ねて並列実行するかの並列化プラン設計) は「単発 / 判断不可逆 /
深い推論」のど真ん中であり、1 回の判断が並列実行全体の品質を決める最重要の単発判断である
(model 正本: `_shared/model-selection.md` §5.1 主表「op-run | clustering / 並列化設計 | 単発 | 高 | Opus」)。

ところが clustering は spawn された agent ではなく **司令官自身の推論** なので「Opus で spawn」を
直接強制できない。そこで **clustering (1-2) 着手前に advisory guard** を実行する:

> **judge-panel 有効時の supersession (ADR-0014)**: 1-2-judge が有効な場合、グルーピング depth は
> opus evaluator (model pin) + 司令官 effort pin (`effort: max`、PR #611) が構造的に担保するため、
> 本 advisory は **情報提供のみ** (低 tier 司令官でも judge-panel が breadth + 評価 depth を補う)。
> judge-panel が `ok:false` でフォールバックした単発グルーピング時のみ、本 advisory の警告意義が残る。

- 司令官 model が最上位 tier (Opus) でない (Sonnet / Haiku / fast mode 等) 場合に warning を出し、
  Opus 司令官での再実行、または低 tier のまま続行する明示承認を促す。
- **hard fail しない** (`model-selection.md` §9 の `*_warning` 思想と整合、runtime は
  CLAUDE.md 不変則2 で hard fail しない)。低 tier 司令官で warning を無視して続行することは可能。

```text
[advisory] op-run clustering / 並列化設計は単発・判断不可逆の最重要判断のため Opus 司令官を推奨します。
           現在の司令官 model が最上位 tier でない場合、並列化プラン品質が無保証で劣化する可能性があります。
           Opus 司令官での再実行、または現 tier のまま続行する明示承認のいずれかを選んでください。
```

#### 1-2-pre. blocking finding の最優先化 (Phase 1)

クラスタリングに先立ち、**`op:blocking-finding` ラベル付き Issue を最優先で単独クラスタ化** する。
これは「新規変更が既存 architecture_debt を悪化させた」「既存契約の取り違えで他作業を破壊する
リスクが顕在化した」など、**他作業を進める前に解消すべき問題** を表すラベル。

ルール:

- `op:blocking-finding` ラベル付き Issue は **他クラスタに混ぜない** (1 Issue = 1 PR を厳守)
- 他クラスタの **実装より先に着手する** (実行プラン上は最優先で並ぶ)
- ユーザー承認画面では「最優先 (blocking)」セクションとして他クラスタと別表に出す
- blocking クラスタが複数ある場合は severity > area の patrol_score 降順 > Issue 番号昇順 で並べる
- blocking クラスタ自身は他 blocking クラスタとも並列化しない (直列化)
  (互いに前提を壊し合う可能性があるため)
- blocking クラスタの実装中、他クラスタは **着手しない** (待機)
- blocking クラスタの PR が merge されてから他クラスタに進む

```bash
# blocking Issue の抽出例
# op:blocking-finding ラベルは --label で AND 絞り込みできるため、抽出は number 取得のみで足りる。
# --limit は L273 / L309 と揃えて 50 (op issue list の default 30 で silent truncate しないため)。
op issue list --label "auto-report" --label "op:blocking-finding" --state open --limit 50 \
  | jq '[.details.issues[].number]'
```

blocking Issue が無い場合は通常のクラスタリング (4 以降) に進む。

### 1-2-b. global_conflict_files (clustering.md 参照)

以下に該当する可能性があるクラスタは confidence を下げ、原則直列化する。
完全なリストは `_shared/clustering.md` の「global_conflict_files」セクション参照:

- 依存マニフェスト / lockfile (Cargo.toml/lock, package.json, pnpm-lock.yaml, pubspec.yaml/lock 等)
- Rust / Tauri 基盤 (src/lib.rs, src/main.rs, src-tauri/src/lib.rs, tauri.conf.json, capabilities/**)
- Vue 基盤 (vite.config.ts, App.vue, router/**, stores/**, layouts/**, 共通 components)
- Flutter 基盤 (analysis_options.yaml, lib/main.dart)
- DB / 生成コード / グローバル設定 (migrations/, schema.sql, openapi.yaml, .github/workflows/)

判定不能なら直列化 (`_shared/clustering.md` の方針: 不確実なら並列化しない)。
Stage 1 で並列可と判定しても、**フェーズ2-B の Stage 2 で再検証**する。

### 1-2-c. expert 解決ロジック (apply / post-check の決定)

クラスタごとに apply 担当 expert / post-check 担当 expert を解決する。
marker / label は routing metadata であり spawn authorization ではない。
解決順序 (hidden marker → ラベルベース → ドメイン推定) の詳細、二重ラベル固定、
post-check 付与ルールは `~/.claude/skills/op-run/references/expert-resolution.md` を参照。
本正規化はフェーズ2-A / 2-Orchestrate / フェーズ3 すべての spawn 経路に適用する。

### 1-2-d. Active Apply Expert Normalization (planned expert を runtime に漏らさない)

1-2-c の expert 解決結果を Task spawn 前に必ず active expert へ正規化する gate。
planned expert (env / release / compatibility / spec) を直接 spawn しないための変換境界。
Resolved → Runtime 正規化表 / 判定軸 / 疑似コード / 適用タイミングの詳細は
`references/expert-resolution.md` を参照。

### 1-2-e. claim acquire (Plan mode 前の排他取得)

クラスタリング (1-2) 完了後 / Plan mode (1-3) 前に、**Issue 単位**で `op claim acquire` を順次実行する。
exit 1 (他 instance が owner) の Issue は cluster から除外して再構築、全 Issue が skip なら正常終了。
exit 2 (API error) は op-run 全体を abort。`OP_RUN_REPO` が未設定の場合は git remote から動的解決する。

```bash
# CLUSTERED_ISSUES は 1-2 / 1-2-judge の clustering 結果として前 fence で export されている前提。
# 未設定 (export 漏れ / subshell drift) の場合は fail-fast で即停止し、silent exit 0 を防ぐ。
: "${CLUSTERED_ISSUES:?CLUSTERED_ISSUES が未設定: 1-2 clustering 結果が伝わっていない}"
: "${OP_RUN_REPO:=$(git remote get-url origin | sed 's|https://github.com/||;s|\.git$||')}"
declare -a CLAIMED_ISSUES=()
for ISSUE in "${CLUSTERED_ISSUES[@]}"; do
  op claim acquire --repo "$OP_RUN_REPO" --issue "$ISSUE" --task-id "$OP_RUN_TASK_BUNDLE_ID"
  RC=$?
  [ $RC -eq 0 ] && CLAIMED_ISSUES+=("$ISSUE")
  [ $RC -eq 2 ] && { echo "❌ op claim acquire 致命的エラー: #$ISSUE" >&2; exit 2; }
done
[ ${#CLAIMED_ISSUES[@]} -eq 0 ] && { echo "ℹ️ 全 Issue が他 instance に claim 済。終了。"; exit 0; }
# claim 後の survivor に更新 (CLAUDE.md 不変則1: producer fence で export 必須)
export CLUSTERED_ISSUES=("${CLAIMED_ISSUES[@]}")
```

### 1-2-f. EFFECTIVE_MAX_PARALLEL 動的算出 (Phase 1 末、ADR-0007 v3 §4.2-v3)

/**
 * 機能概要: cluster manifest 確定直後に `op cluster max-parallel` で並列上限の初期値を動的算出する。
 * 作成意図: 固定 default 5 を廃し、cluster 数 + 競合グラフ density から動的算出値を default に
 *           昇格させる (ADR-0007 v3 §4.2-v3)。
 *           **ADR-0016 では修正・review フェーズは ClusterOrchestrator (Agent tool) に移管したため、
 *           controller 人為 cap (chunk 起動 / CONTROLLER_CHUNK_BUDGET) は撤廃した。**
 *           本算出値はフェーズ 2-B の parallel_clusters / serial_chains partition 設計の入力として使う。
 * 注意点: density=0.0 (initial) で算出する。Phase 2-B 直後 (2-B-density) に観測値で再計算する。
 *         `OP_RUN_MAX_PARALLEL=0` (撤廃モード) は SKILL.md 側で hard cap (32) に変換する。
 *         `op issue create` / `op pr create` の並列化禁止 (memory 2026-05-17) は維持。
 */

claim acquire 後の **生き残った cluster 数** から動的並列上限の初期値を算出する。
この値は controller が起動方針を chunk 分割するためのものではなく (chunk は撤廃)、
フェーズ 2-B で **どの cluster を直列化するか (serial_chains)** を partition 設計する際の入力になる。

```bash
# cluster 数を確定 (claim acquire 後の survivor)
# CLUSTER_COUNT は後続 fence (2-B-density) で density 算出の jq --arg cc に参照されるため export する。
export CLUSTER_COUNT="${#CLUSTERED_ISSUES[@]}"

# Phase 1 末は density=0.0 (Stage 2 未実施)、ceiling は input 側で null (= hard cap 32)
INPUT=$(jq -n --arg cc "$CLUSTER_COUNT" '{cluster_count:($cc|tonumber), density:0.0, ceiling:null}')
OP_RUN_MAX_PARALLEL_DYN=$(printf '%s' "$INPUT" \
  | op cluster max-parallel --input-json - \
  | jq -r '.details.max_parallel')

# 環境変数 explicit override が優先 (=0 は撤廃モード = hard cap 32)
if [ -n "${OP_RUN_MAX_PARALLEL:-}" ]; then
  EFFECTIVE_MAX_PARALLEL="$OP_RUN_MAX_PARALLEL"
  [ "$EFFECTIVE_MAX_PARALLEL" = "0" ] && EFFECTIVE_MAX_PARALLEL=32
else
  EFFECTIVE_MAX_PARALLEL="${OP_RUN_MAX_PARALLEL_DYN:-5}"  # fallback 5 = ADR-0007 旧 default
fi

export EFFECTIVE_MAX_PARALLEL OP_RUN_MAX_PARALLEL_DYN
```

修正・review フェーズは ClusterOrchestrator (Agent tool) が担う (冒頭「実行モード」節参照)。

`op issue create` / `op pr create` / `op issue comment` の **並列化は禁止** (controller sequential ループ維持)。
worktree hard cap は `_shared/worktree-ops.md (>=3)` の hard gate (32) と soft warning (16) で別レイヤから防御する。

### 1-3. ユーザー承認 (対話モード、v2: ExitPlanMode + plan file)

クラスタリング (1-2) 完了後、司令官は **plan file を書き出して `ExitPlanMode` tool を呼び**、
ユーザーに承認を求める。テーブルだけでなく **各クラスタの「何を / どこで / なぜ並列 (または直列) /
承認すると何がどう変わるか」を自然文 2-3 行で解説** することで、ユーザーが
「自分のリポジトリで何が起きるか」を理解した上で承認できるようにする
(op-plan v2 フェーズ 6 と同方式、公式仕様:
[Choose a permission mode — Review and approve a plan](https://code.claude.com/docs/en/permission-modes))。

#### 1-3-1. plan file 生成 → ExitPlanMode 呼び出し

司令官は `ExitPlanMode` を呼ぶ直前に plan file を書き出す。plan file は **lean 構造** を採る
(ADR-0017 OQ7。op-spec が内容・方向性を正本へ持つので、op-run plan gate は **実行段取りに専念**させ軽くする。
これは plan の presentation 再構成であり、承認 gate の動作・クラスタリング結果・spawn は一切変えない)。
**冒頭は俯瞰** (実行サマリ → wave timeline → digest → issue 1 行一覧 → cluster table)、
**詳細は末尾へ折りたたむ** (progressive disclosure)。司令官は以下の順で書き出す:

1. **実行サマリ** (1 行: N issue → M cluster ・並列 k ・推定 t ＋ 起動モード `--auto` 未使用 / `--normalize` on|off) + **wave タイムライン** (並列/直列を ASCII で視覚化)
2. 健全性チェック結果 (フェーズ1.5 ダイジェスト) ＋ **未トリアージ複数なら soft nudge を 1 行転記** (1.5-1-b、文言正本は `references/issue-health-check.md`)
3. **Issue 一覧 (1 行)** — 各 issue は `#NN <title> <verdict emoji> [op-spec-ref link]` の 1 行 (内容解説は正本へ委譲)。**未トリアージ (verdict / op-spec-ref なし) は title のみで degrade** (op-spec 非依存・後方互換)
4. クラスタ一覧 (最優先 blocking / 並列実行候補 / 直列化対象 / 人間判断待ち の 4 セクション、下記テーブル形式、**confidence と根拠を必ず含める**)
5. **詳細 (必要時に展開)** — 末尾へ折りたたむ (削除せず移動):
   - **クラスタ別 解説 (自然文 2-3 行ずつ)** — Issue 番号 / 触るファイル / 期待される結果 / 並列理由
   - 承認すると何が起きるか (フェーズ 2-A 探知 → 2-B Stage 2 → 2-Orchestrate ClusterOrchestrator 起動 → 各クラスターが apply → PR → post-check → review → round 管理 → verdict 返却)
   - risk_flags / 注意事項

並列度・推定時間は **実行サマリ (項目 1) の先頭 1 行へ昇格**して示す (lean 化、冒頭の俯瞰に必須)。
plan file テンプレ全文 (lean 構造) は `references/plan-mode-gate.md` の「1-3-1 plan file の生成」を参照。

**judge-panel 有効時の案提示 (ADR-0014)**: 1-2-judge が `ok:true` を返した場合、plan file には
**evaluator の推奨 1 案 (cluster table)** を **冒頭の cluster table 位置 (項目 4)** に主表として出し、
その直下に **代替案サマリ** を添える (順序整合: 実行サマリ → 推奨案 cluster table → 代替案サマリ → 末尾詳細):

- 推奨案: `recommended.angle` の cluster table を上記テーブル形式で全文提示 (これが承認対象)。
- 代替案: 他 `candidates[]` を 1 行サマリ (`angle` / cluster 数 / JS score の total / 一言 assessment) で列挙。
- evaluator 根拠: `evaluator.rationale` を 2-4 行引用 (なぜこの案が推奨か、tradeoff の裁定理由)。
- `recommended.corrected:true` の場合は「evaluator の推奨が無効 angle だったため JS top に矯正」と明記。

ユーザーが推奨案で良ければ承認、別 angle を採りたい場合は「Keep planning with feedback」で angle を指定する
(→ 1-3-2 の軽微修正: 確定 candidate を差し替えて ExitPlanMode 再呼び出し。再 clustering は不要)。

テーブル形式 (`_shared/clustering.md` の「ユーザー提案フォーマット」準拠、**confidence と根拠を必ず含める**):

```
### 最優先 (blocking findings) — 他クラスタより先に直列実行
| ID        | Issue | module | expert         | 変更候補                  | blocking_reason                           |
|-----------|-------|--------|---------------|--------------------------|------------------------------------------|
| block-1   | #88   | report | refactor-expert| src/features/report/**   | 新規変更が既存 architecture_debt を悪化  |

### 並列実行候補 (blocking 完了後)
| ID      | Issue       | module | expert         | 変更候補                    | confidence | 並列理由                       |
|---------|-------------|--------|---------------|----------------------------|-----------|-------------------------------|
| auth-1  | #42 #43     | auth   | debug-expert    | src-tauri/src/auth/**      | high      | 他クラスタと変更候補重複なし   |
| ui-1    | #51         | ux-ui  | designer-expert | frontend/src/pages/login/**| high      | 単独ページ専用コンポーネント (post-check: ux-ui-audit-expert) |

### 直列化対象
| ID     | Issue | 理由                                                  |
|--------|-------|------------------------------------------------------|
| core-1 | #60   | Cargo.toml / src/lib.rs を触る可能性あり (risk_flag) |
| ?-1    | #70   | confidence: low (本文からファイル抽出不可)            |
```

クラスタ別解説 (自然文) のお手本サンプル文 3 例 (debug / refactor / feature) は
`references/plan-mode-gate.md` の「cluster 解説サンプル文」節を参照する
(司令官はそのまま流用せず、対象 cluster の expert / Issue / 影響範囲に応じて表現を調整する)。

plan file 書き出し後、司令官は `ExitPlanMode` tool を呼ぶ。
Claude Code はユーザーに 4 つの承認オプション (`Approve and accept edits` /
`Approve and start in auto mode` / `Approve and review each edit manually` /
`Keep planning with feedback`) を提示する。各オプションでの op-run フェーズ 2 以降の
permission 挙動と推奨選択肢は `references/plan-mode-gate.md` の「1-3-2 ExitPlanMode 呼び出しと 4 オプション挙動」を参照
(推奨: `Approve and accept edits`)。

#### 1-3-2. Keep planning with feedback への対応

ユーザーが「Keep planning with feedback」を選んだ場合、修正内容に応じて以下に分岐する:

- **軽微修正** (表現変更 / 解説追記 / 並列度変更) → plan file 編集して ExitPlanMode 再呼び出し
- **構造修正** (クラスタ分割 / 統合 / 直列化指定 / expert 変更 / Issue 除外) → フェーズ 1-2 (クラスタリング) から再実行
- **設計レベル変更** (対象 Issue 入れ替え / `--label` 変更 / `--normalize` 切り替え) → フェーズ 1-1 (Issue 取得) から再実行

詳細 (op-plan よりも構造修正の頻発理由を含む) は `references/plan-mode-gate.md` の「1-3-3 Keep planning with feedback」を参照。

#### 1-3-3. tool 未提供時の v1 互換フォールバック

`EnterPlanMode` / `ExitPlanMode` tool 未提供時 (古い CLI バージョン / 特殊環境 /
tool listing から除外) または `EnterPlanMode` 呼び出しがユーザー No で拒否された場合、
v1 互換の対話プレビュー (cluster table 表示 + `この内容で実装を開始しますか? 1.実行する 2.修正要求 3.キャンセル`)
にフォールバックする (機能停止しない)。詳細は `references/plan-mode-gate.md` の「1-3-4 v1 互換フォールバック」を参照。

**自動モード (`--auto`)**: フェーズ -1 で plan mode を skip 済み (対話モード専用のため)。
本節 1-3 の plan file / ExitPlanMode 一連の処理も skip し、競合のあるクラスタ・Critical 系・
`low` confidence をスキップ、残りを自動実行する。
judge-panel 有効時は **`recommended.angle` の candidate を自動採択** する (人間選定の代わり、ADR-0014)。
`ok:false` フォールバック時は従来の司令官単発グルーピングで自動実行する。

---

## フェーズ1.5: Issue 健全性チェックと正規化委譲

<!-- Issue #425 Stage 2 で物理切り出し済み (god file 抑制) -->

フェーズ1-1 (Issue 取得) と フェーズ1-2 (クラスタリング) の間に挟む処理。
人間立て Issue / 古い形式 Issue / op-architect / op-scan / op-patrol 起票 Issue が混在する
取得結果を、**指示書フル版を持つ Issue だけがクラスタリングに進む** ように正規化する。

詳細仕様 (1.5-1 健全性判定 / 1.5-1-b 未トリアージ Issue の soft nudge (ADR-0017 決定11、未トリアージ複数なら plan に一行 nudge・非 block・`--auto` では出さない) /
1.5-2 partial Issue の op-scan 委譲 / 1.5-3 insufficient Issue の投げ返し /
1.5-4 派生 Issue の取り込みと再クラスタリング / 1.5-5 ループ防止 / 1.5-6 同期待ちタイムアウト) は
`~/.claude/skills/op-run/references/issue-health-check.md` (>=1) を参照。

---

## フェーズ2: クラスタ並列実装 (探知 → 再クラスタ → ClusterOrchestrator 起動 の 3 段階)

Issue 本文の事前情報だけでは競合は完全に検出できない。
**探知フェーズで実際に触りそうなファイルを再申告させ、Stage 2 競合検出を経てから ClusterOrchestrator を起動する**。

| フェーズ | 内容 | 並列性 |
|---------|------|-------|
| 2-A 探知 | 各 expert が investigate のみ。investigation report を提出 (edit / commit / push 禁止) | 全クラスタ並列可 |
| 2-B 再クラスタリング | 司令官が `files_likely_to_modify` で Stage 2 競合検出 | 司令官のみ |
| 2-Orchestrate | ClusterOrchestrator を parallel_clusters は並列、serial_chains は直列で起動 | Stage 2 の結果に従う |
| 2-D Post-run conflict check | 司令官が ClusterSummary 受領後に実 diff の重複検証を経て push する | 司令官のみ |

### 2-A. 探知フェーズ

#### 2-A-1. worktree provision (cluster ごとに 1 回確定、決定B / 案B′)

各クラスタについて司令官が `op run worktree-provision` で worktree を **1 回確定** する
(`_shared/worktree-ops.md` 参照)。**探知 (2-A) と修正 (ClusterOrchestrator 内) で同一 worktree を再利用** するため、
controller は worktree を 1 回だけ provision し、返却 `payload.worktree_path` を
discover / ClusterOrchestrator の args に **reuse 注入** する。

```bash
# cluster ごとに worktree を 1 回確定する (controller sequential ループ、並列化禁止)
# 旧 git worktree add の controller fence は廃止 (provision primitive に集約)。task-id は controller が確定し
# op run worktree-provision に渡す (provision が auto/<task-id> branch + base SHA pin + repo 外配置を一貫管理)。
# OP_RUN_REPO はフェーズ0-base で export 済 (例: "owner/repo-name")
export RUN_TS="$(date +%Y%m%d-%H%M%S)"   # bundle-level run timestamp。discover/ClusterOrchestrator の args.ts に渡す + TASK_ID に共用 (cluster 横断で同一)
# op run worktree-provision の --repo は **repo 絶対パス** を要する (gh 用 slug OP_RUN_REPO ではない。
# slug を渡すと "cannot change to '<owner>/<repo>'" で fail する — C1 Ladder4 受け入れで検出)。
OP_RUN_REPO_PATH="$(git rev-parse --show-toplevel)"   # controller の repo working copy 絶対パス
for cluster in approved_clusters:
  TASK_ID="<verb>-<scope>-${RUN_TS}-${cluster.id_short}"   # 秒粒度 (RUN_TS) + cluster id で衝突回避。cluster.task_id として保持
  op run worktree-provision \
    --task-id "${TASK_ID}" \
    --base-sha "${OP_RUN_BASE_SHA}" \
    --cluster-id "${cluster.id_short}" \
    --repo "${OP_RUN_REPO_PATH}"
  # 返却 payload.worktree_path を cluster.worktree_path として保持し、discover/ClusterOrchestrator の args に reuse 注入する
```

すべてのクラスタが **同じ `OP_RUN_BASE_SHA` (= `origin/${OP_RUN_BASE_REF}`) から分岐** する (rebase 地獄回避)。
worktree は探知と修正で**同一のものを再利用**する (作業ディレクトリは保持)。apply worktree は
post-check / global review 完了まで prune しない (ClusterOrchestrator が内部で review worktree を別 detach checkout として作る)。

`TASK_ID` は秒粒度 + cluster id を含むため、並列クラスタ間で worktree path / ブランチ名 (`auto/<TASK_ID>`) が衝突しない。

#### 2-A-2. 探知 workflow を呼び出す (op-run-discover)

controller は探知フェーズを `op-run-discover` workflow に委譲する。workflow は各 cluster の
provision 済 worktree で investigation reader を別 context で並列 spawn し
(**修正・コミット・push は禁止**で investigation のみ)、investigation report 配列を controller へ返す。
spawn 並列管理 (16 並列上限の透過キューイング) は workflow runtime が担い、controller は人為 cap しない。

```
# controller が探知 workflow を 1 呼び出しで起動する (args は object。script 側が JSON 文字列を parse する正規化シム済み)
const discoverOut = Workflow({
  name: 'op-run-discover',
  args: {
    clusters: approved_clusters.map(c => ({
      id:             c.id,
      id_short:       c.id_short,
      expert:         c.expert,          // 1-2-d で active expert へ正規化済
      model:          c.model,           // model-selection.md §6 controller 決定フロー
      module:         c.module,
      issues:         c.issues,          // [番号, ...]
      files_declared: c.files_declared,  // Issue 宣言の事前ファイル候補
      worktree_path:  c.worktree_path,   // 2-A-1 で provision 済 (reuse 注入)
    })),
    base_sha: OP_RUN_BASE_SHA,
    base_ref: OP_RUN_BASE_REF,
    ts:       RUN_TS,                     // bundle-level の run timestamp
  },
})
// discoverOut = { base_sha, base_ref, ts, reports: [investigationSchema...] }
// reports[].files_likely_to_modify が controller の Stage2 競合検出 (2-B) の入力になる。
```

#### 2-A-3. report 集約 (discover 戻り値が barrier)

`op-run-discover` の戻り値 `discoverOut.reports` がそのまま Stage2 の barrier になる
(全 reader の investigation report が揃った状態で controller に返る)。controller 側の Monitor 待ち合わせは不要。
report が欠けている / 探知失敗のクラスタは `files_likely_to_modify` 空 / `needs_serialization: true` として
2-B で直列化対象に倒す (失敗 worktree の隔離は `_shared/worktree-ops.md` の cleanup ルールに従う)。

### 2-B. 再クラスタリング (Stage 2 競合検出)

**Stage 2 競合検出は controller の責務として保持・強化する** (barrier はここ、apply pipeline には埋めない)。
2-A の `discoverOut.reports[].files_likely_to_modify` を入力に、
`_shared/clustering.md` の **Stage 2: Post-investigation conflict check** を実施する。

```
# discoverOut.reports を入力に controller が Stage2 競合検出する (discover 戻り値が barrier)
for cluster_a in discoverOut.reports:
  for cluster_b in discoverOut.reports:
    if cluster_a.cluster_id == cluster_b.cluster_id: continue
    overlap = cluster_a.files_likely_to_modify ∩ cluster_b.files_likely_to_modify
    if overlap:
      → 該当クラスタペアは修正フェーズで並列化しない (density は 2-B-density で `op run cluster recheck` が算出)
```

加えて以下も直列化対象:

- いずれかのクラスタが `needs_serialization: true` を返した
- `risk_files` が他クラスタと共有
- `files_likely_to_modify` が空 (探知失敗)

司令官は再構成した実行計画をユーザーに提示する (対話モード)。
`--auto` モードでは、Stage 2 で重複が出た時点で並列化せず自動的に直列に切り替える。

#### 2-B-density. density 観測値で `EFFECTIVE_MAX_PARALLEL` を再算出 (Phase 2-B 直後)

/**
 * 機能概要: Stage 2 競合判定で観測した `files_likely_to_modify` 重複ペア比から density を算出し、
 *           `op cluster max-parallel` を再呼び出しして `EFFECTIVE_MAX_PARALLEL` を再評価する。
 * 作成意図: Phase 1 末の density=0.0 (initial) は事前情報のみで pessimistic / optimistic が
 *           ずれる。Stage 2 で実観測した重複ペアから density を再算出し、修正フェーズの
 *           並列上限を実態に寄せる (ADR-0007 v3 §4.2-v3)。
 * 注意点: density 算出式は `_shared/clustering.md (>=6)` の density 算出節と同じ
 *         (`files_likely_to_modify` の cluster 間重複ペア数 / C(cluster_count, 2))。
 *         cluster_count < 2 のとき density = 0.0 (組合せ 0 件)。
 *         `OP_RUN_MAX_PARALLEL` explicit override は再算出をスキップする (環境変数が勝つ)。
 */

`OP_RUN_MAX_PARALLEL` が explicit override されていない場合のみ、density 観測値で動的算出を再評価する。
density は Phase 2-A で全 cluster が提出した `files_likely_to_modify` の cluster 間重複ペア数を、
全 cluster ペアの組合せ数 `C(cluster_count, 2)` で割って算出する (詳細式は `_shared/clustering.md (>=6)` 参照)。

density の算出は `op run cluster recheck` に閉じる (Stage 2 の `files_likely_to_modify` 重複ペア比 /
C(cluster_count, 2) を CLI 側で算出、bash の awk 手計算を排除して subshell drift を構造排除、Refs #759)。
controller は discover reports を `[{"cluster_id": "c1", "files_likely_to_modify": [...], "needs_serialization": false}, ...]`
形式に組み立てて `--results-json` に渡す。

```bash
if [ -z "${OP_RUN_MAX_PARALLEL:-}" ]; then
  # CLUSTER_COUNT は前フェーズ (1-2-f) で export されている前提。下流の jq --arg cc で参照されるため、
  # 未設定の場合は fail-fast で即停止し silent exit 0 を防ぐ (CLAUDE.md 不変則2、Issue #761)。
  : "${CLUSTER_COUNT:?CLUSTER_COUNT が未設定: 1-2-f の export が前フェーズで行われていない}"
  # op run cluster recheck が density (= 重複ペア数 / C(cluster_count, 2)) を算出する
  # 算出規約は `_shared/clustering.md (>=6)` の density 算出節を参照 (CLI と prose で同一式)。
  # ※ 旧 awk 手計算 (OVERLAP_PAIRS 使用) は #759 で CLI へ移行済みのため、OVERLAP_PAIRS guard は不要。
  DENSITY=$(op run cluster recheck --results-json /tmp/cluster-recheck.json \
    | jq -r '.payload.density')

  INPUT=$(jq -n --arg cc "$CLUSTER_COUNT" --arg d "$DENSITY" \
    '{cluster_count:($cc|tonumber), density:($d|tonumber), ceiling:null}')
  EFFECTIVE_MAX_PARALLEL=$(printf '%s' "$INPUT" \
    | op cluster max-parallel --input-json - \
    | jq -r '.details.max_parallel')
  export EFFECTIVE_MAX_PARALLEL
fi
```

density が高い (cluster 同士が重なる) 場合、`op cluster max-parallel` は max_parallel を下げる方向に算出する
(`phase1_equivalent` との `divergence_from_phase1` 値で乖離を観察可)。
**修正・review フェーズは ClusterOrchestrator (Agent tool) が担う** (ADR-0016) ため、
controller は chunk 件数を判定して起動を分割しない (chunk 判定表は撤廃)。

#### 2-B-partition. parallel_clusters / serial_chains の確定 (決定D)

Stage 2 競合検出と density 再算出の結果から、controller は修正フェーズへ渡す partition を **確定** する:

- **parallel_clusters**: Stage 2 で重複 / 直列化対象に該当しなかった独立 cluster 群
  (ClusterOrchestrator を 1 メッセージ内で並列 spawn する)
- **serial_chains**: 競合ペア / `needs_serialization: true` / `risk_files` 共有 / 探知失敗の cluster を
  競合関係に基づき逐次 chain にまとめる (controller-side 直列ループで逐次 await)

**serialization は dispatch 順序 (serial_chains への配置) で強制する。prompt hint には依存しない** (決定D)。
controller はこの partition を ClusterOrchestrator spawn の引数として渡し、
直列化を実行構造として保証する (apply agent への「直列でお願い」という prompt 文言で誘導しない)。

```markdown
## Stage 2 結果

| クラスタ | files_likely_to_modify | 判定        | partition       | 理由                    |
|---------|------------------------|-------------|-----------------|------------------------|
| auth-1  | src/auth/**, lib.rs    | 直列化      | serial_chains   | core-1 と lib.rs 重複  |
| ui-1    | pages/login/**         | 並列継続    | parallel_clusters | 重複なし              |
| core-1  | lib.rs, Cargo.toml     | 直列化      | serial_chains   | auth-1 と lib.rs 重複  |
```

### 2-Orchestrate. ClusterOrchestrator 並列/直列起動 (ADR-0016)

/**
 * 機能概要: Stage 2 で確定した partition に従い、controller が ClusterOrchestrator を
 *           Agent tool で並列 (parallel_clusters) または直列 (serial_chains) に起動する。
 * 作成意図: ADR-0016 決定1。旧 op-run-fanout / op-run-postcheck / op-run-review Workflow を
 *           ClusterOrchestrator Agent に統合し、controller のコンテキスト溢れを解消する。
 *           各 ClusterOrchestrator は独立コンテキスト (~200K) でライフサイクル全体を完結させ、
 *           controller には compact summary (~200 bytes) のみを返す。
 * 注意点: serial_chains は controller-side 直列ループで強制する。prompt hint ではなく
 *         起動順序で直列化を保証する (旧 op-run-fanout の決定D を継承)。
 */

#### 2-Orchestrate-pre. session_id の bundle-level 事前 mint

ClusterOrchestrator は review-expert spawn 前に `SESSION_ID` を使うが、PR 番号確定前に
spawn されるため controller が **事前 mint** する:

```bash
# bundle-level SESSION_ID を ClusterOrchestrator spawn 前に mint する
# (旧設計: フェーズ4-2-pre-2 で PR 番号確定後に mint → 新設計: bundle-level 事前 mint)
: "${OP_RUN_BASE_SHA:?OP_RUN_BASE_SHA must be set by フェーズ0-base}"
: "${RUN_TS:?RUN_TS must be set by フェーズ2-A}"

if [ -z "${OP_RUN_SESSION_ID:-}" ]; then
  OP_RUN_SESSION_ID="oprun-${RUN_TS}-bundle-${OP_RUN_TASK_BUNDLE_ID##*-}"
fi
export OP_RUN_SESSION_ID
```

#### 2-Orchestrate-parallel. parallel_clusters の並列起動

Stage 2 で parallel_clusters に分類されたクラスタを **1 メッセージ内の複数 Agent 呼び出し** で
並列起動する。各 Agent は ClusterOrchestrator の指示書 (`cluster-orchestrator-directives.md`) に
従って 1 クラスターのライフサイクルを完結させ、`ClusterSummary` (~200 bytes) を返す。

```
# ClusterOrchestratorInput を各クラスタについて組み立て、Agent tool で並列 spawn する
# expert_directives_text は controller が references/apply-prompt-directives.md の
# common 節 + 当該 expert 節を Read して結合してから渡す (未注入は contract violation)
# 全 Agent 呼び出しを 1 メッセージに並べることで並列実行を保証する
# ClusterOrchestrator 向け注記: background child (apply-expert/review-expert) が
# rest 状態になっても無限待ちしない。git log / completion 情報でフェーズを先へ進めること。

for each cluster in parallel_clusters:
  CLUSTER_INPUT=$(jq -n \
    --arg cluster_id   "${cluster.id}" \
    --arg id_short     "${cluster.id_short}" \
    --argjson issues   "$(printf '%s\n' "${cluster.issues[@]}" | jq -R . | jq -s .)" \
    --arg expert       "${cluster.expert}" \
    --arg model        "${cluster.model}" \
    --arg module       "${cluster.module}" \
    --arg worktree     "${cluster.worktree_path}" \
    --argjson inv_rep  "${cluster.investigation_report_json}" \
    --argjson files_m  "$(printf '%s\n' "${cluster.files_likely_to_modify[@]}" | jq -R . | jq -s .)" \
    --argjson files_a  "$(printf '%s\n' "${cluster.files_allowed[@]}" | jq -R . | jq -s .)" \
    --argjson files_f  "$(printf '%s\n' "${cluster.files_forbidden[@]}" | jq -R . | jq -s .)" \
    --arg base_sha     "${OP_RUN_BASE_SHA}" \
    --arg base_ref     "${OP_RUN_BASE_REF}" \
    --arg ts           "${RUN_TS}" \
    --arg session_id   "${OP_RUN_SESSION_ID}" \
    '{cluster_id:$cluster_id, id_short:$id_short, issues:$issues,
      expert:$expert, model:$model, module:$module, worktree_path:$worktree,
      investigation_report:$inv_rep, files_likely_to_modify:$files_m,
      files_allowed:$files_a, files_forbidden:$files_f,
      base_sha:$base_sha, base_ref:$base_ref, ts:$ts, session_id:$session_id}')

  # Agent tool で ClusterOrchestrator を spawn (1 メッセージに全 parallel cluster 分を並べる)
  Agent({
    subagent_type: "feature-expert",
    description: "ClusterOrchestrator: ${cluster.id_short}",
    model: "${cluster.model}",
    prompt: `
      invocation_mode: op_managed

      あなたは ClusterOrchestrator です。以下の指示書に完全に従ってください:
      skills/op-run/cluster-orchestrator-directives.md

      入力 payload (JSON):
      ${CLUSTER_INPUT}

      expert_directives_text (apply-expert prompt 注入用):
      ${cluster.expert_directives_text}

      完了したら ClusterSummary (JSON) を返してください。
    `
  })
```

#### 2-Orchestrate-serial. serial_chains の直列起動 (controller-side)

Stage 2 で serial_chains に分類されたクラスタは **controller-side 直列ループ** で起動する。
前の ClusterOrchestrator が ClusterSummary を返してから次を起動することで直列化を保証する
(prompt hint ではなく起動順序で強制する。旧 op-run-fanout 決定D を継承)。

```
# serial_chains: 各 chain を逐次 await するループ
# 前の ClusterOrchestrator が返るまで次は起動しない
# ClusterOrchestrator 向け注記: background child (apply-expert/review-expert) が
# rest 状態になっても無限待ちしない。git log / completion 情報でフェーズを先へ進めること。
CHAIN_SUMMARIES=()  # 配列初期化 (CLAUDE.md bash fence convention)
for chain in serial_chains:
  CHAIN_SUMMARY_JSON=""
  for cluster in chain:
    # 1 クラスタずつ Agent spawn → 完了 await → 次へ
    CLUSTER_INPUT=... # (parallel_clusters と同じ組み立て)
    CHAIN_SUMMARY_JSON=$(Agent({
      subagent_type: "feature-expert",
      description: "ClusterOrchestrator: ${cluster.id_short} (serial)",
      model: "${cluster.model}",
      prompt: `...` # parallel_clusters と同じ prompt 構造
    }))
    CHAIN_SUMMARIES+=("${CHAIN_SUMMARY_JSON}")
```

### 2-D. Post-run conflict check (実 diff の最終検証)

各 ClusterOrchestrator から ClusterSummary が返った後、**PR 最終確認前**に司令官が実 diff を取得して最終検証する。
この時点では各 ClusterOrchestrator が内部で push / PR 作成済みのため、git log で確認する。

> **2-D は不変則7 上 push 可否を決める不可逆判定であり、verify (2-E-0) とは別目的・混同/削除厳禁。**
> ClusterSummary の `cluster_id` をキーに、controller が保持する cluster list (parallel_clusters / serial_chains の各 cluster) から `worktree_path` を引いて検証する。
> ClusterSummary 正本は `worktree_path` を持たない (ADR-0016 compact schema 維持)。

controller 保持の cluster list (parallel_clusters + serial_chains を展開、各 cluster に worktree_path を持つ) から
cluster_id で worktree_path を解決し、`op run cluster-overlap` で各 worktree の実 diff overlap を一括検証する。
worktree ごとの `git diff --name-only` と cluster 間重複検出は CLI 側に閉じる (subshell drift を構造排除、Refs #759)。
spec: `op-tools/docs/specs/run-cluster-overlap.md`。

```bash
# cluster_id → worktree_path の対応を JSON 配列に組み立てて --clusters-json に渡す
# base-ref はフェーズ0-base で確定済 (OP_RUN_BASE_REF)。CLI 内部で <base-ref>...HEAD の triple-dot 差分を取る
OVERLAP_JSON=$(op run cluster-overlap --clusters-json /tmp/cluster-worktrees.json --base-ref "origin/${OP_RUN_BASE_REF}")

# competing_file_groups が空でなければ実 diff 重複あり → ユーザーに competing diff を提示
COMPETING=$(printf '%s' "$OVERLAP_JSON" | jq -r '.payload.competing_file_groups | length')
if [ "$COMPETING" -gt 0 ]; then
  printf '%s' "$OVERLAP_JSON" | jq '.payload.competing_file_groups'
  # → ユーザーに competing diff を提示
fi
```

`/tmp/cluster-worktrees.json` は `[{"cluster_id": "c1", "worktree_path": "..."}, ...]` 形式
(controller が cluster list から cluster_id ごとに worktree_path を引いて組み立てる)。

実 diff で重複が見つかった場合:

| 状況 | 対処 |
|------|------|
| 1 クラスタずつ直列だった | そのまま確認 (rebase で解消可能) |
| 並列実行されていた | ユーザーに competing diff を提示し、片方を破棄 / rebase / 手動マージのいずれかに回す |

### 2-E. ClusterSummary 受領と進捗監視 (ADR-0016)

controller は各 ClusterOrchestrator が返した `ClusterSummary` を受領し、
verdict 別に分岐する。旧 `fanoutOut.clusters[].verify.verdict` の受領・PR open は
ClusterOrchestrator 内部 (directives.md フェーズ2-7) に移管済み。
claim release は controller の責務 (2-E-0) であり ClusterOrchestrator には移管していない。

```typescript
interface ClusterSummary {
  cluster_id:           string;
  pr_url:               string | null;
  verdict:              "approved" | "approve_with_followup" | "needs_human_decision" | "terminal_new_pr";
  round:                number;
  new_pr_url?:          string;       // terminal_new_pr 時のみ
  followup_issue_url?:  string;       // approve_with_followup 時のみ
  critical_count:       number;
  blocker_reason?:      string;       // needs_human_decision 時のみ (1〜2 文要約)
  pending_label?:       string | null;  // CO が貼れなかった label (例: "pro-reviewed")
  unfiled_followup?:    {               // CO が起票できなかった follow-up
    title:  string;
    body:   string;
    labels: string[];
  } | null;
}
```

> **写し注記**: 上記は directives.md フェーズ8 ClusterSummary interface の controller 受領側の写し。
> 正本は `cluster-orchestrator-directives.md` フェーズ8。両者の同期が必須。

#### 2-E-0. ClusterSummary verdict 受領 gate (mandatory)

各 ClusterOrchestrator の返却後、controller は以下に分岐する:

| verdict | controller の動作 |
|---------|-----------------|
| `approved` | claim release (best-effort) → status table 更新 |
| `approve_with_followup` | claim release → `followup_issue_url` をフォローアップ候補に記録 |
| `needs_human_decision` | claim release → `blocker_reason` をユーザーに提示。ブロック |
| `terminal_new_pr` | claim release → `new_pr_url` をユーザーに提示。次回 op-merge / op-run を案内 |

**claim release はすべての verdict で controller が行う** (best-effort、TTL 残存防止):

ClusterSummary の `cluster_id` をキーに、controller が保持する cluster list
(parallel_clusters / serial_chains を展開、各 cluster に issues[] を持つ) から
当該 cluster の Issue 番号集合を解決する (2-D の worktree_path 解決パターンと同型)。
ClusterSummary compact schema に issues[] を追加しないことで ADR-0016 を維持する。

事前準備: controller は 2-Orchestrate 起動前に parallel_clusters と serial_chains を展開し、
`ALL_CLUSTERS_JSON` (= `[{"cluster_id":"c1","issues":[42,43],...}, ...]` 形式の JSON 文字列) を
export しておく。これにより 2-E-0 fence が独立 subshell でも cluster list を参照できる。
`ALL_CLUSTERS_JSON` は各 cluster オブジェクトの `cluster_id` と `issues[]` を jq で直接組み立てる。

```bash
# [事前: 2-Orchestrate 起動前フェーズ] cluster list を JSON 配列にシリアライズして export
# parallel_clusters と serial_chains (展開済み) を結合した全クラスタのリスト
# 各要素は {"cluster_id": string, "issues": [int, ...]} を最低限持つ
# cluster オブジェクトは controller が 1-2 クラスタリング結果として保持しているため直接参照できる
ALL_CLUSTERS_JSON_ARRAY=()   # 配列初期化 (CLAUDE.md bash fence convention 不変則4)
for cluster_json in "${ALL_CLUSTER_OBJECTS[@]}"; do
  # cluster_json は {"cluster_id":"c1","issues":[42,43],...} 形式の JSON 文字列
  # ALL_CLUSTER_OBJECTS は parallel_clusters + serial_chains を展開した各 cluster オブジェクト配列
  CLUSTER_ENTRY=$(jq -c '{cluster_id: .cluster_id, issues: .issues}' <<< "$cluster_json")
  ALL_CLUSTERS_JSON_ARRAY+=("$CLUSTER_ENTRY")
done
ALL_CLUSTERS_JSON=$(printf '%s\n' "${ALL_CLUSTERS_JSON_ARRAY[@]}" | jq -s '.')
export ALL_CLUSTERS_JSON
```

> **補足**: `ALL_CLUSTER_OBJECTS` は controller が ClusterPlan (op run cluster 出力) をループして作成する配列。
> 例: `ALL_CLUSTER_OBJECTS=()` で初期化後、`for cluster in parallel_clusters serial_chains_flat` で
> `ALL_CLUSTER_OBJECTS+=("$CLUSTER_JSON")` と積む。cluster_json の形式は ClusterOrchestratorInput と同一。

```bash
# ClusterSummary 受領後に controller が claim release を実行 (各 ClusterOrchestrator 返却時に 1 回実行)
# CLUSTER_SUMMARY_JSON は受領した ClusterSummary の JSON 文字列
: "${CLUSTER_SUMMARY_JSON:?CLUSTER_SUMMARY_JSON must be set to the received ClusterSummary JSON}"
: "${ALL_CLUSTERS_JSON:?ALL_CLUSTERS_JSON must be exported before 2-Orchestrate}"
SUMMARY_CLUSTER_ID=$(jq -r '.cluster_id' <<< "$CLUSTER_SUMMARY_JSON")
: "${SUMMARY_CLUSTER_ID:?SUMMARY_CLUSTER_ID could not be extracted from ClusterSummary}"

# controller 保持の cluster list から cluster_id で当該 cluster の issues[] を解決する
# (2-D で cluster_id → worktree_path を解決するのと同じパターン)
CLUSTER_ISSUES=()   # 配列初期化 (CLAUDE.md bash fence convention 不変則4)
while IFS= read -r ISSUE_NUM; do
  CLUSTER_ISSUES+=("$ISSUE_NUM")
done < <(jq -r --arg cid "$SUMMARY_CLUSTER_ID" \
  '.[] | select(.cluster_id == $cid) | .issues[]' <<< "$ALL_CLUSTERS_JSON")
: "${CLUSTER_ISSUES[0]:?CLUSTER_ISSUES が空: cluster_id=$SUMMARY_CLUSTER_ID に対応する cluster が未解決}"

for ISSUE in "${CLUSTER_ISSUES[@]}"; do
  op claim release --repo "$OP_RUN_REPO" --issue "$ISSUE" --task-id "$OP_RUN_TASK_BUNDLE_ID" \
    || echo "⚠️ op claim release 失敗: #$ISSUE (best-effort、sweep で回収)" >&2
done
```

> **⚠️ claim release を skip してはならない**: `needs_human_decision` / `terminal_new_pr` 時でも
> release しないと TTL 残存が蓄積する。失敗は `op claim sweep` が回収するため best-effort で足りる。

#### 2-E-3. CO write 取りこぼし回収 (mandatory)

ClusterSummary に `pending_label` が非 null の場合:
- `op core marker-lint` 検証後に controller が `gh pr edit --add-label` で補完する

ClusterSummary に `unfiled_followup` が非 null の場合:
- controller が `gh issue create` で起票し、`followup_issue_url` 相当として記録する

`#756 op review publish-approval` primitive が成功した場合は `pending_label` が null になる (整合)。

#### 2-E-1. status table 再 render 規約

フェーズ2-Orchestrate の各 ClusterOrchestrator 完了時に status table を再 render する。
(旧: fanoutOut / postcheck / review Workflow 戻り値受領 trigger → 新: ClusterSummary 受領 trigger)

#### 2-E-2. status table フォーマット定義

列構成 (ADR-0007 §4.5 + ADR-0006 claim 統合 1 table、verdict 列を追加):

| # | cluster_id | Issue | expert | Claim | Status | PR | verdict |
|---|---|---|---|---|---|---|---|

**列値域:**

| 列 | 値域 |
|---|---|
| `Claim` | `owned (task=<task-id>)` / `not-owned (skipped)` / `—` (claim 不要 / sweep 前) |
| `Status` | `running` / `done` / `blocked` / `failed` / `terminal` / `pending` (未発火) |
| `PR` | `https://github.com/.../pull/<N>` / `—` (未作成) / `none — <reason>` (作成しない場合) |
| `verdict` | `approved` / `approve_with_followup` / `needs_human_decision` / `terminal_new_pr` / `—` (未完了) |

**例:**

| # | cluster_id | Issue | expert | Claim | Status | PR | verdict |
|---|---|---|---|---|---|---|---|
| 1 | auth-1 | #42, #43 | debug-expert | owned (task=fix-auth-20260517-133219-c1) | done | https://github.com/owner/repo/pull/210 | approved |
| 2 | ui-2 | #45 | feature-expert | owned (task=feat-ui-20260517-133219-c2) | running | — | — |
| 3 | api-3 | #47 | feature-expert | not-owned (skipped) | blocked | — | needs_human_decision |

---

## フェーズ3: PR 作成 (ClusterOrchestrator に移管済み)

/**
 * 作成意図: ADR-0016 により PR 作成は ClusterOrchestrator 内部 (directives.md フェーズ4) に移管。
 * controller は worktree push / op pr create を行わない。
 * ClusterSummary.pr_url でフェーズ2-E から PR URL を受け取る。
 * Marker Publish Validate は ClusterOrchestrator が実施する (directives.md フェーズ6)。
 */

PR の作成・push・Issue comment は ClusterOrchestrator が行う
(`skills/op-run/cluster-orchestrator-directives.md` フェーズ4/7 参照)。
claim release は controller が 2-E-0 で行う (ClusterOrchestrator には移管していない)。
controller は `ClusterSummary.pr_url` を受け取るだけ。

### 3-1-a. follow-up / 残存リスクの転記

apply 完了報告の `recommended_followup_experts[]` / `needs_human_decision` block /
`assumptions[]` / `blocked_actions[]` の転記は ClusterOrchestrator が PR 本文に行う。
controller はフェーズ2-E の ClusterSummary から `followup_issue_url` を受け取り、
フェーズ5 完了報告の follow-up 候補一覧に列挙する。

---

## フェーズ3.5: Post-check Dispatch (ClusterOrchestrator に移管済み)

/**
 * 作成意図: ADR-0016 により post-check dispatch 判定は ClusterOrchestrator 内部
 *           (directives.md フェーズ5.5、references/post-check-dispatcher.md 参照) に移管。
 * 旧「dispatch 判定は controller の責務として保持する」という宣言は廃止。
 */

post-check expert の dispatch 判定 (ux-ui-audit-expert / security-expert / null) は
`cluster-orchestrator-directives.md` フェーズ5.5 が担う
(`references/post-check-dispatcher.md` へのポインタ参照)。
controller は post-check 結果を ClusterSummary の `verdict` フィールドで受け取る。

---

## フェーズ4: Global Review (ClusterOrchestrator に移管済み)

/**
 * 作成意図: ADR-0016 により review-expert spawn / marker 組立 / review_round 管理 /
 *           OP_RUN_SESSION_ID mint は ClusterOrchestrator 内部 (directives.md フェーズ5-6) に移管。
 * 旧 op-run-review.js Workflow は削除済み。
 */

Global Review は `cluster-orchestrator-directives.md` フェーズ6 が担う
(review worktree 作成 / review_model 決定 / lens 選択 / marker 組立 / Marker Publish Validate は
`references/global-review-spawn.md` (>=3) へのポインタ参照)。
controller は review 結果を ClusterSummary の `verdict` / `critical_count` / `blocker_reason` で受け取る。

OP_RUN_SESSION_ID は controller がフェーズ2-Orchestrate-pre で bundle-level 事前 mint した値を使用する。
各 ClusterOrchestrator は内部で新規 mint しない。

---

## フェーズ4.5: Review Fix / Specialist Decision Loop (ClusterOrchestrator に移管済み)

/**
 * 作成意図: ADR-0016 により Review Fix Loop は ClusterOrchestrator 内部
 *           (directives.md フェーズ7、references/review-fix-loop.md 参照) に移管。
 * 3 値 verdict (approved / approve_with_followup / needs_human_decision) により
 * op-merge への到達が保証される (ADR-0016 決定5)。
 */

Review Fix Loop は `cluster-orchestrator-directives.md` フェーズ7 が担う
(`references/review-fix-loop.md` §4.5 へのポインタ参照)。
terminal 処理 (round >= 3 → close + 新規 PR) も ClusterOrchestrator が自動実行する (ADR-0016 決定6)。
controller は `verdict: "terminal_new_pr"` と `new_pr_url` を compact summary で受け取り、
ユーザーに新規 PR URL を提示する。自動再 review は走らせない (無限再帰防止)。

---

## フェーズ5: 完了報告

```
## op-run 完了

### 実装結果 (統合 status table、ADR-0007 §4.5 + ADR-0006 claim 統合 1 table + ADR-0016 verdict)

| # | cluster_id | Issue | expert | Claim | Status | PR | verdict |
|---|---|---|---|---|---|---|---|
| 1 | auth-1 | #42 #43 | debug-expert | owned (task=fix-auth-...) | done | https://github.com/.../pull/61 | approved |
| 2 | forms-1 | #51 | feature-expert | owned (task=feat-forms-...) | done | https://github.com/.../pull/62 | approve_with_followup |
| 3 | db-1 | #60 | refactor-expert | owned (task=refactor-db-...) | blocked | — | needs_human_decision |
| 4 | ui-1 | #70 | feature-expert | owned (task=feat-ui-...) | terminal | https://github.com/.../pull/63 | terminal_new_pr |

<!-- final 1-line summary (80 char 以内推奨): -->
2/4 clusters approved, 1 needs_human_decision, 1 terminal_new_pr (新規 PR で継続)

### needs_human_decision クラスタ
- db-1: Critical security finding が残存。`blocker_reason` をユーザーが確認し方針決定後、
  PR を review または close して対応する

### terminal_new_pr クラスタ
- ui-1: review_round 上限到達のため新規 PR を作成した。
  新規 PR URL: https://github.com/.../pull/63
  次のステップ: `/op-merge` で取り込み可能 (review_round counter がリセット済み)

### approve_with_followup クラスタ
- forms-1: Medium/Low finding が残存。follow-up Issue: <URL>
  ClusterOrchestrator が起票済み。マージ後に対応検討

### follow-up 候補 (Issue 自動起票はしない — approve_with_followup 時を除く)
apply report に `recommended_followup_experts` / `needs_human_decision` (opt-out 経路) /
未解消 `assumptions` / `blocked_actions` 抵触候補が残った PR を列挙する。
ユーザーが op-merge 後に op-scan / 手動起票するかを判断する。

### 次のステップ
- Status=done / approved / approve_with_followup (verdict) の PR: `/op-merge` で取り込み可能
- Status=blocked / needs_human_decision: PR の blocker_reason を確認し方針決定
- Status=terminal / terminal_new_pr: 新規 PR URL を確認し `/op-merge` で取り込み可能
```

**follow-up を Issue 化したい場合**: op-merge で PR を取り込んだ後、以下を実行してください:

```
/op-scan --from-merged-pr <PR1> <PR2> ...
```

op-scan が PR 本文 / review コメント / post-check Notes から follow-up 候補を抽出し、
enrichment (cross-instance collision gate) を経て plan モードで承認 → 起票します。

---

## 注意事項

本文で繰り返し明示している原則 (司令官は編集しない / CLAUDE.md 準拠 / pr-templates 準拠 / draft 開始 / reviewed_head_sha 記録 等) は省略。以下は手抜き運用で確実に事故る原則のみを残す。

- **コンフリクトは起こさない (二段階検出)**: Stage 1 (Plan-time) と Stage 2 (探知後) の両方で検証。Stage 2 を省略して Stage 1 だけで本実装に進むと file 重複で必ず破綻する。Post-run の `git diff --name-only` 最終検証も省略しない
- **apply と review は別 context**: 同じ Agent セッション内で reviewer を演じるのは禁止。independence が崩れた瞬間に独立レビューの意味が消える
- **失敗 worktree は自動削除しない**: 隔離フォルダに保持してユーザー判断。自動削除は調査手段を奪う
- **ClusterOrchestrator への委譲**: PR 作成・post-check dispatch・review spawn・Review Fix Loop はすべて ClusterOrchestrator (Agent tool) が行う。controller は `cluster-orchestrator-directives.md` を直接実行しない
- **serial_chains の直列化は起動順序で保証**: prompt hint ではなく controller-side 直列ループで強制する (silent 並列化事故を防ぐ)
- **session_id は bundle-level 事前 mint**: フェーズ2-Orchestrate-pre で controller が mint し、全 ClusterOrchestrator に共有注入する
