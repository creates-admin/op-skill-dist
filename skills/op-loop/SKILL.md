---
name: op-loop
description: op-architect が起票した depends_on 工程群を、依存順 (DAG 層順) に直列駆動して完遂まで回す Direct Mode 固定の監督ループスキル。各層は op-run と同じ ClusterOrchestrator で実装し、層間に人間 gate (align→dispatch + op-merge) を挟む。「op-loop」「工程ループ」「依存順実装」「DAG 駆動」「milestone 群を回す」等のキーワードで起動。
effort: medium
---

<!--
schema_version: 1
last_breaking_change: 2026-06-21
notes: v1 (2026-06-21): 初版。ADR-0019 op-loop 本体 (D1〜D10)。
       op-run が depends_on を消費できない構造的穴 (工程順の直列駆動が不可能) を、
       op-run と CO 実行エンジン (cluster-orchestrator-directives.md) を共有する独立 peer skill で埋める。
       op-run/CO/worktree 規約/marker は一切改変しない純 composition (D5 framing 厳守)。
       IU1 = SKILL.md コア。IU2 (本変更) = --relay hardened protocol を references/relay-protocol.md に
       展開 (3 本柱: idle 検知+nudge / SendMessage(to:main) 契約 / mailbox stall 能動 poll)。SKILL.md --relay 節は
       要点+pointer に圧縮。additive ゆえ schema_version 据置 (v1 内の純追加)。
       CLAUDE.md / op-architect / op-plan / registry への配線は IU3 (本ファイルでは触らない)。
       参照 pin: cluster-orchestrator-directives.md (>=1) / op-run/SKILL.md (>=1) /
       worktree-ops.md (>=3, 外部 base 注入節) / labels-and-markers.md (>=9, op-depends-on) / model-selection.md (>=4) /
       op-spec/SKILL.md (>=1, align 手本) / invocation-mode.md (>=1) / references/relay-protocol.md (--relay 詳細正本)。
-->

<!--
機能概要: op-architect の depends_on 工程 issue を CO 共有で **depends_on DAG 層順に直列駆動**し、
         層間に人間 gate (align→dispatch + op-merge) を挟んで完遂まで回す監督ループ skill。
作成意図: op-run は depends_on を消費できず (labels-and-markers.md L1207)、ファイル競合ベースでしか
         直列化しない。皮肉なことに op-architect は milestone を「並列実行可能になるよう わざと
         ファイル非結合」に設計するため、工程依存はファイル競合に現れない論理依存となり、op-run の
         競合ベース直列化では構造的に見えない。op-loop はこの穴を、CO 内部・worktree 規約・marker を
         一切改変せず、DAG の層を外側ループで直列に回すだけの純 composition で埋める (ADR-0019)。
注意点: op-loop は op-run skill を呼ばない (D5)。op-run と同じ「clustering→discover→CO 並列/直列
         spawn→barrier」ブロックを自前のフェーズとして持つ peer であり、層内手順は op-run/SKILL.md
         への pointer 参照に留める (コピー禁止、Single Canonical Source Rule)。
         op-loop は merge しない (D6 / 不変則7)。層間で人間が /op-merge を回し、op-loop は origin/main
         の新 HEAD を検出して OP_RUN_BASE_SHA を前進させるだけ。
-->

# op-loop: depends_on 工程を CO 共有で直列駆動する監督付き完遂ループ

op-loop は、op-architect が起票した **互いに依存する工程 (milestone) 群** を、
`op-depends-on` marker から構築した **depends_on DAG の層順に直列駆動** し、
各層を op-run と同じ ClusterOrchestrator (CO) で実装して完遂まで回す Direct Mode 固定スキルである。

層と層の間には人間 gate (align→dispatch + op-merge) を挟む。op-loop 自身は merge せず、
人間が `/op-merge` で層 N を取り込んだ後、op-loop が `origin/main` の新 HEAD を検出して
次層の base を前進させる (不変則7 / 自動マージ禁止を尊重)。

## 3 原則

1. **Direct Mode 固定** — `_shared/invocation-mode.md` に従い、OP-managed 経路なし。人間が `/op-loop` で起動する (op-architect からの自動 handoff は持たない、ADR-0019 D4)
2. **純 composition / op-run 無改変** — op-run skill を呼ばず、CO 実行エンジン (`cluster-orchestrator-directives.md`) を共有する peer。op-run / CO / worktree 規約 / marker を一切改変しない (D5)
3. **監督 = 層間 gate** — gate (人間 go/no-go) は層境界に置く。context クリアは層内クラスタごと fresh CO subagent が担う (D3)。controller は薄く保つ (terse relay、D10)

## 3 レーン運用モデル (op-codev / op-loop / op-run)

op-codev / op-loop / op-run はすべて CO の上の front-end であり、**partition 戦略 × 監督深度** で分かれる (ADR-0019)。

| skill | partition | 並列性 | 監督 | 想定 |
|---|---|---|---|---|
| op-codev | 単品 (1 件) | なし | 高 (工程内も対話) | 1 件・1 セッションに収まる |
| **op-loop (本スキル)** | **depends_on DAG の層** | **層を直列 / 層内並列** | **中 (層間 go/no-go)** | **ADR 級の依存工程群** |
| op-run | ファイル競合グラフ | 並列 + 競合直列 | 低 (自律 + 独立 review) | 大量の独立 Issue |

op-loop の真の差別化は「直列」一般ではなく **「depends_on 順の直列 (= op-run に構造的にできないこと) +
監督付き + 工程ごと fresh context + 完遂 driver」** である。

op-loop の責務:

- **DO**: discovery (DAG 構築 + 層提示)、層ループ (層内は op-run の clustering/CO を fractal 再利用)、層間 2 段 gate (align→dispatch + op-merge 案内)、base 前進、失敗時 DAG-aware 提示、ステートレス resume
- **DON'T**: op-run skill の呼び出し / CO・worktree 規約・marker の改変 / **自動 merge** (層間取り込みは人間 op-merge gate)、ADR 化、新 active expert の追加 (新 expert 0)

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 |
|------|------|
| `~/.claude/skills/op-run/cluster-orchestrator-directives.md` (>=1) | CO 入力契約 (`ClusterOrchestratorInput`) / CO の 10 フェーズ正本。op-loop は層内でこの CO を撒く |
| `~/.claude/skills/op-run/SKILL.md` (>=1) | フェーズ1 (Issue 取得・clustering) / フェーズ2-A (探知) / 2-B (Stage 2 競合検出) / 2-Orchestrate (CO 並列・直列起動) / 0-base (base 解決 guard)。**層内手順はこの pointer を適用する (コピー禁止)** |
| `~/.claude/skills/_shared/worktree-ops.md` (>=3) | worktree ライフサイクル + 「外部 base 注入」節 (op-loop が層ごとに `OP_RUN_BASE_SHA` を export して前進させる契約、ADR-0019 D6)。`(>=3)`: 外部 base 注入節は schema_version 3 で additive 追加されたため |
| `~/.claude/skills/_shared/markers/labels-and-markers.md` (>=9) | `op-depends-on` marker (工程依存の機械契約) / `milestone:initial` label の意味 |
| `~/.claude/skills/_shared/model-selection.md` (>=4) | CO / expert の model 選択 (op-run と同一を継承、op-loop 固有 gating なし、D10) |
| `~/.claude/skills/op-spec/SKILL.md` (>=1) | align→dispatch gate の文言・血統の手本 (present → align の流儀) |
| `~/.claude/skills/_shared/invocation-mode.md` (>=1) | Direct Mode 判定 (本スキルは Direct Mode 固定) |
| `~/.claude/skills/op-loop/references/relay-protocol.md` | `--relay` (工程内 relay、既定 OFF) の hardened protocol 詳細正本 (3 本柱 / cost / 手動 fallback)。SKILL.md 「監督深度オプション: --relay」節からこれを参照する |

> **不変則 (CLAUDE.md ### 1 Single Canonical Source Rule)**: 層内の clustering / discover / Stage 2 競合検出 /
> CO spawn の手順は **op-run/SKILL.md フェーズ1-2-Orchestrate と cluster-orchestrator-directives.md が正本**であり、
> 本ファイルに全文コピーしない。op-loop 固有部分 (DAG 層抽出 / 層ループ / 層間 gate / base 前進) だけを実体として書く。

---

## フェーズ -1: EnterPlanMode (discovery → 層提示を plan mode 下で承認)

司令官は起動直後に **`EnterPlanMode` tool を呼ぶ**。
以降のフェーズ 0〜1 (環境確認 / discovery) が plan mode 下で進行し、Edit / Write / Bash の書き込み系が
権限機構レベルでブロックされる。discovery (DAG 構築 / 層提示) は read-only CLI のみなので plan mode 下で実行できる。

plan mode 状態判定は `op-codev/SKILL.md` フェーズ -1 と同様 (EnterPlanMode 応答で判定)。

フェーズ 1 末尾の `ExitPlanMode` で DAG / 層構造をユーザーに提示・承認させる。
承認した場合、フェーズ 2 (層ループ) が進行する。

---

## フェーズ 0: 環境確認

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md` に従って判定する。本スキルは **Direct Mode 固定**。
spawn prompt に `invocation_mode: op_managed` が混入していた場合は契約違反として停止し、ユーザーに状況を報告する。

### 0-2. git / gh / op binary 確認 + dep-graph 可用性

```bash
# git リポジトリ判定
git rev-parse --is-inside-work-tree 2>/dev/null \
  || { echo "not a git repo — op-loop は既存リポジトリ上で動作します"; exit 1; }

# gh 認証 (Issue 取得・op-merge gate 案内に必要)
gh auth status 2>/dev/null \
  || { echo "gh login が必要です。認証してください"; }

# op binary 鮮度確認
if command -v op >/dev/null 2>&1; then
  op version --json 2>/dev/null | jq -r '"op binary: " + .version'
else
  echo "[op binary] 見つかりません (cargo install --path op-tools/crates/op で配置してください)"
  exit 1
fi

# op issue dep-graph (工程A) の可用性確認 — discovery の前提
op issue dep-graph --help >/dev/null 2>&1 \
  || { echo "❌ op issue dep-graph が使えません。op binary を最新化してください (工程A 未配備)"; exit 1; }
```

---

## フェーズ 1: discovery (工程群探索 → DAG 構築 → 層提示)

op-run の clustering / discover をミラーする discovery フェーズ (ADR-0019 D4)。**read-only**。

### 1-1. 工程 issue 群の探索キー確定

工程 issue は op-architect が `milestone:initial` label (+ `module:*`) を付けて起票している
(`op-architect/SKILL.md` の milestone 起票)。既定の探索キーは `milestone:initial`。
ユーザーが `/op-loop --label <L>` や `/op-loop --numbers N M …` で明示した場合はそれを優先する。

### 1-2. DAG 構築 (op issue dep-graph — 工程A の決定論 primitive)

`op issue dep-graph` (工程A) が `op-depends-on` marker を読み、topo-sort (層分割) / cycle 検出 / 欠落参照算出を
決定論で行い JSON envelope で返す。op-loop は bash で topo-sort せず、この CLI の出力を JSON で受ける
(bash topo-sort は脆く silent fail するため避ける、ADR-0019 D1 / bash fence convention)。

```bash
# フェーズ1-2: 工程群の depends_on DAG を構築する (read-only、plan mode 下で実行可)。
#   - 出力 JSON envelope: .decision (pass) / .details.{nodes, layers, cycles, missing}
#     - .details.nodes  : 対象工程の全番号 (昇順)
#     - .details.layers : 依存深度ごとの層配列。layers[0] = 依存無し (最初に着手可能)、以降は前層完了が前提
#     - .details.cycles : 循環依存に参加するノード群 (非空なら DAG 構築不能)
#     - .details.missing: depends_on に現れたが nodes に無い欠落参照
#   - 後続フェーズ (層ループ) へ層配列を export して渡す。
export LOOP_LABEL="${LOOP_LABEL:-milestone:initial}"   # --label / --numbers 明示時は呼出側が上書き

# label 探索 (既定) — --numbers 明示時は `--numbers N M …` に差し替える
DEP_GRAPH_JSON="$(op issue dep-graph --label "$LOOP_LABEL" 2>/dev/null)" \
  || { echo "❌ dep-graph 構築失敗 — gh 認証 / label / op binary を確認してください"; exit 1; }

# .decision が pass であることを確認 (envelope 契約)
DECISION="$(printf '%s' "$DEP_GRAPH_JSON" | jq -r '.decision // "missing"')"
[ "$DECISION" = "pass" ] \
  || { echo "❌ dep-graph decision != pass ($DECISION)"; exit 1; }

# 層 / cycle / missing を取り出す
export LOOP_LAYERS_JSON="$(printf '%s' "$DEP_GRAPH_JSON" | jq -c '.details.layers')"
CYCLES_JSON="$(printf '%s' "$DEP_GRAPH_JSON" | jq -c '.details.cycles')"
MISSING_JSON="$(printf '%s' "$DEP_GRAPH_JSON" | jq -c '.details.missing')"
```

### 1-3. cycle / missing の停止判定 (DAG 構築不能なら人間に修正要求)

```bash
# フェーズ1-3: cycle / missing が非空なら DAG が組めない → 停止して人間に修正を要求する。
#   op-loop は推測で層順を組まない (depends_on の機械契約が壊れている状態で走らせない)。
: "${LOOP_LAYERS_JSON:?LOOP_LAYERS_JSON must be set by 1-2}"

CYCLES_N="$(printf '%s' "${CYCLES_JSON:-[]}" | jq 'length')"
MISSING_N="$(printf '%s' "${MISSING_JSON:-[]}" | jq 'length')"

if [ "${CYCLES_N:-0}" -gt 0 ] || [ "${MISSING_N:-0}" -gt 0 ]; then
  echo "❌ depends_on DAG を構築できません (op-loop は停止します):"
  [ "${CYCLES_N:-0}" -gt 0 ] && echo "  - 循環依存: ${CYCLES_JSON}  → 工程 issue の op-depends-on marker を見直してください"
  [ "${MISSING_N:-0}" -gt 0 ] && echo "  - 欠落参照: ${MISSING_JSON}  → 参照先 issue が未起票 / close 済 / label 不一致の可能性"
  echo "  修正後に再度 /op-loop を起動してください。"
  exit 1
fi
```

### 1-4. 層構造の可視化提示 (ExitPlanMode で DAG 承認)

層配列を Layer 0 / 1 / 2 … として可視化し、ユーザーに「この DAG で駆動するか」承認させる。
**`ExitPlanMode`** で提示する:

```
## op-loop discovery — depends_on DAG 駆動計画

探索キー: <LOOP_LABEL or --numbers>
対象工程: <nodes の件数> 件

| Layer | 工程 issue | 並列性 |
|-------|-----------|--------|
| 0 (最上流) | #806, #807 | 層内並列 (ファイル競合あれば直列) |
| 1 | #808 | (Layer 0 完了 + op-merge 後に着手) |
| 2 | #809 | (Layer 1 完了 + op-merge 後に着手) |

実行方針:
- 各層を Layer 0 → 1 → 2 … の順に **直列** 駆動します。
- 層内は op-run と同じ clustering / 探知 / CO 並列・直列 spawn で実装します (工程ごと fresh CO で context クリア)。
- 層完了ごとに 2 段 gate を置きます:
  ① align→dispatch (未定点があれば推奨付きで 1 問ずつ詰める / 無ければ skip)
  ② op-merge go/no-go (あなたが `/op-merge` で層の PR 群を取り込む → op-loop が base を前進)
- op-loop は merge しません (不変則7 / 自動マージ禁止)。base 前進は op-merge 後の origin/main 新 HEAD 検出で行います。

承認するとフェーズ 2 (層ループ) を開始します。DAG に修正がある場合 (工程の depends_on を直したい等) は指示してください。
```

> **resume の挙動 (D9、後述フェーズ 5)**: 既に一部の工程が close 済みなら、close 済み issue は dep-graph の
> 探索対象から自然に外れる (label `--state open` 相当の探索) ため、残り層だけが提示される。専用 state marker は持たない。

---

## フェーズ 2: 層ループ (DAG 層を直列駆動)

ExitPlanMode 承認後、`LOOP_LAYERS_JSON` の層を **index 0 から直列** に回す外側ループ。
これが op-loop の中核 (ADR-0019 D3 / D5)。

### 2-0. 層ループの骨格

```bash
# フェーズ2-0: 層を index 0 から直列に回す外側ループの骨格。
#   各層 i について 2-1 (層内実装) → 2-2 (層完了集約) → フェーズ3 (層間 gate) → フェーズ4 (base 前進) を順に行う。
#   層をまたいで OP_RUN_BASE_SHA を前進させる (フェーズ4)。export して各層内処理 / op-run フェーズ0-base へ渡す。
: "${LOOP_LAYERS_JSON:?LOOP_LAYERS_JSON must be set by フェーズ1-2}"

# base ref / 初期 base SHA を確定する (層 0 の base = 現在の origin/<base_ref> HEAD)。
export OP_RUN_BASE_REF="${OP_RUN_BASE_REF:-main}"
git fetch origin "${OP_RUN_BASE_REF}:refs/remotes/origin/${OP_RUN_BASE_REF}" 2>/dev/null || true
export OP_RUN_BASE_SHA="$(git rev-parse "origin/${OP_RUN_BASE_REF}")"

LAYER_COUNT="$(printf '%s' "$LOOP_LAYERS_JSON" | jq 'length')"
echo "層数: ${LAYER_COUNT} / 初期 base: ${OP_RUN_BASE_REF}@${OP_RUN_BASE_SHA}"

# 外側ループ (層を直列に回す)。本ループの各 iteration が「1 層 = 2-1 → 2-2 → フェーズ3 → フェーズ4」。
LAYER_IDX=0
while [ "$LAYER_IDX" -lt "$LAYER_COUNT" ]; do
  export LAYER_ISSUES_JSON="$(printf '%s' "$LOOP_LAYERS_JSON" | jq -c ".[$LAYER_IDX]")"
  echo "=== Layer ${LAYER_IDX}: ${LAYER_ISSUES_JSON} (base ${OP_RUN_BASE_SHA}) ==="
  # → 2-1 (層内実装) を実行する。完了後、層間 gate (フェーズ3) と base 前進 (フェーズ4) を経て LAYER_IDX を進める。
  LAYER_IDX=$((LAYER_IDX + 1))
done
```

> ガード節と早期 return で平坦化し、ネストは `while` 1 階層に留める (CLAUDE.md ネスト制限)。
> 層内のクラスタ並列・直列分岐は op-run 側 (2-Orchestrate) に閉じており、本ループには現れない。

### 2-1. 層内実装 (op-run フェーズ1-2-Orchestrate を適用 — pointer)

**ここが純 composition の核心**。層内 issue 集合 (= `LAYER_ISSUES_JSON`) と前進済みの `OP_RUN_BASE_SHA` を入力に、
**op-run/SKILL.md のフェーズ1 (Issue 取得・clustering) → フェーズ2-A (探知) → フェーズ2-B (Stage 2 競合検出) →
フェーズ2-Orchestrate (CO 並列・直列 spawn → barrier) の手順を、`cluster-orchestrator-directives.md` の CO 入力契約に
従ってそのまま適用する** (コピーせず pointer で参照する、Single Canonical Source Rule)。

op-loop が op-run に対して与える層固有の入力は以下だけ:

| 入力 | op-loop が与える値 | 渡し方 |
|------|------------------|--------|
| 対象 Issue 集合 | `LAYER_ISSUES_JSON` (現層の issue 番号配列) | op-run フェーズ1-1 の Issue 取得を「この番号集合」に差し替える (`op issue view <N>` を層内 issue に限定) |
| base SHA | `OP_RUN_BASE_SHA` (層 N-1 のマージ後 HEAD、フェーズ4 で前進) | `export OP_RUN_BASE_SHA` 済の状態で op-run フェーズ0-base に入る。フェーズ0-base の guard が注入値を尊重して SHA 再計算を skip する (`worktree-ops.md` 外部 base 注入節 / ADR-0019 D6) |
| base ref | `OP_RUN_BASE_REF` (base_sha が指すブランチ名と整合) | 同上 |

op-loop が **改変しないもの** (op-run / CO 側に閉じる、D5):

- clustering ロジック (`_shared/clustering.md`) / Stage 2 競合検出 / serial_chains・parallel_clusters の partition
- ClusterOrchestrator の 10 フェーズ (apply → 自己検証 → PR → post-check → review → verdict)
- worktree provision 規約 (`worktree-ops.md`) / branch prefix (`auto/`) / marker 一式

> **層内クラスタごと fresh CO = context クリアの自然な機構 (D3)**: 層内は op-run の 2-Orchestrate が
> クラスタごとに fresh CO subagent を Agent tool で spawn する。CO は return で context が自動破棄されるため、
> 工程ごと (= 層内クラスタごと) に context が肥大しない。op-loop はこの機構を **無改変で fractal 再利用** するだけ。
> 1 層 = 1 つ以上の CO subagent 群。

#### 2-1 適用時の注意 (op-run との差分は base だけ)

- op-loop は **op-run skill を `Skill(op-run)` で呼ばない**。op-run/SKILL.md の該当フェーズを controller が
  自分のフローとして実行する (framing 厳守、ADR-0019 D5 / 本 IU 「既知の落とし穴」)。
- op-run のフェーズ1-1 は既定で `auto-report` ラベル全件を取得するが、op-loop では **現層の issue 集合に限定** する
  (層をまたいで未来層の issue を拾わない)。それ以外の clustering / 探知 / CO spawn は op-run と同一。
- op-run の Stage 2 競合検出は層内でそのまま効く (architect が独立設計した同層工程は競合せず並列、
  競合があれば op-run 同様に層内直列化される)。
- **`--relay` が渡された場合の唯一の差分はここ (CO spawn 時)**: `--relay` opt-in 時は、CO を spawn する prompt に
  **relay 報告契約 (柱2)** を additive に足す (`references/relay-protocol.md` 柱2 のテンプレ)。これにより層内 CO の
  checkpoint / 判断点が `SendMessage(to:main)` で controller に届くようになる。あわせて controller は柱1 (idle 検知 + nudge) /
  柱3 (能動 poll) の relay ループを起動する。**`--relay` 無しの既定では本契約を spawn prompt に足さず、CO spawn は op-run と完全同一**
  (層完了時に `ClusterSummary` を返すのみ)。詳細・footgun・手動 fallback は `references/relay-protocol.md`、要点は「監督深度オプション: --relay」節。

### 2-2. 層完了集約 (CO verdict を集める)

層内の全 CO が `ClusterSummary` を返したら、controller が verdict を集約する。
op-run の 2-D (Post-run conflict check) と同様、CO が内部で push / PR 作成済みのため、各 CO の summary を集める。

- 全 CO が approve / pro-reviewed 相当 → 層成功。フェーズ 3 (層間 gate) へ。
- いずれかの CO が `needs_human_decision` / terminal / 失敗を返した → フェーズ 3 の失敗時挙動 (D8) へ。

集約は compact に保つ (terse relay、D10)。CO の raw finding を controller が抱えない (ADR-0016 の context 設計を継承)。

---

## フェーズ 3: 層間 2 段 gate (align→dispatch + op-merge go/no-go)

層完了後の 2 段 gate (ADR-0019 D7)。監督深度の既定は **層間 gate のみ** (薄い controller)。

### 3-1. 失敗時挙動の分岐 (D8、層成功なら skip)

層内に失敗 CO がある場合、層完了 gate で人間に DAG-aware に提示する。既定は **停止** (人間判断待ち)。

```
## Layer <i> — 一部工程が完了しませんでした

| 工程 | 状態 | 内容 |
|------|------|------|
| #807 | 成功 | PR <URL> (approved) |
| #808 | 失敗 | needs_human_decision: <reason> |

この層には後続層 (Layer <i+1> 以降) が依存しています。どうしますか?
1. **停止** — ここで op-loop を終了し、失敗工程を手当てしてから再 /op-loop で resume (既定)
2. **失敗工程の descendants のみ blocked で独立枝を続行** — #808 に依存する工程だけ blocked にし、
   依存しない独立枝 (DAG の別系統) は次層へ進める
3. **retry** — 失敗工程を同層内で再駆動する
```

> 失敗工程の descendants 算出は dep-graph の依存関係から導く (どの後続工程が失敗工程に到達するか)。
> retry は人間が選んだ場合のみ (自動 retry は監督モデルと緊張し同原因で token を焼くため既定にしない、D8)。

### 3-2. ① align→dispatch (未定点を 1 問ずつ詰める / 無ければ skip)

gate DNA =「未定のまま走らせない / でも全部前もって決めなくていい (工程に来たら詰める)」。
op-spec の align (`op-spec/SKILL.md` フェーズ 2-2〜2-3 の present → align) / op-codev の checkpoint と同血統。

次層に進む前に、次層工程の指示書に **未定点 (acceptance_criteria の曖昧 / 設計判断保留 / scope の境界)** があれば、
推奨付きで **1 問ずつ** AskUserQuestion で詰める。未定点が無ければこの段は **skip** する (過剰に gate を増やさない)。

```
## Layer <i+1> 着手前 align (未定点の確認)

次層工程 #808 の指示書に未定点があります:

Q: <未定点を 1 つ>
   推奨: <op-loop の推奨と根拠>

(未定点が無い層では本 align を skip し、② op-merge gate へ直行します)
```

> align で確定した内容は、次層 CO spawn 時に層内 issue の補足として渡す (op-run の Issue 指示書に追記される情報)。
> **op-loop は新しい設計判断を独自に起こさない**。未定点が ADR レベル (新アーキ / データモデル) なら
> 「これは ADR 化が必要です。`/op-architect` を推奨します」と伝えて gate で停止する。

### 3-3. ② op-merge go/no-go (人間が層 N の PR 群を取り込む)

op-loop は **merge しない** (D6 / 不変則7 / 自動マージ禁止)。層 N の取り込みは人間が `/op-merge` を回す:

```
## Layer <i> 完了 — op-merge gate

この層の PR 群:
- #807: PR <URL> (approved / pro-reviewed)
- (層内の全 PR を列挙)

次層 (Layer <i+1>) はこの層の成果に依存します。取り込んでから次層を駆動します。

→ あなたの操作: `/op-merge` を起動し、上記 PR 群を取り込んでください。
   取り込みが完了したら「マージ完了」と伝えてください。op-loop が origin/main の新 HEAD を検出して
   次層の base を前進させます。
```

> **層間 gate は全層に必然的に存在する** (base 前進に op-merge が必須、ADR-0019 D6)。
> これは意図的な監督コストであり、完全自動の一気通貫ではない (3 レーンモデルで op-loop が op-run と分かれる所以)。

---

## フェーズ 4: base 前進 (op-merge 完了後、次層へ)

人間の op-merge 完了申告後、`origin/main` (= `OP_RUN_BASE_REF`) の新 HEAD を検出して `OP_RUN_BASE_SHA` を前進させ、
次層の provision に渡す (ADR-0019 D6)。op-loop は merge しないため、ここは **検出のみ** (mutation なし)。

```bash
# フェーズ4: op-merge 後の origin/<base_ref> 新 HEAD を検出し、次層 base に前進させる。
#   - 前提: 人間が /op-merge で当該層の PR 群を取り込み済み (op-loop は merge しない)。
#   - export して次層の op-run フェーズ0-base (guard が注入値を尊重) へ渡す。
: "${OP_RUN_BASE_REF:?OP_RUN_BASE_REF must be set by フェーズ2-0}"

PREV_BASE_SHA="${OP_RUN_BASE_SHA:-}"
git fetch origin "${OP_RUN_BASE_REF}:refs/remotes/origin/${OP_RUN_BASE_REF}" \
  || { echo "❌ origin/${OP_RUN_BASE_REF} の fetch に失敗 — gh 認証 / リモートを確認してください"; exit 1; }
export OP_RUN_BASE_SHA="$(git rev-parse "origin/${OP_RUN_BASE_REF}")"

# 前進したか確認 (op-merge が本当に取り込まれていれば HEAD が進む)。進んでいなければ取り込み漏れの可能性を警告。
if [ "$OP_RUN_BASE_SHA" = "$PREV_BASE_SHA" ]; then
  echo "⚠ origin/${OP_RUN_BASE_REF} HEAD が前進していません (${OP_RUN_BASE_SHA})。"
  echo "  op-merge が未完了 / 取り込み漏れの可能性があります。確認してから次層へ進めてください。"
else
  echo "base 前進: ${PREV_BASE_SHA} → ${OP_RUN_BASE_SHA} (次層 Layer の base)"
fi
# この後、フェーズ2-0 の外側ループが LAYER_IDX を進めて次層 (2-1) へ戻る。
```

> **整合性の責務 (worktree-ops.md 外部 base 注入節)**: `OP_RUN_BASE_SHA` と `OP_RUN_BASE_REF` の整合は
> op-loop の責務。次層の op-run フェーズ0-base はこの注入値を尊重して SHA 再計算を skip する。
> 1 層内では全 cluster が同一 base を共有する (rebase 地獄回避の既存契約を維持)。

---

## フェーズ 5: resume / 中断耐性 (ステートレス、GitHub = 真実源)

op-loop は **専用 state marker を持たない** (ADR-0019 D9)。中断後に再 `/op-loop` で起動すると、
フェーズ 1 (discovery) が「未 close 工程 issue + depends_on DAG + `origin/main` HEAD」から残り層を毎回再計算する。

- completed 工程は op-merge が **close 済み**なので、dep-graph の探索 (`milestone:initial` の open issue) から自然に外れる。
- 残り工程だけで DAG を再構築 → 残り層を提示 → 続きから駆動する。
- 進捗の真実源は **close 状態 + DAG + main HEAD** (純 composition)。ADR-0018 の claim TTL 同期より遥かに薄い。

> resume は新規起動と同じフローを通る (専用 resume 経路を持たない)。これがステートレスの利点
> (状態の二重管理による drift が原理的に発生しない)。

---

## 監督深度オプション: --relay (工程内 relay、既定 OFF)

監督深度の既定は **層間 gate のみ** (薄い controller、terse relay、ADR-0019 D7 / D10)。
工程内 relay (層内 CO の途中経過まで細粒度に監督する = op-codev 的細粒度監督を層内に持ち込む) は
`--relay` フラグで **opt-in** する。

### 要点 (詳細は `references/relay-protocol.md` 正本)

- **機構**: 層内 CO subagent → controller (`SendMessage`) → ユーザー (`AskUserQuestion`) → controller → CO (`SendMessage`)
  の relay。**subagent は `AskUserQuestion` を剥奪される**ため、ユーザー到達は controller 経由 relay 一択。
- **hardened protocol の 3 本柱 (belt-and-suspenders、全て必須)**:
  1. **idle 検知 + nudge retry** — controller の返信で CO が再開しない **auto-resume 不発** (relay PoC 実測) に備え、
     idle を能動検知して nudge (再 `SendMessage`) で催促する。
  2. **「結果は必ず `SendMessage(to:main)`」契約** — **background teammate の return は main に自動配送されない**
     (relay PoC 実測) ため、層内 CO の spawn prompt に「checkpoint / 完了時は必ず `SendMessage(to:main)` で報告せよ」を
     第一級契約として additive に足す (CO directives は改変しない)。
  3. **mailbox stall 対策** — `SendMessage` は experimental な agent-teams 機構で **同期保証なし** + stall 実績あり
     (op-run #755-762)。controller は受動待機でなく能動 poll / nudge する。
- **cost / 既定 OFF の根拠**: 1 checkpoint = controller 約 **3 往復** (CO→controller→user→controller→CO、relay PoC 実測)。
  **層数 × 層内 CO 数 × checkpoint 回数** で controller 往復が乗算的に増え、監督面の controller 蓄積が膨らむため
  **既定 OFF・opt-in**。relay を使う場面 = 層内実装を細かく見たい / 試行錯誤したい工程。
- **`--relay` 無しの既定**: 層内 CO は op-run と完全同一に振る舞い (relay 契約を spawn prompt に足さない)、
  controller は層完了 `ClusterSummary` を terse に受けるだけ。

> **配線範囲 (ADR-0019 D5 純 composition 厳守)**: relay は層内 CO への **「追加契約」** として配線する。
> CO の入力契約 (`cluster-orchestrator-directives.md` の `ClusterOrchestratorInput`) や op-run の clustering /
> Stage 2 / CO spawn 手順は **改変しない**。relay 用の報告チャネル契約と controller 側 idle 検知ループだけを additive に足す。
> stall して回復しない場合は relay に固執せず **層間 gate の既定挙動に倒す** (手動 fallback、`references/relay-protocol.md`)。

---

## model / cost (op-run の model-selection を継承、D10)

CO / expert の model は op-run と同一 (`model-selection.md` 継承)。op-loop 固有の model gating は持たない。

- op-loop 固有コストは **層間 gate の controller 往復** と **dep-graph 構築** (op CLI、安価) のみ。
- controller は薄く保つ (層完了 summary は terse relay、CO の raw finding を抱えない)。
- 監督面の controller 蓄積は原理的に削れない (AskUserQuestion は controller でしか呼べない) が bounded
  (auto-compaction ~300k cap + ADR-0016 が大半回収済)。層数が膨大なら尾が効く (将来 ADR-0018 入れ子を
  op-loop 層で検討、実測してから — ADR-0019 Negative)。

---

## フェーズ 6: 完了サマリ

全層の駆動と取り込みが完了したら、完了サマリを表示する:

```
## op-loop 完了サマリ

### 駆動した層
| Layer | 工程 issue | base | 結果 |
|-------|-----------|------|------|
| 0 | #806, #807 | <sha> | 取り込み済 |
| 1 | #808 | <sha> | 取り込み済 |
| 2 | #809 | <sha> | 取り込み済 |

### 完遂状態
- 全工程 close 済み: <yes / 残あり>
- 最終 main HEAD: <sha>

### 残存事項
- blocked 枝 (D8 で独立枝続行を選んだ場合): <あれば列挙 / なければ「なし」>
- 未完了層 (中断した場合): 再 /op-loop で resume 可能 (ステートレス)

### 次のアクション
- 残工程があれば再 /op-loop で続きから駆動できます (close 状態 + DAG + main HEAD から残り層を再計算)
```

---

## Direct Mode 固定の制約

本スキルは **Direct Mode 固定** であり、OP-managed 経路 (op-run / op-scan 等からの自動 spawn) はない。

- ユーザーが直接 `/op-loop` で起動することのみを想定する (op-architect からの自動 handoff は持たない、D4)
- spawn prompt に `invocation_mode: op_managed` が混入していた場合は契約違反として停止する
- 層内で spawn する CO / apply-expert / review-expert には `invocation_mode: op_managed` を渡す
  (op-run と同一、CO directives 経由)。op-loop 自体は人間が起動する Direct Mode スキルである

---

## 設計判断のグレーゾーン

層間 gate で人間が「この工程をどう進めるか」を判断できない場面が出た場合:

1. **align→dispatch (フェーズ 3-2) で推奨付き選択肢を提示** し、人間に確認する (未定点を 1 問ずつ)
2. **設計が op-architect レベルの場合** (新アーキ / データモデル / 工程の depends_on 構造変更):
   「この判断は ADR / 工程再設計が必要そうです。`/op-architect` を推奨します」と伝えて gate で停止する
3. **op-loop は新しい設計判断・新パターンを独自に起こさない** — 層内実装の判断は CO / apply-expert に委ね、
   op-loop は DAG 層順の駆動と層間監督に徹する (純 composition)
