---
name: op-merge
description: pro-reviewed ラベル付きの PR を対話的に解説してマージし、worktree cleanup と Issue クローズ確認まで完結するスキル。「マージ」「op-merge」「取り込み」等のキーワードで起動。
---

# op-merge: レビュー済み PR の対話マージ

/**
 * 機能概要: op-run で review-expert global review 通過 (pro-reviewed) した PR を対話的に解説・確認し、
 *           ユーザー承認後にマージ → worktree cleanup → Issue クローズ確認まで実行する。
 *           op-merge は gate 専任。修正・review の代行はしない。stale review / stale post-check
 *           を検出したら op-run に戻す。
 * 作成意図: マージは「人間の最終判断点」として固定する。自動マージは行わない。
 *           gate 1-21 の機械判定は `op merge verify` (Rust 実装) に集約し、SKILL.md は
 *           「結果を人間が理解して最終承認する」UX に専念する (god file 解体 wave、Issue #438)。
 * 注意点: pro-reviewed ラベルが付いていない PR は対象外。
 *         pro-review-needs-fix / pro-review-fix-in-progress / pro-review-stale / pro-review-blocked は除外。
 *         gate 判定を SKILL.md の bash で再実装してはならない (`op merge verify` が単一正本)。
 * 追記 (2026-07-23, ADR-0028、第七波): `OP_GITHUB_CHANNEL=mcp` は正式対応。gh auth は skip、
 *         write (`op pr ready` / `op pr merge` / `op issue close --comment`) は call-spec 経路、
 *         verify (gate 1-21) は司令官が組み立てる 8 素材 materials bundle
 *         (`op merge verify --materials-json`) 注入で成立する。gate 評価ロジック自体は無変更。
 *         人間承認 gate (merge 前 / close 前) は channel に関わらず一切変更しない。
 */

レビュー済み (pro-reviewed) の PR を、ユーザーと対話しながら一つずつ解説・マージする。
**自動マージは存在しない。** マージ判断は必ずユーザーが行う。

gate 1-21 の機械判定は `op merge verify` (op-tools の Rust 実装) が決定論的に行う。
op-merge skill の責務は **「verify 結果を人間に分かりやすく解説し、ユーザーの最終承認を取り、
承認後にマージ・cleanup・Issue close する」** ことに集約される。

---

## このスキルの構造 (god file 解体後の routing)

| フェーズ | 役割 | 主要 CLI (gh channel) | mcp channel の代替 |
|---|---|---|---|
| 0 | 環境確認 + _shared 整合性 + channel guard | (raw bash: git/gh precheck) | gh auth skip (ADR-0028) |
| 1 | 対象 PR の選定 | `op pr list --label pro-reviewed` | `mcp__github__search_pull_requests` |
| 2 | PR 個別解説と確認 | `op pr view --include both` | search item + `op review state pull` + `pull_request_read` (get_diff) |
| 3 | マージ前最終ゲート (gate 1-21) | **`op merge verify`** (1 呼び出し) | 8 素材 bundle → `op merge verify --materials-json` |
| 3.5 | MergeGateReport の人間向け解説 | (verify 出力の読み解き) | 同左 (envelope は channel 非依存) |
| 3.6 | draft ready 化 + マージ実行 | `op pr ready` + `op pr merge` | 同 CLI (内部で call-spec 往復) |
| 4 | マージ後確認 + worktree cleanup | `op issue view` + `op run worktree cleanup` | `issue_read` + cleanup skip (別セッション実装時) |
| 5 | 報告と次の PR へ | — | — |

gate 判定は `op merge verify` の評価器 1 つに集約されており、gh channel (live fetch) / mcp channel
(materials bundle 注入) いずれの経路でも **同一の gate 1-21 ロジック**を通る (ADR-0028)。

gate 判定の意図 / 評価順 / forge 防止ロジックは `op merge verify` の spec
(`op-tools/docs/specs/merge-verify.md`) が正本。本 SKILL.md は **gate を再実装せず**、
`op merge verify` の `MergeGateReport` envelope を読み解いて人間に提示するだけである。

---

## Planned Expert Notice (merge-side 解釈)

active expert / planned expert の canonical 定義は以下に集約されている。本節はそれらを merge gate 視点で
要約しているだけであり、**正本ではない**:

- runtime-spawnable active experts: `skills/_shared/active-expert-registry.md`
- planned / unavailable experts: `skills/_shared/planned-experts.md`
- post-check resolution / planned skip 規約: `skills/_shared/runtime-contract.md`

`review-expert` (Phase 1 active) は op-run フェーズ4 で判定を確定し、`<!-- op-review-meta -->`
コメント (人間向け監査ログ) を投稿するとともに `<!-- op-review-state -->` **review state 文書 (PR body)**
へ attempt payload を push する (ADR-0027 6b)。op-merge は **state 文書を gate 3〜5 の根拠とする**
(コメントは機械判定に使わない)。`pro-reviewed` 付与と `pro-review-needs-fix` /
`pro-review-fix-in-progress` / `pro-review-stale` / `pro-review-blocked` 遷移は op-run 側で行う
(label 詳細は `skills/_shared/markers/labels-and-markers.md`)。

`security-expert` (active) は op-run フェーズ3.5-B で `<!-- op-security-post-check -->` +
`<!-- op-post-check-meta -->` block を出力し、op-merge は gate 14〜18 の根拠とする
(PASS / PASS_WITH_NOTES のみ通過、BLOCK / SKIPPED / NEEDS_HUMAN_DECISION は対象外、
`legitimate_workflow_preserved == false` も BLOCK、`requires_aux_post_check: true` 時は aux UX gate 追加)。

`env-expert` / `release-expert` 等 planned expert の post-check は実体不在のため skip され、
`<!-- op-planned-post-check-skipped: <expert> -->` marker が PR に記録される。op-merge はこの
marker 単体では block しない (下記 "planned post-check skip の扱い" の通り)。
正本仕様は `skills/_shared/planned-experts.md` および `skills/_shared/runtime-contract.md` を参照。

これらの marker / label の **実際の判定** は `op merge verify` の gate 評価に内包されている。
本 Notice は「どの marker / label が何を意味するか」を人間に説明するための解釈であり、
op-merge が独自に bash gate を再実装することはない。

現時点での実行時挙動:

- `pro-reviewed` ラベルは **op-run フェーズ4 が自動付与**する (review-expert の `review_result == approve` 起点)
- **review state 文書 (`<!-- op-review-state -->`、PR body) に有効な `attempt` が存在しない場合**、
  `op merge verify` は gate 3a で block を返す (ADR-0027 6b。旧 `<!-- op-review-meta -->` コメント
  存在判定から state 文書判定へ置換)。op-merge はユーザーに「review-expert global review が未実行です。
  op-run を再実行するか手動レビューしますか?」を確認する
- `<!-- op-security-post-check -->` block が無い security 影響 PR は gate 14〜16 で block される
- `pro-review-fix-in-progress` / `pro-review-stale` / `pro-review-blocked` ラベルは op-run の Review Fix Loop で
  active に発生する。これらが付いた PR は gate 2 で除外される
- `pro-security-needs-fix` ラベルは security-expert post-check が BLOCK を返した場合に op-run が付与する (gate 14 で block)
- `legitimate_workflow_preserved: false` を post-check meta block で検出した PR は gate 17 で block
- `requires_aux_post_check: true` で aux post-check が未充足な PR は gate 18 で block
- `<!-- op-planned-post-check-skipped: <expert> -->` は単体では merge を止めない (gate 10 が planned-skipped expert を除外する)

planned expert の active 化 (例: `env-expert` / `release-expert` 実装) に伴う Notice の差分更新は、
`skills/_shared/planned-experts.md` の正本変更と同期して行うこと。

---

## 起動

```
/op-merge          # pro-reviewed の PR をすべて対話処理
/op-merge #N       # 特定 PR のみ
/op-merge --all    # 確認を最小化して連続マージ (まとめ取り込み時のみ)
```

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
フェーズ0 で `_shared/version-check.md` の手順に従い整合性を確認する (mismatch 時は warning + ユーザー確認)。

- `~/.claude/skills/_shared/worktree-ops.md` (>=1) — マージ後の worktree cleanup
- `~/.claude/skills/_shared/markers/labels-and-markers.md` — **OP label / HTML marker 名 inventory と core semantics の正本**。`pro-*` / `pro-review-*` / `pro-ux-ui-audit-*` / `pro-security-*` / `op-planned-post-check-skipped` / `needs:human-decision` / `needs:human-decision-followup` などの canonical 定義はここを参照
- `~/.claude/skills/_shared/runtime-contract.md` — **runtime spawn / fallback / post-check resolution の正本**。planned expert post-check の skip 規約、needs:human-decision の merge-blocking 既定、`<!-- op-planned-post-check-skipped -->` の意味論はここに集約
- `~/.claude/skills/_shared/pr-templates.md` (>=13) — マージコミットメッセージ + UX/UI post-check (op-ux-ui-audit) + Security post-check (op-security-post-check, 8 観点 + usable_security / aux post-check 状態 / needs_human_decision) + op-post-check-meta + op-security-requires-aux-post-check hidden marker + `<!-- op-manual-override -->` block 仕様 + Needs Human Decision テンプレ。**ラベル名 inventory の正本は `_shared/markers/labels-and-markers.md`**、本ファイルは template / detailed schema / examples のみ
- `~/.claude/skills/_shared/expert-spawn.md` — subagent prompt 規約、canonical schema、planned expert spawn 禁止、release-expert 再分類、review-expert global review (監査専任 / 修正・push しない)、security-expert active post-check / apply 契約。**Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) — op-merge は gate 判定専任で hidden marker を新規 publish しないため lint 挿入は不要だが、merge コメント等で marker を埋める運用に変わった場合は本節の `op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict` を投稿前に通す
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — runtime-spawnable active expert の canonical registry。agent 名から `skills/expert-<agent-name>/` を機械生成しないための参照表
- `~/.claude/skills/_shared/planned-experts.md` — planned / unavailable experts (`env-expert` / `release-expert` / `compatibility-expert`) の正本 (spec-expert は ADR-0017 W1b で Utility Worker として active 化済、active-expert-registry.md 参照)
- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode の対話可否契約
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック手順 + Invocation Mode 上の責務分離
- `~/.claude/skills/_shared/model-selection.md` (>=1) — expert spawn 時の model 選択 / task_complexity / 区画 complexity の canonical 正本。op-merge の対話マージは司令官の model に従う
- `~/.claude/skills/_shared/pr-meta-helpers.md` (>=2) — **historical reference**。PR コメントからの review meta / post-check meta / manual override 抽出は `op merge verify` の Rust 実装に内包済み。SKILL.md は本ファイルの bash helper を直接呼ばない (§7 の対応表のみ参照)
- `op-tools/docs/specs/merge-verify.md` — **`op merge verify` の gate 1-21 仕様 / MergeGateInput schema / MergeGateReport envelope / gate ↔ primitive 対応 / §2 out-of-scope の正本**
- `~/.claude/skills/_shared/github-channel.md` (>=2) — call-spec protocol の正本。mcp channel での write (`op pr ready` / `op pr merge` / `op issue close --comment`) 実行者義務 (verbatim 実行 / read-back / ingest) はここに従う
- `op-tools/docs/adr/0028-op-merge-mcp-materials.md` — **op-merge mcp channel 対応の設計判断正本**。materials bundle (8 素材) の mapping / race 2-snapshot 設計 / write 系 call-spec kind / 既知 gap の詳細

---

## Shared Merge State Contract

For canonical label and marker names, marker ownership, and core marker semantics, follow:

- `skills/_shared/markers/labels-and-markers.md`
- `skills/_shared/runtime-contract.md`

`op-merge` owns the concrete merge procedure (PR 解説 / 確認手順 / マージ実行 /
worktree cleanup / Issue close など、本 SKILL.md 後段に書かれているもの)。
**gate 順序 / gate 判定ロジックは `op merge verify` が単一正本** であり、SKILL.md に再実装しない。

ラベル名 / marker 名 / 核となる意味論をローカルに再定義してはならない (重複正本禁止)。

### planned post-check skip の扱い

A planned expert post-check skip marker is not automatically merge-blocking.

`<!-- op-planned-post-check-skipped: <expert> -->` blocks merge only when paired with:

- an unresolved blocking label,
- an explicit post-check block,
- unsafe `needs:human-decision`,
- missing required review approval,
- or failed required verification.

つまり `op-planned-post-check-skipped` 単体では merge を止めない。この判定は `op merge verify` の
gate 10 (planned-skipped expert を stale check から除外) に内包されている。

### needs:human-decision の扱い

`needs:human-decision` is merge-blocking by default.

`needs:human-decision-followup` may be merge-allowed only when:

- no blocking label remains,
- safe-first-step is documented,
- global review approves,
- required verification passes.

> **実装状況**: `op merge verify` の gate 2b が `needs:human-decision` を評価する。
> followup なし = 無条件 block、followup あり + `pro-human-verified` = 通過許可 を強制する。
> ラベル名の canonical 定義および follow-up 運用フローは `skills/_shared/markers/labels-and-markers.md` を参照。

---

## フェーズ0: 環境確認

### 0-channel-guard. mcp channel 正式対応 (ADR-0028、第七波)

> **`OP_GITHUB_CHANNEL=mcp` は正式対応**(ADR-0028)。ADR-0027 6b で op-run 側 (post-check /
> global review / Review Fix Loop) が review state 文書 (`op review state pull/push`) 経由で
> mcp channel 対応したのに続き、op-merge に残っていた固有の壁 — `mergeable_state` (gate 7-8) /
> CI checks (gate 9) の live 取得、confirmed head (stale 判定の基準となる「確定した現在 head」)
> の取得、同時 merge の race 検出 — を、**司令官が MCP tool で集めた 8 素材を 1 JSON に束ねて
> `op merge verify --materials-json <path>` に注入する**方式で解消した (詳細は ADR-0028)。
>
> gate 評価ロジック自体は無変更 (`op merge verify` の評価器は fixture / live / materials の
> いずれの入力経路でも同一)。channel による違いは「live fetch を op が gh 経由で行うか (gh
> channel)」「司令官が MCP tool を集めて素材 bundle を組み立て注入するか (mcp channel)」だけである。
>
> mcp channel での主な違い (詳細・手順は各フェーズ節):
>
> - **gh auth は skip** (下記 0-1 で channel 分岐)
> - **write は call-spec 経路**: `op pr ready` (draft ready 化) / `op pr merge` (call-spec 往復 +
>   `merged==true` read-back。`--delete-branch` は mcp 非対応、op-sweep に委譲) /
>   `op issue close --comment` (`issue_comment` → `issue_update` の 2-spec 順次往復)
> - **verify は materials bundle 注入**: フェーズ3-0 で 8 素材 (pr_snapshot ×2 / check_runs /
>   combined_status / search_pr_item / fixes_issues[] / refs_issues[] / blocking_findings) を
>   MCP tool で集めて 1 JSON に束ね、`--materials-json` で注入する (全 key 必須・欠落 fail-closed)
> - **フェーズ1 (PR 一覧)**: `op pr list` の代わりに `mcp__github__search_pull_requests` を司令官が直接使う
> - **フェーズ2 (解説)**: search item raw body + `op review state pull --input-json` +
>   `pull_request_read` (get_diff) で構築する
> - **フェーズ4-3/4-4 (cleanup)**: ローカル worktree/branch が無いセッション (別セッション実装の
>   PR) では cleanup を skip して報告のみ。remote branch 削除は mcp では行わない (proxy 403 実測)。
>   `auto/*` は op-sweep が別途 grace 後に掃除するため無害

### 0-pre. _shared 整合性チェック

`_shared/version-check.md` の「起動時チェック手順」に従い、上記「## 参照ドキュメント」節の `(>=N)` と各 `_shared/*.md` 冒頭の `schema_version` を照合する。mismatch 検出時は warning を表示し、ユーザーに続行可否を確認する (`--all` モードでも一旦停止)。

加えて、`_shared/version-check.md` の「installed op binary 鮮度確認」節 (Issue #249) に従い、`op version --json` の `details.git_sha` と `git log --format='%h' -n1 -- op-tools/crates/` の最新 SHA を比較する (比較元 path は binary 挙動に影響する範囲に絞る。docs-only commit の false-drift 回避 = Issue #641)。不一致時は warning + `cargo install --path op-tools/crates/op` を案内 (hard fail なし)。

> **重要**: 本 skill は gate 判定を `op merge verify` に委譲するため、installed op binary が最新でないと
> gate ロジックが古いまま動く。鮮度確認は gate 整合性の前提条件である。

### 0-1. git / gh precheck (channel 分岐)

```bash
# raw bash 残置: #372 (_shared/common-setup.md env precheck 集約 wave) 完了後に削除予定。
# git work tree 内であることは channel 非依存で確認する。
git rev-parse --is-inside-work-tree || exit 1

# gh 認証は gh channel のみ必須 (mcp channel = call-spec 経路では gh 不要、op-patrol 等の確立形)。
if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要、ADR-0028)"
else
  gh auth status || exit 1
fi
```

gh channel (未設定含む) のみ未認証で中断する。mcp channel は `gh auth login` 案内をスキップする。

---

## フェーズ1: 対象 PR の選定

### 1-1. 起動コンテキスト判定 (chain / standalone)

op-run の `--all` モード経由 (chain) か、user 直接起動 / 単独 PR 指定 (standalone) かを判定する。
これは Claude 司令官側の context 判断であり、決定論 CLI ではない (純 markdown ロジック)。

chain モードは以下 2 条件を **AND** で要求する:

1. `OP_RUN_SESSION_ID` が non-empty かつ `"unknown"` 以外 (gate 3i の forge 防止 pattern と同条件)
2. `--all` フラグで起動されている (単独 PR 指定の `/op-merge #N` は session filter を適用しない)

上記を満たさない場合は **standalone**。standalone は全 pro-reviewed PR が対象 (backwards compat)、
chain は自 session の PR のみが対象 (cross-session 巻き込み防止)。

> env (`OP_RUN_SESSION_ID` / `OP_MERGE_ALL_MODE`) は Claude Code Skill tool の同 process 内動作で
> 自動継承される。`OP_MERGE_ALL_MODE` は op-run が `--all` 起動時に `"true"` をセットする。

### 1-2. pro-reviewed PR 一覧取得

```bash
# pro-reviewed の open PR 番号一覧を取得する (両モード共通、gh channel)。
# 出力 (--plain) は 1 行 1 PR 番号。詳細 PR 情報はフェーズ2 で op pr view する。
op pr list --label pro-reviewed --state open --plain > /tmp/op-merge-reviewed-numbers.txt
```

> **mcp channel**: `op pr list` は mcp 未対応のため、司令官が
> `mcp__github__search_pull_requests` (query: `repo:<owner>/<repo> is:pr is:open
> label:pro-reviewed`) を直接実行して PR 番号一覧を得る (github-channel.md §6、
> `search_pull_requests` は raw body + labels 同梱で正準素材)。取得した item はフェーズ2/3-0の
> 素材としても再利用できるため、破棄せず保持しておく。

#### chain モードの session filter

chain モードでは、上記一覧から **自 session の PR のみ** に絞り込む。
PR の **review state 文書 (`<!-- op-review-state -->`、PR body)** の最新 attempt に含まれる
`op_run_session_id` が自 `OP_RUN_SESSION_ID` と一致する PR だけを対象とする。

`op_run_session_id` は **state 文書由来** の値を使う (ADR-0027 6b。コメント投稿者の trusted author
照合ではなく、state 文書へ書き込めた provenance が根拠になる)。各 PR の `op merge verify`
出力 (`details.gates[]` の gate 3i 周辺、または `op review state pull` の直接読み) から
session_id を取得して照合する。

> **落とし穴 (session filter)**: `op pr list` は session 概念を持たない (Issue A scope 外)。
> session 絞り込みは本 SKILL.md 側の後処理で行う。一覧取得 (`op pr list`) → 各 PR の
> state 文書から session_id 抽出 → 自 session と一致する PR 番号のみ残す、という 1 段の
> filter を chain モードでのみ適用する。standalone は filter なし (全 pro-reviewed PR が対象)。
> filter 結果 0 件は **正常終了** (エラーではない)。「対象 PR: 0 件」を明示してフェーズ5 で終了する。

### 1-3. 除外条件 (verify が block する PR を一覧で別枠表示)

以下に該当する PR は `op merge verify` が block を返す。フェーズ1 の一覧表示段階では、
これらを **別枠 (マージ不可)** として明示し、ユーザーが状況を把握できるようにする:

- `pro-review-needs-fix` ラベル付き → op-run 側で specialist に再委任して再対応すべき PR
- `pro-review-fix-in-progress` ラベル付き → op-run が修正担当 expert に委任中
- `pro-review-stale` ラベル付き → 修正後に re-review がまだ完了していない
- `pro-review-blocked` ラベル付き → 自動継続不能。人間判断待ち
- マージ不可状態 (CONFLICTING / BLOCKED) → 「コンフリクトあり」として別枠表示
- review state / post-check が stale (reviewed_head_sha != 現在 head) → 「stale」として別枠表示

> **重要**: 一覧表示段階で `gh pr view --jq '.comments[].body' | grep reviewed_head_sha` のような
> 生抽出をしてはならない。reviewed_head_sha / review 状態の正本は **review state 文書 (`op review state pull`)
> を根拠にした `op merge verify` の判定**であり、一覧でも verify 結果 (またはそれと同じ state 文書検証を
> 経た値) を使う (ADR-0027 6b)。

### 1-4. 起動コンテキスト表示と一覧表示

対話冒頭で **起動コンテキストと filter 結果** を必ず明示する。

**chain モード表示:**
```
🔗 op-merge 起動コンテキスト: chain (op-run --all 経由)
  → session_id: <OP_RUN_SESSION_ID>
  → 対象 PR: N 件 (本 session の pro-reviewed PR のみ)
  → 他 session の pro-reviewed PR は対象外 (cross-session 巻き込み防止)
```

**standalone モード表示:**
```
🔧 op-merge 起動コンテキスト: standalone (user 直接起動 または単独 PR 指定)
  → session filter 無効 → 全 pro-reviewed PR が対象
  → 対象 PR: N 件
```

**filter 結果 0 件 (chain モードで自 session の PR がない場合):**
```
🔗 op-merge 起動コンテキスト: chain (op-run --all 経由)
  → session_id: <OP_RUN_SESSION_ID>
  → 対象 PR: 0 件 (本 session の pro-reviewed PR がまだありません)
  → 他 session の PR は対象外のため処理を終了します
```
PR 0 件の場合は正常終了 (エラーではない)。

**一覧表示 (対象 PR が 1 件以上の場合):**
```
レビュー済み PR が N 件あります:

| # | タイトル                                    | 変更   | レビュー結果       |
|---|---------------------------------------------|--------|-------------------|
| 1 | fix(auth): セッション関連の3件修正 [#42-45] | +85/-23| approve           |
| 2 | refactor(forms): 検証ロジックの統合 [#51-52]| +42/-18| needs-fix → approve (R2) |
| 3 | feat(db): スキーマ拡張 [#60]                | +12/-0 | approve           |

どの PR から確認しますか?
- 番号入力 → 個別マージフロー
- 「全部」 → 上から順に確認
- 「キャンセル」 → 終了
```

---

## フェーズ2: PR 個別解説と確認

選択された PR について以下を提示する。**非エンジニアでも判断できる** ことを意識。

### 2-1. PR 情報取得

```bash
# PR の body + コメント + commit を 1 fetch で取得する (gh channel)。
# 解説 (変更概要 / レビュー結果 / マージ後確認ポイント) はこの出力から構築する。
op pr view "$PR_NUM" --include both
```

差分そのものをユーザーが見たい場合は `gh pr diff $PR_NUM` で提示する (op-merge は読み取りのみ)。

> **mcp channel**: `op pr view` 相当の解説素材は次の 3 点で構築する。
> ①`mcp__github__search_pull_requests` の item (raw body、フェーズ1 で取得済みなら再利用)
> ②`op review state pull --input-json <search item>` (review 結果 / round / post-check 状況)
> ③`mcp__github__pull_request_read` (method: `get_diff`) で差分そのもの (ユーザーが見たい場合)。
> コメント本文 (レビュー finding の詳細等) は mcp read 経路で sanitize されるため、②の state 文書
> (`attempts[].findings[]`) から抽出する (github-channel.md §6)。

### 2-2. 解説の提示

```
## PR #<N> の確認

### この変更でどうなるか
<技術用語を避けた 1〜3 文。PR 本文の「変更概要」を非専門家向けに翻訳>

### なぜ必要か
<関連 Issue の本文から問題の背景を抽出>

### 影響範囲
- 変更ファイル: N 個
- 追加: +X 行 / 削除: -Y 行
- 影響する機能: <PR 本文の「変更内容」テーブルから抽出>

### レビュー結果
- 判定: approve (pro-reviewed)
- レビュアー: review-expert (op-run フェーズ4 で独立 global review、修正は specialist が実施)
- review_round: <round 数 / max_review_fix_rounds>
- 指摘事項: <Review Fix Loop で全 finding 解消済み、または approve コメントの確認ポイントを引用>

### マージ後の確認ポイント
<レビューコメントの「マージ後の確認ポイント」セクションを引用>

### マージ可否
- mergeable: <CLEAN / DIRTY / BLOCKED>
- ブロック要因: <あれば>

このまま取り込みますか?
1. 取り込む (squash 推奨)
2. マージ方式を変えたい (merge / rebase / squash)
3. 詳しく差分を見たい
4. 後でにする (スキップ)
5. クローズする
```

### 2-3. 質問への対応

ユーザーが「○○は壊れないか?」等の質問をした場合、コードを Read で確認して具体的に回答する。

---

## フェーズ3: マージ前最終ゲート (`op merge verify`)

ユーザー承認後でも、gate 1-21 がすべて pass しない PR はマージしない。
gate の機械判定は **`op merge verify` 1 呼び出し** に集約されている。
SKILL.md 側で gate を bash 再実装してはならない (drift / silent revert の原因になる)。

### 3-0. verify の実行

```bash
# gate 1-21 を 1 呼び出しで評価する。
#   --pr            : 対象 PR 番号
#   --base-sha      : op-run controller が確定した OP_RUN_BASE_SHA (chain モードで継承、standalone は省略可)
#   --expected-base : gate 6 の baseRefName 照合対象 (default "main"、OP_MERGE_EXPECTED_BASE で上書き)
#   --trusted-author: post-check-meta (コメント側、監査ログ表示用) の forge 防止に使う trusted author
#                     login (カンマ区切り)。review-meta 自体は ADR-0027 6b で review state 文書
#                     (`<!-- op-review-state -->`、PR body) が機械正本になったため、review 判定
#                     (gate 3a〜3i/5) はこのフラグの trusted-author 照合には依存しない
#                     (下記 3-1 参照)。省略すると post-check 側は fail-CLOSED に倒れるため引き続き必須に近い。
#                     repo owner + bot 群を渡す。OP_TRUSTED_REVIEW_AUTHORS_EXTRA があれば union 追加。
#
# 終了コード: pass → 0、block → 1、fixture/file エラー → 99、live fetch 未配線 → 2。
# 出力 (stdout): MergeGateReport envelope (decision / blocking_reasons[] / details.gates[])。
export VERIFY_JSON=$(op merge verify \
  --pr "$PR_NUM" \
  --base-sha "${OP_RUN_BASE_SHA:-}" \
  --expected-base "${OP_MERGE_EXPECTED_BASE:-main}" \
  --trusted-author "$(gh repo view --json owner --jq '.owner.login'),github-actions[bot],claude-bot,op-bot${OP_TRUSTED_REVIEW_AUTHORS_EXTRA:+,${OP_TRUSTED_REVIEW_AUTHORS_EXTRA// /,}}")
VERIFY_DECISION=$(printf '%s' "$VERIFY_JSON" | jq -r '.decision')
```

> **gate と marker schema の参照**: gate 1-21 の判定意図 / gate ↔ primitive 対応 / MergeGateInput schema は
> `op-tools/docs/specs/merge-verify.md` を、envelope の構造は `op help envelope merge-verify --json` を、
> 個別 marker の required_fields は `op help marker <name> --json` を参照する (本 SKILL.md に再記載しない、
> ADR-0004 help as navigation root)。

### 3-0-mcp. materials bundle 組み立て (mcp channel、ADR-0028)

> mcp channel では `op merge verify` は live gh fetch できない (gh 到達不能)。代わりに **司令官が
> MCP tool で 8 素材を集めて 1 JSON に束ね、`--materials-json <path>` で注入**する。gate 評価器
> 自体は fixture / live / materials のいずれの入力でも同一 (`op-tools/docs/specs/merge-verify.md`)。
> **bundle は全 key 必須・欠落は fail-closed** (省略して pass に倒すことはできない)。

bundle の shape (`op merge verify --materials-json` の入力):

```json
{
  "pr_number": 437,
  "pr_snapshot_1": { "fetched_at": "...", "data": "... (pull_request_read get の生 JSON)" },
  "pr_snapshot_2": { "fetched_at": "...", "data": "... (verify 直前に再取得した pull_request_read get)" },
  "check_runs": "... (pull_request_read get_check_runs の生 JSON)",
  "combined_status": "... (pull_request_read get_status の生 JSON)",
  "search_pr_item": "... (search_pull_requests item の生 JSON、labels / raw body 用)",
  "fixes_issues": ["... (search_issues items、Fixes 先 Issue の raw body)"],
  "refs_issues": ["... (issue_read get、Refs 先 Issue)"],
  "blocking_findings": "... (search_issues items、label:op:blocking-finding state:open。0 件でも key 必須)"
}
```

組み立て手順 (この順で MCP tool を呼ぶ):

1. **`pull_request_read` (method: `get`)** で PR 本体を取得し、取得直後の timestamp を
   `fetched_at` として添付する → `pr_snapshot_1`
2. **`pull_request_read` (method: `get_check_runs`)** → `check_runs` (gate 9)
3. **`pull_request_read` (method: `get_status`)** → `combined_status` (gate 9)。
   **403 "Resource not accessible by integration" の場合** (2026-07-23 実測: 環境の GitHub App
   token では combined status API が読めない)、`combined_status` に **`{"unavailable": true}`** を
   入れる — verify は `COMBINED_STATUS_UNAVAILABLE` warning を出しつつ gate 9 を check_runs のみで
   評価する (key 省略は fail-closed で block されるため、必ず marker を明示する)
4. **`search_pull_requests`** (query: `repo:<owner>/<repo> is:pr <PR番号>`、または一覧取得済みの
   item を再利用) → `search_pr_item` (labels / raw body の正準素材、github-channel.md §6)
5. `search_pr_item` の raw body から `Fixes #N` / `Refs #N` を抽出する (`op core
   extract-pr-markers --from-body` を素材注入で使ってよい)。抽出した Issue ごとに:
   - **Fixes 先** → `search_issues` (query: `repo:<owner>/<repo> is:issue <Issue番号>`) で raw body
     を取得する (**raw body が必須** — sec/UI marker 判定に使うため、`issue_read` の sanitize 済み
     body では代替できない) → `fixes_issues[]`
   - **Refs 先** → `issue_read` (method: `get`) で十分 (state 確認のみ、marker 依存判定はしない)
     → `refs_issues[]`
6. **`search_issues`** (query: `repo:<owner>/<repo> is:issue is:open
   label:op:blocking-finding`) → `blocking_findings` (**空配列でも key は必須**、gate 21 の
   fail-closed を維持するため省略禁止)
7. **verify 直前にもう一度 `pull_request_read` (method: `get`)** を取り直し、`fetched_at` を添えて
   `pr_snapshot_2` とする (race 検出用。gate 4/7 の `head_sha_inconsistent` は snapshot_1 と
   snapshot_2 の head SHA 差分から判定される。この二度取得は verify 呼び出し直前に行うこと —
   フェーズ2 の解説時点の snapshot を使い回すと race window が広がる)

```bash
# 上記 1-7 で組み立てた bundle を 1 ファイルに保存し、--materials-json で注入する。
# envelope は gh channel と同じく stdout に出る — そのままキャプチャする
# (--materials-json は入力 bundle の path であり、出力ファイルは生成されない)。
export VERIFY_JSON=$(op merge verify --pr "$PR_NUM" \
  --expected-base "${OP_MERGE_EXPECTED_BASE:-main}" \
  --materials-json /tmp/op-merge-materials-"$PR_NUM".json)
```

> `--trusted-author` は gh channel と同様に渡してよい (post-check-meta 監査ログ表示用、3-1 参照)。
> bundle 組み立てそのものは決定論 CLI を持たない (MCP tool 呼び出し列を司令官が実行する
> handwritten composition)。将来 primitive 化する場合も、gate 評価ロジックは `op merge verify`
> 側から動かさない (bundle builder と evaluator の層分離、ADR-0028 参照)。

### 3-1. trusted author / TRUSTED_AUTHORS の解決方針 (ADR-0027 6b: 監査ログ表示用に位置づけ変更)

> **v2 移行 (ADR-0027 6b)**: `--trusted-author` (および `TRUSTED_AUTHORS` 相当の解決) は
> **review state 文書の機械 gate には使わない**。review-state は「誰が PR body を編集できたか
> (collaborator 権限) + 内容の意味検証 (`reviewed_head_sha` / `op_run_session_id` 等の provenance field)」
> で trust 境界を引く (ADR-0027「trust 境界の引き直し」節)。本フラグはコメント側 post-check-meta
> (`<!-- op-post-check-meta -->` 等、引き続きコメント判定を行う post-check gate 14〜18) の forge 防止と、
> 人間向け監査ログ表示 (誰の投稿か PR 一覧・解説に出す) にのみ使う。**flag 自体は互換のため残置する**
> (廃止しない)。

`--trusted-author` には **repo owner + bot 群** を渡す。
DEFAULT (`github-actions[bot]` / `claude-bot` / `op-bot`) は常に含める additive 方式。

- `OP_TRUSTED_REVIEW_AUTHORS_EXTRA` が設定されていれば union 追加 (推奨)。
- 旧 `OP_TRUSTED_REVIEW_AUTHORS` は廃止予定。設定されていれば deprecation warning を出した上で互換受け入れする。

trusted author を空にすると `op merge verify` は **fail-CLOSED** (review_meta / post-check を
1 件も採用しない = 全 PR が gate 3a で block) になる。これは forge 防止のための安全側設計であり、
意図的に空にしてはならない。

---

## フェーズ3.5: MergeGateReport の人間向け解説

`op merge verify` の出力 (`MergeGateReport` envelope) は機械可読だが、
**ユーザーが gate 結果を理解した上で最終判断できるよう、人間向けに必ず解説する**。
これは op-merge のコア価値 (「自動マージしない / 人間の最終判断点」) を担保する節である。

### 3.5-1. envelope の読み方

| field | 意味 | 人間向け解説の作り方 |
|---|---|---|
| `decision` | `pass` (全 gate 通過) / `block` (1 件以上違反) | 「マージ可能です」/「以下の理由でマージできません」 |
| `blocking_reasons[]` | block 理由の構造化配列 (`gate` / `code` / `reason`) | 各要素を「gate N: <reason>」として箇条書きで翻訳 |
| `details.gates[]` | gate ごとの `result` (`pass` / `skip` / `block`) | `block` の gate を強調、`skip` は「この PR では対象外」と説明 |

```bash
# block 理由を人間向けに整形する例 (decision == block のとき)
: "${VERIFY_JSON:?VERIFY_JSON must be set — フェーズ3-0 verify の出力}"
printf '%s' "$VERIFY_JSON" | jq -r '.blocking_reasons[] | "  gate \(.gate) [\(.code)]: \(.reason)"'
```

### 3.5-2. decision == pass の場合 (マージ可能)

```
✅ マージ前最終ゲート: 全 21 gate 通過

このPRはレビュー済み (review-expert approve) で、必要な post-check も完了しています。
- review: approve (head SHA 一致、stale でない)
- 必要な post-check: <該当 expert> 完了 / 該当なし
- CI: 全 required check 成功
- 関連 Issue: Fixes #N (自動 close 対象)

このまま取り込みますか? (はい / マージ方式を変える / 後でにする / キャンセル)
```

ユーザーが「はい」と答えた場合のみフェーズ3.6 へ進む。**verify が pass でもユーザー承認は必須**。

### 3.5-3. decision == block の場合 (マージ不可)

block 理由を人間が分かる言葉に翻訳して提示する。op-merge は **修正しない / re-review しない**。
op-run に戻して状態を整えてもらう (Review Fix Loop / 再 post-check / conflict 解消など)。

```
❌ マージ前最終ゲート: <N> 件の gate で block

以下の理由でこの PR はまだマージできません:
  gate 4 [GATE_4_REVIEW_STALE]: review 後に commit が積まれています (再レビューが必要)
  gate 9 [GATE_9_CHECKS_FAILED]: required check のうち成功でないものがあります

→ op-run に戻して状態を整えてください (review-expert 再 spawn / Review Fix Loop / CI 修正 / 再 post-check)。
   op-merge は gate 専任のため、ここでは修正しません。
```

### 3.5-4. よく出る block の人間向け説明テンプレ

| gate / code 系統 | 人間向けの説明 |
|---|---|
| gate 1-2 (pro-reviewed / 排他ラベル) | レビューが完了していない、または修正中の PR です |
| gate 3a-3i (review state provenance) | 正式な op-run review を経ていない、または review state 文書 (PR body) の provenance が不整合です |
| gate 4 (review stale) | レビュー後に新しい commit が積まれました。再レビューが必要です |
| gate 5 (approve) | レビュー結果が approve ではありません |
| gate 6 (base ref) | マージ先 branch が想定 (通常 main) と違います |
| gate 7-8 (mergeable / merge state) | コンフリクトまたは merge できない状態です |
| gate 9 (checks) | CI (テスト等) が成功していません |
| gate 10 (post-check stale) | post-check 後に commit が積まれました。再 post-check が必要です |
| gate 11-13 (UX post-check) | UI 影響 PR の ux-ui-audit post-check が未完了 / 失敗 / stale です |
| gate 14-18 (security post-check) | security 影響 PR の security post-check が未完了 / 失敗 / stale、または正当な操作が壊れています |
| gate 19-20 (Fixes/Refs) | PR が Issue を自動 close する `Fixes #N` を持っていない、または参照先 Issue が不在/closed です |
| gate 21 (blocking-finding) | repo に未解決の blocking Issue が残っており、この PR がそれを Fixes していません |

> **manual override について**: gate 11-18 (UX / security post-check) は緊急時に
> `<!-- op-manual-override -->` block + manual-override ラベルで例外承認できる。
> `op merge verify` はこの override を 10-AND 評価で判定し、有効なら該当 gate を skip する。
> override は **常用厳禁** (常用すると UX 退化 / 攻撃面復活を構造的に防ぐ意図が壊れる)。
> override 付与時の必須情報 (承認者 / 理由 / follow-up Issue / overridden_at / reviewed_head_sha /
> trusted author 投稿) の対話確認手順は本 SKILL.md「## manual override の対話確認」節を参照。
> gate 21 (blocking-finding) は **manual override を提供しない** (設計上「他作業を止めて先に直す」もの)。

---

## フェーズ3.6: マージ実行

### 3.6-1. draft PR の ready 化

`isDraft == true` の場合、最終ゲート通過 + ユーザー承認後に ready 化する:

> **mcp channel の draft 判定**: `op pr view` は gh channel 専用のため、mcp では 3-0-mcp で取得済みの
> `pr_snapshot_2` の `draft` field (`pull_request_read` get の REST field) を使う。ready 化自体は
> `op pr ready` が両 channel 対応 (mcp = `pr_ready` call-spec 往復)。ready 化後は bundle を
> 再組み立てして verify を再実行する (head/state が変わるため)。

```bash
# op pr view の出力は flat JSON (snake_case)。is_draft / body / state は top-level field (.details 包みではない)。
IS_DRAFT=$(op pr view "$PR_NUM" --include meta | jq -r '.is_draft')
if [ "$IS_DRAFT" = "true" ]; then
  echo "draft PR を ready に切り替えます..."
  op pr ready --pr "$PR_NUM"
fi
```

> **`op pr ready` (ADR-0028 新設)**: gh channel は `gh pr ready` を、mcp channel は
> `update_pull_request` (`{draft:false}`) の call-spec + read-back ingest を実行する。旧
> `gh pr ready` raw bash (drift の原因だった) はこれで解消。

> **ready→merge の race condition**: ready 化直後に commit が積まれる稀なレースは、
> ready 化後すぐ `op merge verify` を **再度呼ぶ** ことで塞ぐ (gate 4 / 7 が
> `head_sha_inconsistent` を二度 fetch で検出する)。ready 化したら 3-0 (gh channel) /
> 3-0-mcp (mcp channel) の verify をもう一度通してから 3.6-2 のマージに進むこと。
> **mcp channel では「もう一度通す」= materials bundle をもう一度組み立て直す**ことを意味する
> (pr_snapshot_1/2 を ready 化後の状態で再取得する。使い回すと race window を塞げない)。
> race 検出ロジックは CLI 側に集約されており、SKILL.md で SHA compare を再実装しない。

### 3.6-2. マージ方式の選択

デフォルト: `squash` (履歴をきれいに保つ)。ユーザーが選べる:

| 方式 | 用途 |
|------|------|
| squash | デフォルト。複数コミットを1つに圧縮 |
| merge | merge commit を残す。分岐を保持したい場合 |
| rebase | コミットをそのまま積む。履歴を直線化 |

### 3.6-3. マージ実行

```bash
# gate 通過 + ユーザー承認後に実行する destructive operation。
#   --strategy      : squash (default) / merge / rebase
#   --delete-branch : remote head branch も削除する (auto/* prefix の即時削除はフェーズ4-1 で別途確認)
# op pr merge は内部で gh pr merge をラップする。dry-run は gate 側で担保済みのため持たない。
op pr merge --pr "$PR_NUM" --strategy squash --delete-branch
```

> **mcp channel**: `op pr merge` はコマンド自体は無変更だが、内部で kind `pr_merge`
> (`merge_pull_request`) の call-spec を emit する。司令官は github-channel.md §4 の義務に従い
> verbatim 実行 → 結果を `merged==true` になるまで read-back → ingest する (ADR-0028)。
> **`--delete-branch` は mcp では非対応** (call-spec 経路に branch 削除相当の操作がない)。
> mcp channel では `--delete-branch` を渡さず、branch 削除は op-sweep の grace 後 sweep に委譲する
> (`auto/*` prefix であれば無害、フェーズ4-4 参照)。

> commit subject / body のカスタマイズが必要な場合は、マージ前に PR title / body を整えるか、
> squash 後に `git commit --amend` 相当の運用ではなく op-run 側で PR body を確定させる
> (op-merge は gate + マージ実行に専念し、メッセージ整形は最小限にとどめる)。

---

## フェーズ4: マージ後確認と worktree cleanup

### 4-1. マージ後の base 同期と Issue close 確認

PR が `Fixes #N` で指定した Issue が close されたかを確認する。
base 同期は低頻度 git operation のため raw bash 残置 (フェーズ4-4 のクリーンアップ群に同梱)。
`Fixes #N` の抽出は **`op core extract-pr-markers --from-body`** を使う (bash regex の
case-sensitivity 不一致 silent bug を避ける):

```bash
# PR body から Fixes/Closes/Resolves #N を決定論抽出する (9 活用形を case-insensitive で)。
# op pr view の出力は flat JSON (.body が top-level field)。op issue view も flat JSON (.state)。
op pr view "$PR_NUM" --include body-comments-commits | jq -r '.body' \
  > /tmp/op-merge-pr-body.txt
FIXES_JSON=$(jq -Rs '{pr_body: ., pr_comment_bodies: [], commit_message_bodies: []}' /tmp/op-merge-pr-body.txt \
  | op core extract-pr-markers --input-json - --from-body)
# details.fixes_extract.fixes_issues[] に Fixes 先 Issue 番号が入る。各 Issue の state を確認する。
printf '%s' "$FIXES_JSON" | jq -r '.details.fixes_extract.fixes_issues[]?' | while read -r issue; do
  STATE=$(op issue view "$issue" --include meta | jq -r '.state')
  echo "Issue #${issue}: ${STATE}"  # CLOSED ならOK、OPEN なら警告
done
rm -f /tmp/op-merge-pr-body.txt
```

> **mcp channel**: 各 Issue の state 確認は `mcp__github__issue_read` (method: `get`) で行う
> (`.state` フィールドのみ見る read-only 確認のため sanitize の影響を受けない)。フェーズ3-0-mcp で
> 組み立てた `fixes_issues[]` 素材があれば再利用してよい (二重 fetch を避ける)。base 同期
> (git pull) はローカル worktree が無いセッションでは skip (フェーズ4-4 の Cloud 分岐参照)。

### 4-2. 派生 Issue 連動 close 確認

PR が close した Issue が **op-scan `--from-issue` で起票された派生 Issue** だった場合、
対応する元 Issue (`superseded-by-scan` ラベル付き、`<!-- op-derived-from: #N -->` marker を持つ) も
一緒に close するかユーザーに確認する。

派生関係の marker 抽出も `op core extract-pr-markers` 系で行い、生 grep を避ける。
close 承認時は `op issue close` を使う:

```bash
# ユーザーが「元 Issue も close する」を選んだ場合のみ実行する (個別確認必須)。
op issue close --issue "$ORIGIN_ISSUE" \
  --comment "派生 Issue #${CLOSED_ISSUE} がマージされたため、本 Issue を close します。
実装は派生 Issue 側 (#${CLOSED_ISSUE}) で完了しています。追加要望がある場合は新規 Issue として起票してください。"
```

> `op issue close` は close 後の state 確認 (既に closed でも gh は成功する) を呼び出し側責務とする。
> `--all` モードでも、派生 Issue 連動 close は **常に個別確認** を挟む (元 Issue は人間立てが多く、勝手に close しない)。

> **mcp channel**: `op issue close --comment` は kind `issue_comment` → `issue_update` の
> **2-spec を順次 emit** する (1 コマンド呼び出しで 2 回の call-spec 往復になる)。司令官は
> github-channel.md §4 の義務を **各 spec ごとに順に** 実行する (コメント投稿 → read-back →
> ingest、続けて state 更新 → read-back → ingest。2 つをまとめて 1 回で検証しようとしない)。

### 4-3. worktree cleanup (apply worktree)

apply 用 worktree は `op run worktree cleanup` で片付ける (worktree remove + branch -D を一括実行):

```bash
# apply worktree (auto/<task-id>) の cleanup。task-id は branch 名から auto/ prefix を除いて得る。
TASK_ID=$(echo "$BRANCH" | sed 's|^auto/||')
op run worktree cleanup --task-id "$TASK_ID" --success
```

> **Cloud 分岐 (mcp channel / 別セッション実装の PR)**: このセッションが当該 PR を実装した
> worktree を持っていない場合 (別セッションが op-run で実装し、本セッションは op-merge のみを
> 実行している場合。Cloud の複数セッション運用で頻出)、`$BRANCH` に対応するローカル worktree が
> 存在しない。この場合 4-3/4-4 は **cleanup を skip し、その旨を報告するだけに留める**
> (存在しないパスに対して `git worktree remove` 等を試みてエラーを出す必要はない)。

### 4-4. review worktree + remote branch cleanup (raw bash 残置)

`op run worktree cleanup` は **task-id から計算される単一 apply worktree** のみを対象とする
(`compute_worktree_path`)。op-run フェーズ4 が作る **review worktree の glob** (複数世代パターン)
および **remote branch 削除** は現 primitive がカバーしていない。これらは raw bash 残置とし、
follow-up Issue で primitive 拡張を予定する (本 PR completion report に記載)。

> **mcp channel**: 本節の raw bash (`git worktree remove` / `git push origin --delete` 等) は
> ローカル git 操作であり mcp channel の call-spec 経路には乗らない。**remote branch 削除は
> mcp channel では行わない** (agent proxy が `git push --delete` を 403 で拒否することを実測済み、
> ADR-0027 6b「実測した摩擦」節)。ローカル worktree が無いセッション (4-3 の Cloud 分岐と同条件)
> では本節全体を skip して報告のみに留める。取り残された `auto/*` remote branch は op-sweep
> (ADR-0003) が grace period 後に一括削除するため無害 — 「即時削除できない」= 「事故」ではない。

```bash
# raw bash 残置 (follow-up: op run worktree cleanup の review-glob + remote-branch 拡張)。
# ローカル worktree/branch が存在するセッション (gh channel、またはこのセッション自身が
# 実装 worktree を持つ場合) でのみ実行する。

# (a) base branch を pull で同期する (低頻度 git operation)。
EXPECTED_BASE="${OP_MERGE_EXPECTED_BASE:-main}"
git checkout "${EXPECTED_BASE}" 2>/dev/null
git pull origin "${EXPECTED_BASE}"

# (b) review worktree の cleanup pattern (op-run フェーズ4-1 の命名規則に一致させる)
#   現行: review-${TASK_ID}-pr-${PR_NUM}-<unix-ts>
#   既存互換: 旧名 review-pr-${PR_NUM}-<unix-ts> / review-${TASK_ID}-<unix-ts> も拾う
REVIEW_WT_PATTERNS=(
  "${HOME}/cwork/worktrees/${REPO_NAME}/review-${TASK_ID}-pr-${PR_NUM}-*"
  "${HOME}/cwork/worktrees/${REPO_NAME}/review-pr-${PR_NUM}-*"
  "${HOME}/cwork/worktrees/${REPO_NAME}/review-${TASK_ID}-*"
)
for pattern in "${REVIEW_WT_PATTERNS[@]}"; do
  for rev_wt in $pattern; do
    [ -d "$rev_wt" ] && git worktree remove "$rev_wt" --force 2>/dev/null
  done
done
git worktree prune

# PR head branch (auto/<task-id>) の local + remote 即時削除。
#   --delete-branch (op pr merge) で remote 削除済みなら remote 側は no-op になる。
#   全体の auto/* sweep (grace 期間経過後) は op-sweep (ADR-0003) が担当。本節は当該 PR 限定の即時削除のみ。
gh pr view "$PR_NUM" --json headRefName --jq '.headRefName' > /tmp/op_head_branch.txt
PR_HEAD_BRANCH=$(cat /tmp/op_head_branch.txt)
rm -f /tmp/op_head_branch.txt
case "$PR_HEAD_BRANCH" in
  auto/*)
    git branch -D "$PR_HEAD_BRANCH" 2>/dev/null \
      && echo "✅ local branch 削除: $PR_HEAD_BRANCH" \
      || echo "⚠ local branch 削除失敗 (既に存在しない可能性あり): $PR_HEAD_BRANCH"
    git push origin --delete "$PR_HEAD_BRANCH" 2>/dev/null \
      && echo "✅ remote branch 削除: $PR_HEAD_BRANCH" \
      || echo "⚠ remote branch 削除失敗 (権限不足 / 既に削除済みの可能性あり)。手動: git push origin --delete $PR_HEAD_BRANCH"
    ;;
  *)
    echo "⚠ non-auto branch のため自動削除をスキップ: $PR_HEAD_BRANCH"
    ;;
esac
```

cleanup 失敗時は警告を出すが続行 (パスを覚えておきユーザーに後で報告)。
全体の `auto/*` sweep が必要な場合は `op-sweep` を別途実行する。

---

## manual override の対話確認

gate 11-18 (UX / security post-check) を緊急時に例外承認する場合の手順。
op-merge は **override block 不在時に override を有効と認めない** (= 該当 gate は block のまま)。
`op merge verify` が `<!-- op-manual-override -->` block を 10-AND 評価し、有効なら gate を skip する。

override 付与前に、op-merge は以下 6 項目が揃っているかをユーザーに対話確認する:

1. **承認者** (override を承認した人間の GitHub handle)
2. **理由** (なぜ post-check を skip / BLOCK のままマージするか。緊急性の根拠を含める)
3. **follow-up Issue 番号** (override 後に行う再監査・是正の追跡 Issue。security override は security-expert の再 post-check を必ず予約)
4. **overridden_at** (ISO8601 timestamp、override 承認時刻)
5. **reviewed_head_sha** (override 承認時の PR head SHA。push があれば再 override 必須)
6. **trusted author 投稿** (block を投稿するユーザーが trusted author 一覧に含まれること)

上記を満たす `<!-- op-manual-override -->` block を PR コメントとして残す
(template / 詳細 schema は `skills/_shared/pr-templates.md`、判定の正本は `op merge verify` の
`op_core::merge::manual_override` 10-AND 評価)。

```markdown
<!-- op-manual-override
override_target: pro-security-post-check-manual-override   # または pro-ux-ui-audit-manual-override
approver: <GitHub handle>
reason: <override の理由>
followup_issue: #<N>
overridden_at: <ISO8601 timestamp>
reviewed_head_sha: <40 hex SHA, override 承認時の PR head>
-->
```

> **label 単独で gate を skip する経路は存在しない**。block 不在 / trusted-author でない /
> 全フィールド未充足 / `reviewed_head_sha` が現在 head と一致しない (stale) のいずれかに該当すると、
> `op merge verify` は対応 gate を block 扱いにする。gate 21 (blocking-finding) は override 不可。

---

## フェーズ5: 報告と次の PR へ

```
## PR #<N> マージ完了

- マージ方式: squash
- 関連 Issue: #42 (closed) / #43 (closed) / #45 (closed)
- ブランチ削除: auto/<TASK_ID>
- worktree cleanup: 完了

残りのレビュー済み PR: M 件
次の PR (#M) に進みますか? (はい / 終了)
```

ユーザーが「終了」を選ぶまで繰り返す。

全 PR の処理が完了したら、以下の案内を表示する (任意実行、op-merge は自動起票しない):

```
## follow-up Issue 起票 (任意)

マージした PR から follow-up 候補を自動抽出して Issue 化したい場合は、以下を実行してください:

  /op-scan --from-merged-pr <マージした PR 番号の一覧>

op-scan が PR 本文 / review コメント / post-check Notes から follow-up 候補を抽出し、
enrichment (cross-instance collision gate) を経て plan モードで承認 → 起票します。
```

---

## --all モード

連続マージを最小確認で実施するモード。各 PR の解説は短縮版 (タイトル + 影響範囲 + レビュー結果のみ) を表示し、ユーザーは Yes/No だけ判断。

```
PR #61 fix(auth) — +85/-23, レビュー approve
取り込みますか? [Y/n]
> y
... マージ完了。次へ ...
```

途中で「やめる」と言われたら残りをスキップして終了。
**コンフリクト PR / needs-fix は --all モードでも自動的にスキップ** (`op merge verify` が block を返す)。

### --all モードでも個別確認に戻す危険カテゴリ

以下に該当する PR は、たとえ `pro-reviewed` であっても `--all` モードから個別確認 (フェーズ2 のフル解説) に戻す。

| カテゴリ | 検出方法 |
|---------|---------|
| security 由来 | ラベル `pro-security-expert` を含む |
| DB / migration / schema 変更 | 変更ファイルに `migrations/`, `*.sql`, `schema.*`, `*.prisma` を含む |
| 認証 / 権限変更 | パスに `auth`, `permission`, `capability` を含む |
| ファイル IO / シェル実行 | 変更ファイルが `fs::*`, `process::*`, `Command::new` を新規導入 |
| Tauri IPC / command | `src-tauri/` 配下、または `tauri::command`, `invoke(` の追加 |
| 大量削除 | deletions が additions の 3 倍超、または deletions > 200 |
| 変更ファイル数が多い | files > 30 |
| CI が skipped を含む | `statusCheckRollup` に skipped が混在 |
| Manual required = yes | PR 本文の検証レベルに `Manual required: yes` |

これらは **連続承認の対象から外す** ことで、雑な「Yes 連打」での事故を防ぐ。
個別確認に戻ったら、フェーズ2 のフル解説 (影響範囲・マージ後確認ポイント等) を提示してから判断を仰ぐ。

---

## 注意事項

本文で繰り返し明示している原則 (pro-reviewed のみ / 最終ゲート再検証 / squash デフォルト / コンフリクト時の中断 等) は省略。以下は自動化に誘惑されると確実に事故る原則のみを残す。

- **マージ判断は必ずユーザー**: 自動マージは存在しない。`op merge verify` が pass を返しても、`--all` でも各 PR ごとに Yes/No 確認を挟む
- **gate を SKILL.md で再実装しない**: gate 1-21 の判定は `op merge verify` が単一正本。bash で gate を書き直すと CLI 移行で revert され同じ false-positive を再導入する (Issue #510 の教訓)
- **派生 Issue 連動 close は必ず個別確認**: hidden marker `<!-- op-derived-from: #N -->` で元 Issue を検出、`superseded-by-scan` ラベル付き元 Issue を一緒に close するかユーザー判断 (`--all` モードでも省略しない)
- **--all モードは危険カテゴリを自動的に個別確認に戻す**: security / migration / 認証 / IO / Tauri IPC / 大量変更 / Manual required は連続承認の対象外
- **UI / security 影響 PR は post-check signal を必ず通す**: post-check skipped / needs-fix が残ったままの PR は、人間が manual-override を明示付与しない限りマージ対象外。`op merge verify` の gate 11-18 が担保する
- **manual-override は必ず追跡可能な状態で残す**: ラベル付与だけでは認めない。`<!-- op-manual-override -->` block (承認者 / 理由 / follow-up Issue / timestamp) が PR コメントに存在する場合のみ `op merge verify` が gate 11-18 を skip する。security override の follow-up Issue は `security-expert` による再 post-check を必ず予約する
- **op-merge は gate 専任**: コード修正 / re-review / re-post-check / review finding の解決は op-merge の責務外。stale review / stale post-check を `op merge verify` が block で返したら、自動マージせず op-run に戻す
- **shared label / marker semantics は "## Shared Merge State Contract" 節に従う**: `needs:human-decision` の default merge-blocking 規約と `needs:human-decision-followup` の許容条件、`<!-- op-planned-post-check-skipped -->` 単体では block しない規約は同節を参照。canonical 定義は `skills/_shared/markers/labels-and-markers.md` と `skills/_shared/runtime-contract.md`
- **installed op binary の鮮度**: gate 判定を `op merge verify` に委譲する以上、binary が古いと gate ロジックも古い。フェーズ0 の鮮度確認を省略しない

---

## 既知の gap (additive follow-up)

`op merge verify` の gate 評価器は全 gate の受け口を実装済みだが、一部は live 供給が partial
(`op-tools/docs/specs/merge-verify.md` §2 out-of-scope)。いずれも **fail-CLOSED 側に倒れる**
(gate を緩めない) ため本 wave で 1 PR 完結可能で、live 供給が揃い次第 additive に更新する:

- **gate 10 (全 post-check stale 全網羅)**: **ADR-0027 6b で配線済み**。review state 文書
  (`<!-- op-review-state -->`) の `post_checks` map (expert 名キー、aux は `<expert>@aux`) を列挙する
  ことで、複数 post-check の stale 判定が構造的に網羅される (以前は live builder 側の
  `post_check_latest_by_expert` 供給が未配線で gate 14f / 13b 単体検証に留まっていた)。
- **manual override の live 供給**: evaluator 側受け口は完成済み、live builder の `*_override` 供給は
  引き続き未配線 (state 文書の `manual_overrides[]` への配線は別 follow-up)。
- **UI 影響の path-based 判定**: live builder は label + marker のみで判定。changed files を使う
  path-based 判定は caller が別途 OR する拡張余地として残る。
- **worktree cleanup の review-glob + remote-branch 削除**: `op run worktree cleanup` は単一 apply
  worktree のみ対象。review worktree の複数世代 glob と remote branch 削除は raw bash 残置
  (フェーズ4-4)。primitive 拡張は follow-up Issue。**mcp channel ではこの節自体が到達不能**
  (ローカル git 操作のため。フェーズ4-4 の Cloud 分岐で skip する)。
- **(ADR-0028) mcp channel の manual override 素材**: materials bundle (3-0-mcp) は現状
  `security_override` / `ux_override` を live 供給しない (gh channel の live 供給が同様に
  additive follow-up であるのと同根)。override が必要な PR は gh channel セッションで verify
  し直すか、override 素材を bundle に手動で足すこと。
- **(ADR-0028) gate 20 の Refs Issue 実在判定**: `refs_issues[]` は `issue_read` (get) 止まりで
  staged 判定 (案A) の詳細 field を全て埋めるわけではない (gh channel の live builder と同じ
  現状維持、`op-tools/docs/specs/merge-verify.md` §2 参照)。
