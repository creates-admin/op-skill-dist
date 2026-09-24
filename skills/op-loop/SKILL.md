---
name: op-loop
description: op-architect が起票した depends_on 工程群を、依存順 (DAG 層順) に直列駆動して完遂まで回す Direct Mode 固定の監督ループスキル。各層は op-run と同じ ClusterOrchestrator で実装し、層間に人間 gate (align→dispatch + op-merge / GitHub での人間マージ) を挟む。「op-loop」「工程ループ」「依存順実装」「DAG 駆動」「milestone 群を回す」等のキーワードで起動。
effort: medium
---

# op-loop: depends_on 工程を DAG 層順に直列駆動する監督ループ

op-architect が起票した互いに依存する工程 issue 群を、`op-depends-on` marker から作る DAG の **層順に直列駆動** し、
各層を op-run と同じ ClusterOrchestrator (CO) で実装する。層間に人間 gate を置き、層 N の PR が
マージされたことを確認してから次層の base を前進させる。op-codev / op-run との使い分けは ADR-0019。

## 原則

1. **Direct Mode 固定** — 人間が `/op-loop` で起動する。op-architect からの自動 handoff は持たない
2. **純 composition** — op-run skill を呼ばず、op-run/SKILL.md の層内手順と `cluster-orchestrator-directives.md` をそのまま適用する。
   CO / worktree 規約 / marker を改変しない。op-loop 固有部分は DAG 層抽出 / 層ループ / 層間 gate / base 前進のみ
3. **監督 = 層間 gate** — context は層内クラスタごとの fresh CO で切れる。controller は薄く保ち、CO の raw finding を抱えない
4. **op-loop 自身は merge しない** — 層の取り込みは人間が `/op-skill:op-merge` または GitHub で行う。新しい設計判断を独自に起こさない。新 expert は追加しない

## 参照ドキュメント

| Path | 役割 |
|------|------|
| op-run skill の SKILL.md | 層内手順: フェーズ0-base / 1 (Issue 取得・clustering) / 2-A (探知) / 2-B (Stage 2 競合検出) / 2-Orchestrate (CO spawn) |
| op-run skill の `cluster-orchestrator-directives.md` | CO 入力契約 (`ClusterOrchestratorInput`) と CO のフェーズ |
| `~/.claude/skills/_shared/worktree-ops.md` | 「外部 base 注入」節 (`OP_RUN_BASE_SHA` の事前 export) |
| `~/.claude/skills/_shared/model-selection.md` | model 選択 (op-run と同一。Fable escalation gate は op-run 1-2-g を層ごとに適用、承認は層をまたいで引き継がない) |
| `references/relay-protocol.md` | `--relay` (工程内 relay) の protocol |

---

## フェーズ -1: EnterPlanMode (discovery → 層提示を plan mode 下で承認)

起動直後に `EnterPlanMode` を呼ぶ。フェーズ 0〜1 は read-only CLI のみで進む。
フェーズ 1 末尾の `ExitPlanMode` で DAG / 層構造を承認させ、承認後にフェーズ 2 へ進む。

## フェーズ 0: 環境確認

- `_shared/invocation-mode.md` に従う。本スキル自体に `invocation_mode: op_managed` が渡されていたら契約違反として停止する
  (層内で spawn する CO / expert には op-run と同じく `op_managed` を渡す)。
- `_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する。

## フェーズ 1: discovery (DAG 構築 → 層提示)

### 1-1. 探索キー

既定は `milestone:initial` label (op-architect の工程 issue)。`/op-loop --label <L>` / `--numbers N M …` の明示を優先する。

### 1-2. DAG 構築

```bash
op issue dep-graph --label "<LOOP_LABEL>"     # --numbers 明示時は --numbers N M …
```

出力 `.details`: `nodes` (対象工程) / `layers` (`layers[0]` = 依存なし、以降は前層完了が前提) / `cycles` / `missing`。
label 探索は open issue のみが対象。`.decision != "pass"` なら停止する。

### 1-3. cycle / missing の停止判定

- `cycles` が非空: 循環依存。工程 issue の `op-depends-on` を直すよう依頼して停止する。
- `missing` の各番号を `op issue view <N> --include meta` で確認する。close 済みは完了工程として無視する。
  未起票 / open だが対象外 (label 不一致) のものがあれば停止し、人間に修正を依頼する。
- 推測で層順を組まない。修正後に再 `/op-loop`。

### 1-4. 層構造の提示 (ExitPlanMode)

```
## op-loop discovery — depends_on DAG 駆動計画

探索キー: <LOOP_LABEL or --numbers>
対象工程: <nodes の件数> 件

| Layer | 工程 issue | 並列性 |
|-------|-----------|--------|
| 0 | #806, #807 | 層内並列 (ファイル競合あれば直列) |
| 1 | #808 | Layer 0 のマージ後に着手 |

実行方針:
- Layer 0 → 1 → … の順に直列駆動します。層内は op-run と同じ clustering / 探知 / CO spawn で実装します。
- 層完了ごとに gate を置きます: ① 次層の未定点の確認 (無ければ skip) ② 層の PR のマージ (`/op-skill:op-merge` または GitHub で手動)
- op-loop はマージしません。マージ済みを確認してから次層の base を前進させます。

承認するとフェーズ 2 を開始します。DAG に修正があれば指示してください。
```

---

## フェーズ 2: 層ループ

### 2-0. 層ループ

`layers` を index 0 から順に、層ごとに 2-1 → 2-2 → フェーズ 3 → フェーズ 4 を行う。初期 base は現在の `origin/<base_ref>` HEAD:

```bash
export OP_RUN_BASE_REF="${OP_RUN_BASE_REF:-main}"
git fetch origin "${OP_RUN_BASE_REF}:refs/remotes/origin/${OP_RUN_BASE_REF}"
export OP_RUN_BASE_SHA="$(git rev-parse "origin/${OP_RUN_BASE_REF}")"
```

### 2-1. 層内実装 (op-run の手順を適用)

現層の issue 集合と `OP_RUN_BASE_SHA` を入力に、op-run/SKILL.md のフェーズ 1 → 2-A → 2-B → 2-Orchestrate を
controller 自身のフローとして実行する (`Skill(op-run)` は呼ばない)。op-run との差分は以下だけ:

| 入力 | op-loop が与える値 |
|------|------------------|
| 対象 Issue 集合 | 現層の issue 番号のみ (op-run フェーズ1-1 の `auto-report` 全件取得を置き換える。未来層の issue を拾わない) |
| base SHA / ref | 前進済みの `OP_RUN_BASE_SHA` / `OP_RUN_BASE_REF` を export した状態で op-run フェーズ0-base に入る (注入値が尊重される) |

- clustering / Stage 2 競合検出 / CO のフェーズ / worktree 規約はそのまま (同層で競合があれば層内直列化される)。
- `--relay` 時のみ、CO spawn prompt に `references/relay-protocol.md` 柱2 の報告契約を追加する。

### 2-2. 層完了集約

全 CO の `ClusterSummary` を集める。
- 全 CO が approve (pro-reviewed) → フェーズ 3-2 へ。
- `needs_human_decision` / terminal / 失敗がある → フェーズ 3-1 へ。

---

## フェーズ 3: 層間 gate

### 3-1. 失敗時の分岐 (層成功なら skip)

工程ごとの状態 (成功: PR URL / 失敗: needs_human_decision の reason) を表で示し、後続層が依存していることを伝えて選ばせる:
1. **停止** — 失敗工程を手当てしてから再 `/op-loop` で resume (既定)
2. **失敗工程の descendants のみ blocked にして独立枝を続行**
3. **retry** — 失敗工程を同層内で再駆動する

descendants は dep-graph の依存関係から導く。retry は人間が選んだ場合のみ行う (自動 retry しない)。

### 3-2. ① align→dispatch (未定点を 1 問ずつ / 無ければ skip)

次層工程の指示書に未定点 (acceptance_criteria の曖昧 / 設計判断保留 / scope 境界) があれば、推奨付きで 1 問ずつ
AskUserQuestion で詰める (`op-spec/SKILL.md` フェーズ 2-2〜2-3 の present → align と同じ流儀)。無ければ skip する。

- 確定内容は次層 CO spawn 時に issue の補足として渡す。
- ADR レベル (新アーキ / データモデル / depends_on 構造の変更) なら `/op-architect` を推奨して停止する。

### 3-3. ② マージ gate (層 N の PR をマージ)

層の PR 一覧 (URL / pro-reviewed の有無) を示し、次のように依頼する:
「次層はこの層の成果に依存します。`/op-skill:op-merge` で監査・順序付け・マージするか GitHub で手動マージし、完了したら『マージ完了』と伝えてください。」

「マージ完了」を受けたら次層へ進む前に確認する:

- 層の各 PR が `op pr view <PR> --include meta` で `merged: true`
- `op issue dep-graph` を再実行し、層の工程 issue が消えている (PR の `Fixes #N` で close 済み)

未マージ / open のままの工程があれば、その旨を提示して待つ。

---

## フェーズ 4: base 前進

```bash
: "${OP_RUN_BASE_REF:?}"
PREV_BASE_SHA="${OP_RUN_BASE_SHA:-}"
git fetch origin "${OP_RUN_BASE_REF}:refs/remotes/origin/${OP_RUN_BASE_REF}"
export OP_RUN_BASE_SHA="$(git rev-parse "origin/${OP_RUN_BASE_REF}")"
[ "$OP_RUN_BASE_SHA" = "$PREV_BASE_SHA" ] && echo "⚠ origin/${OP_RUN_BASE_REF} が前進していません — マージ漏れを確認"
```

HEAD が前進していなければ次層に進まず人間に確認する。前進したら 2-0 に戻り次層を駆動する。

---

## フェーズ 5: resume (ステートレス)

専用 state marker は持たない。再 `/op-loop` はフェーズ 1 から通常どおり実行し、open の工程 issue + DAG + `origin/main` HEAD から
残り層を再計算する (close 済み工程は探索から外れ、1-3 で完了扱いになる)。

---

## 監督深度オプション: --relay (工程内 relay、既定 OFF)

既定の監督は層間 gate のみ。`--relay` を渡すと層内 CO の checkpoint を `SendMessage` 経由で controller が受け、
AskUserQuestion でユーザー判断を CO に戻す。controller 往復が層数 × CO 数 × checkpoint 数で増えるため opt-in。
手順は `references/relay-protocol.md`。

---

## フェーズ 6: 完了サマリ

層ごとの表 (Layer / 工程 issue / base SHA / 結果)、全工程 close 済みか、最終 main HEAD、
残存事項 (3-1 で blocked にした枝 / 未完了層 — 再 `/op-loop` で resume できる) を提示する。
