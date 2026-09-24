---
name: op-run
description: GitHub Issue を読み込み、共通機能でクラスタリングして worktree 並列で実装、PR open、別 context で独立レビューまで自動完了するスキル。「op-run」「並列実装」「Issue 実装」等のキーワードで起動。
effort: max
---

# op-run: クラスタ並列実装 + 自動 PR + 独立レビュー

open Issue をクラスタリング → worktree 並列実装 → PR 自動 open → 別 context の review-expert による
global review → `pro-reviewed` ラベル付与までを自動で行う。各クラスターのライフサイクル
(apply → PR → post-check → review → Review Fix Loop) は ClusterOrchestrator (CO、Agent tool) が
`cluster-orchestrator-directives.md` に従って担い、controller には ClusterSummary だけが返る。
op-run はマージしない。マージは人間が `/op-skill:op-merge` (監査・順序付け・マージ) または GitHub で行う。

---

## 不変則

- 司令官 (main Claude) はコードを直接編集しない。apply / fix / post-check / review はすべて subagent に委譲する。
- コンフリクトは起こさない: Stage 1 (1-2) / Stage 2 (2-B、探知後) / 実 diff (2-D) の 3 段で検出する。どれも省略しない。
  直列化は prompt hint ではなく起動順 (serial_chains の controller 側直列ループ) で保証する。
- apply と review は別 context (別 Agent・別 worktree)。同じセッションで reviewer を演じない。
- 全クラスタは同じ `OP_RUN_BASE_SHA` から分岐する (0-base)。`origin/main` を直接参照しない。
- 失敗 worktree は自動削除しない (`_shared/worktree-ops.md` の隔離に従い、人間が判断する)。
- `op issue create` / `op pr create` / `op issue comment` は 1 件ずつ直列 (並列化・background 禁止)。
- claim はすべての verdict で release する (2-E-0)。
- spawn できるのは `_shared/active-expert-registry.md` の active expert のみ (1-2-c/d で正規化、上位契約: `_shared/runtime-contract.md`)。
- CO は subagent として spawn する (`_shared/expert-spawn.md`「expert spawn は subagent であること」)。teammate だと ClusterSummary が戻り値で返らない。
  CO が `nested_spawn_unavailable` を返したら 2-Orchestrate-inline に切り替える。
- Fable は 1-2-g で人間が承認した cluster の apply spawn のみ。それ以外 (CO / 探知 / post-check / review) は Opus 天井。
- 人間判断待ち Issue は manual_review_bucket に分離し apply しない (1-1-a)。
- PR / Issue のラベル操作は controller または CO だけが行う。expert subagent は label を触らない。
- fence 間の値は一時ファイル (`$RUN_DIR`) 経由で渡し、受け側は `:?` で検証する (`_shared/bash-fence-convention.md`)。
- controller の Read 規律は `_shared/read-economy.md`「Controller への適用」。

---

## 実行モード

| モード | 起動 | 挙動 |
|-------|------|------|
| 対話 (デフォルト) | `/op-skill:op-run` | plan mode で計画 → ExitPlanMode で人間承認後に実行 |
| 自動 | `/op-skill:op-run --auto` | plan mode なし。競合あり / Critical・High のセキュリティ Issue / `low` confidence を除外して残りを実行 |
| 指定 | `/op-skill:op-run #42 #43` | 指定 Issue のみ |
| ラベル絞り | `/op-skill:op-run --label bug` | 該当ラベルのみ |
| 正規化同期 | `--normalize` | partial Issue を op-scan `--from-issue` に委譲し、派生 Issue を取り込んで続行 (`--auto --normalize` で委譲まで自動) |
| 正規化非同期 | `--no-wait-normalize` | 委譲だけして今回は除外 (次回 op-run で拾う) |

`--auto` 単独では partial Issue は委譲しない (`requires-normalization` を付けて除外)。
並列上限は Workflow runtime / Agent 並列が透過的にキューイングする。controller は chunk 分割などの人為 cap をしない。

### 止まってよい条件

1-3 の承認後 (`--auto` は起動後) は、フェーズ5 の完了報告まで人間に確認を求めずに進める。途中で止まってよいのは次だけ:

- worktree hard cap 超過 (2-A-1)
- contract error (registry と agent frontmatter の矛盾、unregistered expert)
- op CLI / Workflow の致命的エラー (fail-closed と明記された exit)

`needs_human_decision` のクラスタ・2-D の競合・取りこぼし回収はフェーズ5 で提示し、他クラスタの進行を止めない。
status table の再 render は途中経過であり、ターンを終える理由にしない。

---

## フェーズ-1: プランモード自動遷移 (対話モード時)

対話モードでは起動直後に `EnterPlanMode` を呼び、フェーズ0〜1.5 を read-only で進める。
Issue/PR の書き込み・worktree 作成・apply spawn は 1-3 の承認後に行う。
`--auto` では呼ばない。詳細: `references/plan-mode-gate.md`。

---

## フェーズ0: 環境確認

### 0-1. git / gh

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する (mcp channel は gh auth 不要)。

### 0-cap. Dynamic Workflows capability preflight

`op-skill:op-run-discover` を呼ぶため、Workflow tool の capability preflight を行う。利用不可なら即停止し、
フォールバックしない (`_shared/workflow-calling.md` §1)。

### 0-base. BASE_REF 決定 (OP_RUN_BASE_REF / OP_RUN_BASE_SHA)

run 全体で 1 つの base を確定し、worktree / apply / PR `--base` / post-check diff / global review のすべてで共有する。
呼出側 (op-loop 等) が base を注入する場合は、この fence 冒頭で `OP_RUN_BASE_REF` / `OP_RUN_BASE_SHA` を
リテラル (または呼出側の env ファイルの `source`) で設定する。設定済みなら再計算しない。

```bash
: "${OP_RUN_TASK_BUNDLE_ID:=op-run-bundle-$(date +%Y%m%d-%H%M%S)}"   # claim owner ID (run 全体で共有)
RUN_DIR="${TMPDIR:-/tmp}/${OP_RUN_TASK_BUNDLE_ID}"; mkdir -p "$RUN_DIR"
OP_RUN_REPO="${OP_RUN_REPO:-$(git remote get-url origin | sed 's|.*github.com[:/]||;s|\.git$||')}"

if [ -z "${OP_RUN_BASE_SHA:-}" ]; then
  # ref の優先: OP_RUN_BASE_REF > origin/HEAD > main
  [ -n "${OP_RUN_BASE_REF:-}" ] || OP_RUN_BASE_REF="$(op run base-sha | jq -r '.payload.base_ref | sub("^origin/"; "")')"
  git fetch origin "$OP_RUN_BASE_REF:refs/remotes/origin/$OP_RUN_BASE_REF"
  OP_RUN_BASE_SHA="$(op run base-sha --base-ref "origin/$OP_RUN_BASE_REF" | jq -r '.payload.base_sha')"
fi
: "${OP_RUN_BASE_REF:?OP_RUN_BASE_SHA を注入する場合は OP_RUN_BASE_REF も必要}"
[[ "$OP_RUN_BASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "base SHA 解決失敗: $OP_RUN_BASE_SHA" >&2; exit 1; }
declare -p OP_RUN_TASK_BUNDLE_ID RUN_DIR OP_RUN_REPO OP_RUN_BASE_REF OP_RUN_BASE_SHA > "$RUN_DIR/env"
echo "RUN_DIR=$RUN_DIR"
```

以降の fence は冒頭で `source "<RUN_DIR>/env"` する (司令官は RUN_DIR の実パスを直書きする)。

---

## フェーズ1: Issue 取得とクラスタリング

### 1-1. Issue 取得

```bash
# 既定: auto-report。--label 指定時はそのラベル、番号指定時は op issue view <N>
op issue list --label "auto-report" --state open \
  --search "-label:op:in-progress -label:op-state -label:do-not-close" --limit 50
```

除外: `Fixes #N` する open PR が既にある Issue / `superseded-by-scan` ラベル付き / `--auto` の除外対象 (実行モード表)。
ファイルパスが無い Issue も弾かずフェーズ1.5 に回す。

#### 1-1-a. 人間判断待ち Issue の分離 (manual_review_bucket)

以下のラベルを持つ Issue は apply クラスタに入れず manual_review_bucket に分け、plan の「人間判断待ち」節に列挙する:
`needs:human-decision` / `needs:spec-decision` / `needs:triage`。

例外 (通常 apply に流す):
- `needs:human-decision` + `needs:human-decision-followup` の両方 → apply 担当は `safe_first_step` のみ実行し
  `blocked_actions[]` を守り、残る判断を PR 本文「残存リスク / follow-up」に転記する。
- `needs:boundary-decision` 単独 (参考タグで apply を止めない)。

本文に `実施: /op-skill:op-component` を含む Issue (部品 issue、`_shared/design-system.md`) は apply しない。plan の「op-component で実施」節に
列挙し、完了報告で `/op-skill:op-component <部品名> --issue <N>` を案内する。

残りの Issue はフェーズ1.5 (健全性チェック) を経て 1-2 に進む。

### 1-2. クラスタリング (Plan-time)

対象はフェーズ1.5 を通過した Issue (partial で委譲した元 Issue は除外し、派生 Issue を含める)。

1. 各 Issue の対象ファイル / module / domain (fingerprint 第 1 segment) / 1-2-c の expert を集め、
   `op run cluster plan --findings-json -` に渡して初期 ClusterPlan を得る
   (グルーピング・confidence・Stage 1 競合・global_conflict_files の正本は CLI と `_shared/clustering.md`)。
2. 司令官が結果を確認して 1 案に確定する (`needs_serialization` / 低 confidence の直列化、上限 5 Issue / cluster)。
   案の比較や複数案生成はしない。人間は 1-3 で承認・修正する。
3. 確定した cluster の Issue 番号を `$RUN_DIR/clustered-issues.txt` に 1 行 1 件で書き出す (1-2-e の入力)。

#### 1-2-pre. blocking finding の最優先化

`op:blocking-finding` ラベル付き Issue は他と混ぜず 1 Issue = 1 cluster にする。blocking がある run では blocking cluster だけを
直列 (severity → Issue 番号昇順) で実行し、他クラスタには着手しない (blocking の PR が人間にマージされた後、op-run を再実行する)。
plan では「最優先 (blocking)」として別表に出す。

```bash
op issue list --label "auto-report" --label "op:blocking-finding" --state open --limit 50 | jq '[.details.issues[].number]'
```

### 1-2-b. global_conflict_files

`op run cluster plan` の `global_conflict_files` に当たるクラスタは直列化する。判定不能も直列化する。Stage 1 で並列可でも 2-B で再検証する。

### 1-2-c. expert 解決ロジック (apply / post-check の決定)

Issue ごとに `op run expert-resolve` で apply / post-check expert を解決・正規化する。
CLI で決まらない規則は `references/expert-resolution.md`。

### 1-2-d. Active Apply Expert Normalization (planned expert を runtime に漏らさない)

正規化後の expert を `cluster.expert` (bare 名) に保持し、plan にも正規化後の名前を出す。
`needs_human_decision` の Issue は spawn せず manual_review_bucket に回す。契約: `references/expert-resolution.md`。

### 1-2-e. claim acquire (Plan mode 前の排他取得)

cluster 確定後・1-3 の plan gate 前に、Issue 単位で claim を取る (`_shared/markers/claim-markers.md`)。
exit 1 (他 instance が owner) の Issue は cluster から外して再構成し、全 Issue が skip なら正常終了。exit 2 は run 全体を abort。
mcp channel では `op claim` が恒久 refuse のため skip し、単一 instance 前提で運用する (Cloud で並行 op-run を走らせない)。

```bash
source "<RUN_DIR>/env"
: "${OP_RUN_TASK_BUNDLE_ID:?}" "${OP_RUN_REPO:?}"
test -s "$RUN_DIR/clustered-issues.txt" || { echo "clustered-issues.txt が無い (1 行 1 Issue 番号で書き出す)"; exit 1; }
if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "⚠️ mcp channel — claim を skip。単一 instance 前提で運用すること"
  cp "$RUN_DIR/clustered-issues.txt" "$RUN_DIR/claimed-issues.txt"
else
  : > "$RUN_DIR/claimed-issues.txt"
  while read -r ISSUE; do
    op claim acquire --repo "$OP_RUN_REPO" --issue "$ISSUE" --task-id "$OP_RUN_TASK_BUNDLE_ID"
    case $? in
      0) echo "$ISSUE" >> "$RUN_DIR/claimed-issues.txt" ;;
      2) echo "❌ op claim acquire 致命的エラー: #$ISSUE" >&2; exit 2 ;;
    esac
  done < "$RUN_DIR/clustered-issues.txt"
  test -s "$RUN_DIR/claimed-issues.txt" || { echo "ℹ️ 全 Issue が他 instance に claim 済。終了。"; exit 0; }
fi
cat "$RUN_DIR/claimed-issues.txt"
```

claim できなかった Issue を除いて cluster を再構成してから 1-2-g / 1-3 に進む。

### 1-2-g. Fable escalation gate (apply spawn の昇格提案、model-selection.md §7.2)

cluster 確定後・1-3 の plan gate 直前に 1 回だけ、候補 cluster の apply spawn を Fable へ上げるかを人間に提案する。
候補条件・D1〜D6・skip 条件は `_shared/model-selection.md`「§7.2 F4」「§7.2 F7」、承認の扱いは「§7.2 F5」。
実行中に候補が判明しても追加提案せず、フェーズ5 に次 run 向けメモを 1 行残す。

- この時点の D 判定材料: `files_declared` (D1 / D5)、cluster 内 Issue の `task_complexity` (D2 / D3)、Issue 本文の risks (D4)、前 run の review_round (D6、判らなければ不成立)。
- 提示は `AskUserQuestion` (既定は Opus 維持)。1 cluster ごとに「担当 expert / 成立した D<n> と 1 行根拠 / 影響範囲 (この cluster の apply spawn のみ)」を示す。複数候補は `multiSelect: true` でよい。
- 反映: 承認 → `cluster.apply_model = "fable"`、それ以外 → `cluster.apply_model = cluster.model`。`cluster.model` (CO 自身の model) は上げない。

### 1-3. ユーザー承認 (対話モード: ExitPlanMode + plan file)

plan file を書き出して `ExitPlanMode` を呼ぶ。plan file の構成・承認オプション・「Keep planning with feedback」時の
戻り先は `references/plan-mode-gate.md`。承認前に worktree 作成 / spawn をしない。
`--auto` は plan file と ExitPlanMode を skip し、実行モード表の除外規則で残りを実行する。

---

## フェーズ1.5: Issue 健全性チェックと正規化委譲

1-1 と 1-2 の間で、実装に足る指示を持つ Issue だけをクラスタリングに進める
(`op run issue-health` で complete / partial / insufficient を判定、partial は op-scan `--from-issue` へ委譲、
insufficient は投げ返し)。詳細: `references/issue-health-check.md`。

---

## フェーズ2: クラスタ並列実装 (探知 → 再クラスタ → ClusterOrchestrator 起動)

| フェーズ | 内容 | 並列性 |
|---------|------|-------|
| 2-A 探知 | investigation reader が `files_likely_to_modify` を申告 (edit / commit / push 禁止) | 全クラスタ並列 |
| 2-B 再クラスタリング | 司令官が Stage 2 競合検出 → partition 確定 | 司令官のみ |
| 2-Orchestrate | CO を parallel_clusters は並列、serial_chains は直列で起動 | partition に従う |
| 2-D Post-run conflict check | CO 完了後に実 diff の重複を検証 | 司令官のみ |

### 2-A. 探知フェーズ

#### 2-A-1. worktree provision

開始前に `_shared/worktree-ops.md`「並列度 hard cap / soft warning gate」を通す。
cluster ごとに worktree を 1 回だけ provision し (直列ループ)、返る `payload.worktree_path` を探知と CO で再利用する。

```bash
source "<RUN_DIR>/env"
RUN_TS="${RUN_TS:-$(date +%Y%m%d-%H%M%S)}"; declare -p RUN_TS >> "$RUN_DIR/env"   # 一度だけ確定
# cluster ごと (直列):
TASK_ID="<verb>-<scope>-${RUN_TS}-<id_short>"      # cluster.task_id として保持
op run worktree-provision --task-id "$TASK_ID" --base-sha "$OP_RUN_BASE_SHA" \
  --cluster-id "<id_short>" --repo "$(git rev-parse --show-toplevel)"   # --repo は絶対パス (slug 不可)
```

apply worktree は post-check / global review が終わるまで prune しない (review worktree は CO が別に作る)。

#### 2-A-2. 探知 workflow を呼び出す (op-run-discover)

呼び出し規約は `_shared/workflow-calling.md` §1-§2 / §4。

```javascript
const discoverRaw = Workflow({
  name: 'op-skill:op-run-discover',
  args: {
    clusters: approved_clusters.map(c => ({
      id: c.id, id_short: c.id_short,
      expert: c.expert,                 // 1-2-d で正規化済み (bare 名)
      model: c.model,                   // model-selection.md §6 (Opus 天井。fable は渡さない)
      module: c.module, issues: c.issues,
      files_declared: c.files_declared,
      worktree_path: c.worktree_path,   // 2-A-1 で provision 済み
    })),
    base_sha: OP_RUN_BASE_SHA, base_ref: OP_RUN_BASE_REF, ts: RUN_TS,
  },
})
const discoverOut = discoverRaw.result ?? discoverRaw
// { base_sha, base_ref, ts, reports: [investigation report...] }
```

#### 2-A-3. report 集約 (discover 戻り値が barrier)

`discoverOut.reports` が Stage 2 の入力。report が欠けた / 探知失敗のクラスタは
`files_likely_to_modify: []`, `needs_serialization: true` として 2-B で直列化する。

### 2-B. 再クラスタリング (Stage 2 競合検出)

reports を `[{"cluster_id","files_likely_to_modify","needs_serialization"}]` に整形して渡す。

```bash
op run cluster recheck --results-json "$RUN_DIR/cluster-recheck.json"
# payload.recheck_clusters[].needs_serialization / competing_file_groups
```

直列化対象: `files_likely_to_modify` が他と重複 / `needs_serialization: true` / `risk_files` を共有 /
`files_likely_to_modify` が空。再構成結果は提示のみで、承認は取り直さない (直列化は 1-3 の承認範囲内)。

#### 2-B-partition. parallel_clusters / serial_chains の確定

- parallel_clusters: 直列化対象に該当しない独立クラスタ (CO を 1 メッセージ内で並列 spawn)
- serial_chains: 競合関係にあるクラスタを chain にまとめる (controller 側の直列ループで逐次 await)

### 2-Orchestrate. ClusterOrchestrator 並列/直列起動

#### 2-Orchestrate-pre. 起動前の準備

```bash
source "<RUN_DIR>/env"
: "${OP_RUN_BASE_SHA:?}" "${RUN_TS:?}"
: "${OP_RUN_SESSION_ID:=oprun-${RUN_TS}-bundle-${OP_RUN_TASK_BUNDLE_ID##*-}}"   # 全 CO で共有 (CO は mint しない)
declare -p OP_RUN_SESSION_ID >> "$RUN_DIR/env"
```

全クラスタ (parallel_clusters + serial_chains を展開) の `{cluster_id, issues, worktree_path}` を
`$RUN_DIR/clusters.json` に書き出す (2-D と 2-E-0 が cluster_id から引く)。

#### 2-Orchestrate-parallel. parallel_clusters の並列起動

各クラスタの `ClusterOrchestratorInput` (正本: directives フェーズ0) を組み立て、1 メッセージに全 Agent 呼び出しを並べる。

```javascript
// skill_dir = この skill の Base directory (Skill 読み込み時に表示される絶対パス)。相対パスは plugin 配布では解決しない
// code_review_effort = model-selection.md §5.5 で派生 (未決なら "auto")
Agent({
  subagent_type: "op-skill:feature-expert",
  description: "ClusterOrchestrator: <id_short>",
  model: cluster.model,              // CO 自身は Opus 天井。Fable 承認は apply_model にだけ載る
  prompt: `
    invocation_mode: op_managed

    あなたは ClusterOrchestrator です。以下の指示書を Read して完全に従ってください:
    ${skill_dir}/cluster-orchestrator-directives.md

    入力 payload (JSON):
    ${CLUSTER_INPUT}
  `
})
```

#### 2-Orchestrate-serial. serial_chains の直列起動 (controller-side)

chain 内のクラスタは、前の CO が ClusterSummary を返してから次を起動する (prompt・payload は parallel と同じ)。
直列化はこの戻り値待ちで強制する。

#### 2-Orchestrate-inline. CO が配下を spawn できない場合

CO が verdict `nested_spawn_unavailable` を返したら (`_shared/expert-spawn.md`「subagent 内からの spawn」)、
この run の残りでは CO を spawn せず、controller が CO を兼ねる。

- 対象: `nested_spawn_unavailable` を返したクラスタと未起動のクラスタすべて。切替時に人間へ 1 行で知らせる。
- 順序: 1 クラスタずつ直列に実行する (parallel_clusters → serial_chains の chain 順)。
- 手順: `${skill_dir}/cluster-orchestrator-directives.md` を Read し、そのクラスタの `ClusterOrchestratorInput` を入力として
  フェーズ0 (Agent tool の確認は省く) 〜フェーズ8 を実行する。apply / post-check / review の expert は controller が直接 spawn する。
- 終了: フェーズ8 の JSON を `$RUN_DIR/summary-<id_short>.json` に書き、ターンを終えずに次のクラスタへ進む。全クラスタ後に 2-D / 2-E へ。
- context: 次のクラスタへ進むときは ClusterSummary だけを保持し、finding 全文・review raw data を後続の判断に持ち込まない。
- 不変則は CO と同じ: コードは expert に編集させる、apply と review は別 subagent、model を決め直さない。

### 2-D. Post-run conflict check (実 diff の最終検証)

全 CO の ClusterSummary 受領後、人間に結果を渡す前に実 diff の重複を検証する (2-E-0 の verify とは別目的。省略しない)。

```bash
source "<RUN_DIR>/env"
jq '[.[] | {cluster_id, worktree_path}]' "$RUN_DIR/clusters.json" > "$RUN_DIR/cluster-worktrees.json"
op run cluster-overlap --clusters-json "$RUN_DIR/cluster-worktrees.json" --base-ref "origin/${OP_RUN_BASE_REF}" \
  | jq '.payload.competing_file_groups'
```

`competing_file_groups` が空でなければ:

| 状況 | 対処 |
|------|------|
| 該当クラスタが直列実行だった | 提示のみ (op-merge の merge commit で解消可能) |
| 並列実行されていた | 人間に competing diff を提示し、片方を破棄 / 手動統合のいずれかを決めてもらう |

### 2-E. ClusterSummary 受領と進捗監視

ClusterSummary の schema は `cluster-orchestrator-directives.md` フェーズ8 が正本。

#### 2-E-0. ClusterSummary verdict 受領 gate (mandatory)

| verdict | controller の動作 |
|---------|-----------------|
| `approved` | claim release → status table 更新 |
| `approve_with_followup` | claim release → `followup_findings` をフェーズ5 の follow-up 候補に記録 |
| `needs_human_decision` | claim release → `blocker_reason` を人間に提示 |
| `pr_open_degraded_mcp_channel` | claim release → `degrade_note` を提示し、ローカル (gh channel) での後続実施を案内 |

claim release はすべての verdict で行う (best-effort。失敗は `op claim sweep` が回収)。mcp channel では skip。

```bash
source "<RUN_DIR>/env"
CID="<ClusterSummary.cluster_id>"
for ISSUE in $(jq -r --arg cid "$CID" '.[] | select(.cluster_id == $cid) | .issues[]' "$RUN_DIR/clusters.json"); do
  op claim release --repo "$OP_RUN_REPO" --issue "$ISSUE" --task-id "$OP_RUN_TASK_BUNDLE_ID" \
    || echo "⚠️ op claim release 失敗: #$ISSUE (sweep で回収)" >&2
done
```

#### 2-E-3. CO write 取りこぼし回収 (mandatory)

`pending_label` が非 null → `op pr edit-labels --pr <N> --add "<label>"` で補完する
(mcp channel は fresh な `search_pull_requests` 素材を `--input-json` で渡し、`github-channel.md` §3-§4 で完遂)。

#### 2-E-1. status table 再 render 規約

CO が 1 つ返るたびに status table を再 render する (列: # / cluster_id / Issue / expert / Claim / Status / PR / verdict)。

- Claim: `owned (task=<id>)` / `not-owned (skipped)` / `—`
- Status: `running` / `done` / `blocked` / `failed` / `terminal` / `pending`
- PR: URL / `—` / `none — <reason>`

---

## フェーズ3〜4.5: PR 作成 / Post-check / Global Review / Review Fix Loop (CO 内部)

controller は直接実行せず ClusterSummary を受け取るだけ。review / post-check の結果は PR body の op-review-state 文書
(`op review state pull/push`) が唯一の記録で、mcp channel でも成立する。

- フェーズ3 (PR 作成): CO フェーズ4
- フェーズ3.5 (Post-check Dispatch): CO フェーズ5.5 / `references/post-check-dispatcher.md` (3.5-A UX/UI、3.5-B Security)
- フェーズ4 (Global Review): CO フェーズ5-6 / `references/global-review-spawn.md`
- フェーズ4.5 (Review Fix / Specialist Decision Loop): CO フェーズ7 / `references/review-fix-loop.md`

---

## フェーズ5: 完了報告

```
## op-run 完了

### 実装結果
<2-E-1 の status table>
<1 行サマリ: 例「2/4 clusters approved, 2 needs_human_decision」>

### needs_human_decision / pr_open_degraded_mcp_channel クラスタ
- <cluster>: <blocker_reason / degrade_note>。方針決定後に PR を更新または close する

### follow-up 候補 (自動起票しない)
- <cluster / PR>: approve_with_followup の Medium/Low finding (followup_findings) / recommended_followup_experts / 未解消 assumptions / blocked_actions 抵触候補

### model 昇格 (1-2-g)
- 承認された昇格 / 「なし (全 cluster Opus 天井)」/ skip 理由
- (該当時) 次 run で #<issues> は Fable 昇格の候補: <理由>

### 次のステップ
- `/op-skill:op-merge` で監査・順序付け・マージする (または GitHub で手動マージ)。`pro-reviewed` はマージ判断の参考シグナル。
  Issue は PR 本文の `Fixes #N` で close される。手動マージ時の worktree 片付けは op-cleanup。
- follow-up を Issue 化するかは人間が判断する。する場合はマージ後に `/op-skill:op-scan --from-merged-pr <PR...>`
- needs_human_decision: blocker_reason を確認して方針を決める
```
