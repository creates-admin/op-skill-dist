---
name: op-codev
description: 対話型監督実装スキル。ヒアリング→作業分解→フェーズ別監督ループ (explore/implement/verify 各後に checkpoint)→柔軟 review (軽い=親確認のみ / 重い=review-expert 7-lens)。「op-codev」「段階的実装」「監督しながら実装」等のキーワードで起動。
effort: max
---

<!--
schema_version: 1
last_breaking_change: 2026-06-14
notes: v1 (2026-06-14): 初版。対話型監督実装スキル (op-codev)。
       op-plan (計画のみ) と op-run (全自動) の間のギャップを埋める。
       Direct Mode 固定、並列 fan-out なし、checkpoint は実会話ターン。
       v2 (2026-06-21): ADR-0017 W4 IU1 grooming gate 追加 (フェーズ 1.5、正本 reconcile を着手前 gate 化)。
-->

<!--
機能概要: 親 Claude が計画コンテキストを保ちながら、実装を explore/implement/verify
         フェーズ単位で段階的に監督する対話型実装スキル。
作成意図: op-plan (計画のみ) と op-run (全自動) の間のギャップを埋める。
         op-plan は Issue 起票後に op-run を起動して親のコンテキストが断絶する。
         op-run は全自動 (fire-and-forget) で途中介入手段がない。
         op-codev は親が計画コンテキストを保ちながら、各フェーズ後の checkpoint で
         確認・軌道修正できる対話型の実装監督フローを提供する。
注意点: Direct Mode 固定 (OP-managed 経路なし)。
       並列 fan-out なし (監督ループのため意図的に順次実行)。
       checkpoint は実会話ターンであり、親が本当に介入できる。
-->

# op-codev: 対話型監督実装スキル

op-codev は、親 Claude が計画コンテキストを保ちながら、実装を
**explore → implement → verify の各フェーズ単位で段階的に監督** できるスキルである。

各フェーズ後に checkpoint を置き、親が確認・軌道修正した後に次フェーズへ進む。
feature-expert を探索・実装・検証の役割別プロンプトでスポーンし、結果を親に返す。

## 3 原則

1. **Direct Mode 固定** — `_shared/invocation-mode.md` に従い、OP-managed 経路なし
2. **並列 fan-out なし** — 監督ループのため意図的に順次実行
3. **checkpoint は実会話ターン** — 親が本当に介入できる

## このスキルの位置づけ

| スキル | 特徴 | 主用途 |
|-------|------|--------|
| op-plan | 計画のみ。Issue 起票後に op-run へ引き渡す | 要件整理・Issue 品質底上げ |
| **op-codev (本スキル)** | 親が各フェーズ後に確認・軌道修正できる | **こだわりが強い / 試行錯誤したい実装** |
| op-run | 全自動。クラスタリング→並列 worktree→PR→review | バッチ実装・大量 Issue 処理 |

op-codev の責務:

- **DO**: ヒアリング、作業分解、explore/implement/verify checkpoint ループ、柔軟 review 案内
- **DON'T**: 並列 fan-out、自動マージ、enrichment 層 (issue-enrichment.md) の呼び出し、ADR 化

---

## 参照ドキュメント

- `~/.claude/skills/_shared/invocation-mode.md` — Direct Mode 判定 (本スキルは Direct Mode 固定)
- `~/.claude/skills/_shared/expert-spawn.md` — feature-expert spawn 規約、commits_added required
- `~/.claude/skills/_shared/model-selection.md` — model 選択ルール (explore/verify=Sonnet、implement=Opus)
- `~/.claude/skills/op-plan/SKILL.md` — Phase 0/Phase 1 方法論 (流用元)

---

## フェーズ -1: EnterPlanMode (作業分解を plan mode 下で提示)

司令官は起動直後に **`EnterPlanMode` tool を呼ぶ**。
以降のフェーズ 0〜2 (環境確認 / ヒアリング / 作業分解) が plan mode 下で進行し、
Edit / Write / Bash の書き込み系が権限機構レベルでブロックされる。

plan mode 状態判定は `op-plan/SKILL.md` フェーズ -1.1 と同様 (EnterPlanMode 応答で判定)。

フェーズ 2 末尾の `ExitPlanMode` でユーザーに作業分解を提示・承認させる。
「Approve and accept edits」を選択した場合、フェーズ 3 (監督実装ループ) が自動進行する。

---

## フェーズ 0: 環境確認

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md` に従って判定する。本スキルは **Direct Mode 固定**。
spawn prompt に `invocation_mode: op_managed` が混入していた場合は契約違反として停止し、
ユーザーに状況を報告する。

### 0-2. git / gh / op binary 確認

```bash
# git リポジトリ判定
git rev-parse --is-inside-work-tree 2>/dev/null \
  || { echo "not a git repo — op-codev は既存リポジトリ上で動作します"; exit 1; }

# gh 認証 (PR 作成に必要)
gh auth status 2>/dev/null \
  || { echo "gh login が必要です。認証してください"; }

# op binary 鮮度確認
if command -v op >/dev/null 2>&1; then
  op version --json 2>/dev/null | jq -r '"op binary: " + .version'
else
  echo "[op binary] 見つかりません (cargo install --path op-tools/crates/op で配置してください)"
fi
```

### 0-3. current branch 確認

```bash
# 現在のブランチ確認 (フェーズ 3 で auto/codev-* branch を作成する前に記録)
git branch --show-current
```

---

## フェーズ 1: ヒアリング

`op-plan/SKILL.md` フェーズ 1 の方法論に従い、**1〜2 ラウンドの対話** で以下を確定させる:

1. **何を**: 実装したい機能の概要 (1〜2 文)
2. **どこに**: 想定する対象ファイル / モジュール (推定でよい)
3. **規模感**: 単一ファイル / 複数ファイル / 新規モジュール
4. **動機 / 期待挙動**: なぜそれが必要か、どう振る舞えば成功か
5. **既知の制約**: 触ってはいけない領域、互換性維持の必要など

### 1-1. 仮整理の提示

ユーザーが `/op-codev <自然文要望>` で起動した場合、要望文を解析して仮整理を提示する:

```
あなたの要望を以下のように整理しました。

- 何を: <要約>
- どこに: <推定 path / モジュール>
- 規模感: <単一 / 複数 / 新規モジュール>
- 動機: <推定>

不明点:
1. <質問 1>
2. <質問 2>

この整理で進めますか? 修正があれば指示してください。
```

### 1-2. 1〜2 ラウンドの深掘り

未確定項目を 1 ラウンドあたり 2〜3 問にまとめて質問する (1 問完全 1 ターン制ではない)。
最大 2 ラウンドで確定させる。3 ラウンド以上が必要そうなら ADR 必要レベルの可能性を検討し、
`/op-architect` への切り替えを提案する。

ヒアリングで「何を / どこに (対象 path・モジュール)」が固まったら、作業分解 (フェーズ 2) に入る前に
**フェーズ 1.5 (grooming gate)** で「触る feature の正本が綺麗か」を確認する。

---

## フェーズ 1.5: grooming gate (対象 feature 正本の reconcile)

ADR-0017 決定 10 (grooming-before-work を op-codev の hard gate にする) / 決定 12 (正本 missing は lazy 構築トリガ・捏造禁止) を
op-codev の plan-mode-first フローへ具体化した段。**作業に入る前に「触る feature の正本 (`.claude/rules/<feature>.md`) を綺麗にする」**
ことを critical path に乗せ、wrong premise (気づけない前提ズレ) を発生源で潰す。

> **plan mode 制約による soft-presentation 型 (重要)**: op-codev はフェーズ -1 で `EnterPlanMode` 済であり、
> フェーズ 0〜2 は plan mode 下で write / mutate がブロックされる。read-only CLI (`op spec-patrol list-specs` 等) は
> plan mode でも実行できるが、**正本 write / `/op-spec` spawn / spec-expert spawn (= mutation) は plan mode 中に実行できない**。
> よって本 gate は **「read-only CLI で正本 state を検出 → 提示 → ユーザーに選択させる」soft-presentation 型**にする。
> 処理を強制中断する hard block にはしない (決定 10 の hard gate を op-codev の plan-mode-first フローに整合させたもの)。

> **責務分離 (重要)**: 正本の構築・育成 (write) は **`op-spec` の専任** (op-spec/SKILL.md L51-52)。op-codev は正本を write しない。
> ゆえに gate の第一推奨は **「先に `/op-spec` を回して正本を起こす / reconcile してから op-codev を再開する」**。
> 「op-codev 内で spec-expert を spawn してその場構築」は責務分離と plan mode 制約の両方に反するため、**第一級の選択肢にしない**。

> **note (本 repo への自己適用について)**: 本 repo (op-skill) には現状 op-codev / op-run の正本が `.claude/rules` に無い
> (op-patrol / op-scan / op-sweep のみ)。op-codev で op-codev 自身を触ると下記 gate は missing を返すが、**それは仕様どおり**
> (決定 12 の lazy 構築トリガ)。この gate を本 W4 実装 session 自身に適用する必要はない (gate の bootstrapping)。

### 1.5-1. 正本 state の検出 (read-only)

フェーズ 1 で確定した「対象 path / モジュール」を、`op spec-patrol list-specs` の各 entry の `paths` glob と照合して
所属 feature を引き、正本 state を `exists` / `stale` / `missing` の 3 値で判定する (op-spec/SKILL.md L177 の state 定義と同じ)。

| state | 判定 | gate の挙動 |
|-------|------|-----------|
| `missing` | 対象 path に対応する feature が `list-specs` 出力に**居ない** | 1.5-2 で提示 (選択させる) |
| `stale` / 未成熟 | 居るが `status` が `draft` / `unverified` (人間深掘り未了) / `score` の `drift_score` 等で staleness 高 | 1.5-2 で提示 (選択させる) |
| `exists` | 居て `status: cultivated` かつ fresh | gate 通過 — 何も提示せず フェーズ 2 へ |

```bash
# フェーズ 1.5-1: 対象 path → 所属 feature → 正本 state を read-only で検出する。
#   plan mode 下でも実行可 (read-only)。export して 1.5-2 の提示判断へ渡す。
# 入力: フェーズ 1 で確定した対象 path 群 (推定でよい)。複数あれば代表 path を 1〜数本選ぶ。
export RULES_DIR=".claude/rules"
export TARGET_PATHS="<フェーズ1で確定した対象 path をスペース区切りで列挙 (例: skills/op-codev/SKILL.md)>"

# 正本ディレクトリが無い repo は ADR-0017 未導入 → gate を no-op で通す (後方互換)。
if [ ! -d "$RULES_DIR" ]; then
  echo "[grooming gate] $RULES_DIR が無い (ADR-0017 正本未導入) — gate を通過し フェーズ 2 へ"
else
  # list-specs を 1 回だけ取得し、feature / status / paths(glob) を flat 化する。
  # paths glob → 文字どおりの prefix へ正規化 (末尾 /** と * 以降を剥がす) して startswith 照合する。
  SPECS_JSON="$(op spec-patrol list-specs --rules-dir "$RULES_DIR" 2>/dev/null)" \
    || { echo "[grooming gate] list-specs 失敗 — gate を通過 (read-only 検出が不可なら block しない)"; SPECS_JSON=""; }

  GATE_HITS=()  # "feature<TAB>status<TAB>matched_path" を貯める (配列は使用前に初期化)
  if [ -n "$SPECS_JSON" ]; then
    for TP in $TARGET_PATHS; do
      MATCHED="$(printf '%s' "$SPECS_JSON" | jq -r --arg t "$TP" '
        .details.specs[]
        | . as $s
        | ($s.paths[] | sub("/\\*\\*$";"") | sub("\\*.*$";"")) as $prefix
        | select($prefix != "" and ($t | startswith($prefix)))
        | $s.feature + "\t" + $s.status
      ' | sort -u | head -1)"
      if [ -z "$MATCHED" ]; then
        GATE_HITS+=("$(printf 'MISSING\tmissing\t%s' "$TP")")
      else
        GATE_HITS+=("$(printf '%s\t%s' "$MATCHED" "$TP")")
      fi
    done
  fi

  # state 判定: status draft/unverified = stale(未成熟) / cultivated = exists / 非ヒット = missing。
  printf '%s\n' "${GATE_HITS[@]}" | awk -F'\t' '
    $1=="MISSING" { printf "missing\t-\t%s\n", $3; next }
    $2=="draft" || $2=="unverified" { printf "stale\t%s\t%s\n", $1, $3; next }
    { printf "exists\t%s\t%s\n", $1, $3 }
  '
fi
```

```bash
# (補足) stale 候補の staleness 順位を確認したい場合のみ score を併用する (read-only)。
# status だけでは「cultivated だが code が先行した」stale を拾えないため、drift/churn を加味した順位で当たりを付ける。
: "${RULES_DIR:?RULES_DIR must be set — 1.5-1 冒頭で export 済のはず}"
if [ -d "$RULES_DIR" ]; then
  op spec-patrol score --rules-dir "$RULES_DIR" --run-id "codev-groom-$(date -u +%Y%m%dT%H%M%SZ)" 2>/dev/null \
    | jq -r '.details.specs[] | "  " + .feature + ": score=" + (.spec_score|tostring) + " drift=" + (.components.drift_score|tostring) + " churn=" + (.components.churn_score|tostring)' \
    || echo "  (score 取得 skip)"
fi
```

> `op spec-patrol list-specs` の出力 schema は `.details.specs[].{feature, path, status, paths[]}`、
> `op spec-patrol score` は `.details.specs[].{feature, spec_score, components}` (本 repo 実データで検証済)。
> `paths[]` は glob (`skills/op-scan/**` 等) なので、末尾 `/**` と `*` 以降を剥がした literal prefix で `startswith` 照合する。

### 1.5-2. 提示と選択 (state ごとに 2 択)

`missing` / `stale` を検出した feature について、ユーザーに提示し選択させる。**simple に保つため 2 択構成**にする。

#### missing の提示

```
## grooming gate — 対象 feature の正本が未構築 (missing)

対象 `<対象 path>` に対応する feature の正本が `.claude/rules/` にありません。
ADR-0017 では「触る feature の正本を綺麗にしてから着手」を原則とします (grooming-before-work)。

どうしますか?
1. **先に `/op-spec` で正本を起こしてから op-codev を再開する** (推奨)
   → op-codev を一旦終了し `/op-spec` の drift-driven / lazy 構築で正本を起こす → 戻って `/op-codev` を再開
2. **正本なしで続行する**
   → assumption を記録して フェーズ 2 (作業分解) へ進む (この feature は以降 gate を再提示しません)
```

#### stale の提示

```
## grooming gate — 正本が古い候補 (stale)

対象 feature `<F>` の正本より code が新しい / 正本が未成熟 (status=<draft|unverified>) の可能性があります。

どうしますか?
1. **`/op-spec` の drift-driven で reconcile してから op-codev を再開する** (推奨)
   → op-codev を一旦終了し `/op-spec` (drift-driven) で正本を最新化 → 戻って `/op-codev` を再開
2. **このまま続行する**
   → 残存リスク (正本が古い可能性) を記録して フェーズ 2 へ進む (この feature は以降 gate を再提示しません)
```

> **第一級にしない選択肢 (補足)**: 「op-codev 内で spec-expert を spawn してその場で正本を構築」は、責務分離
> (正本 write は op-spec 専任) と plan mode 制約 (mutation は plan mode 中に不可) の両方に反するため、上記 2 択には**含めない**。
> どうしても必要な場合に限り、**フェーズ 3 開始 (ExitPlanMode 後)** に最小 skeleton を起こす程度の補足に留める。
> その場合も spawn prompt には決定 12 の捏造禁止を必須にする:
> **「code から証明できる事実 = `[code]` / domain・why は捏造せず `[?] TODO: needs-human` とし、人間深掘りが埋めるまで binding にしない」**。

### 1.5-3. 続行選択時の記録と再提示抑制

- 選択 2 (続行) を選んだ feature は、その内容を `assumptions[]` (missing で正本なし続行) または残存リスク (stale で古いまま続行) として
  **フェーズ 4 の完了サマリに記録**する。
- **同一 session で「続行」を選んだ feature については、以降この gate を再提示しない** (過剰にうるさくしない)。
  続行済み feature 名を session 内で覚えておき (例: 内部メモ `groomed_or_skipped` リスト)、後続 IU が同 feature を触っても 1.5-2 を再掲しない。
- 選択 1 (`/op-spec` 先行) を選んだ場合は、op-codev を一旦終了する。`/op-spec` 完了後にユーザーが `/op-codev` を再起動すると、
  正本が `exists` (cultivated) になっていれば gate を素通りする。

---

## フェーズ 2: 作業分解

フェーズ 1.5 (grooming gate) を通過した (= 正本が綺麗、または「続行」を選択) 後、ヒアリング結果を
**N 個の Implementation Unit** に分割する。

### 2-1. Implementation Unit の定義

Implementation Unit (以下 IU) は以下を満たす最小の作業単位:

- 単一の goal を持つ (複数目的を 1 つに詰め込まない)
- 1 つの feature-expert spawn サイクル (explore → implement → verify) で完結する
- 他の IU との依存関係が明確

### 2-2. 作業分解の提示 (ExitPlanMode)

分解結果を `ExitPlanMode` で提示し、ユーザーに承認させる:

```
## 作業分解 (Implementation Unit 一覧)

| # | Unit | 対象ファイル (推定) | 依存 |
|---|------|------------------|------|
| 1 | <IU 名 1> | <path 1> | なし |
| 2 | <IU 名 2> | <path 2> | IU 1 |
| ...

実装順序: 1 → 2 → ... (依存関係順)

branch: auto/codev-<goal-slug>-YYYYMMDD-HHMMSS (フェーズ 3 開始時に作成)

承認すると監督実装ループ (フェーズ 3) を開始します。
分解に修正がある場合は指示してください。
```

---

## フェーズ 3: 監督実装ループ

各 IU について **Step A (Explore) → Step B (Implement) → Step C (Verify) → Step D (PR)** のサイクルを
**順次** 実行する。**並列 fan-out なし**。

### フェーズ 3 開始: branch 作成

```bash
# feature branch を作成 (全 IU が同一 branch に順次コミットする)
GOAL_SLUG="<ヒアリングで確定した goal を kebab-case に正規化>"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BRANCH_NAME="auto/codev-${GOAL_SLUG}-${TIMESTAMP}"
git checkout -b "${BRANCH_NAME}"
echo "branch created: ${BRANCH_NAME}"
```

### Step A: Explore spawn

```javascript
// op-codev Step A — 探索フェーズ (read-only)
Agent({
  subagent_type: "feature-expert",
  description: "op-codev explore: <IU名>",
  prompt: `
    invocation_mode: op_managed

    【探索フェーズ — コードを変更しないでください】

    ゴール: <IU の goal>
    対象範囲 (推定): <scope_files>

    以下を調査して structured code_map として返してください:
    - similar_implementations: 類似既存実装 (path:line + 役割)
    - pattern_to_follow: 模倣すべき手本パターン
    - risks: 注意すべき制約・落とし穴・触ってはいけない領域
    - suggested_approach: 推奨実装方針 (2〜4 文)

    Read-only です。コードを変更しないでください。
    You must not ask interactive questions.
    If information is missing, return assumptions[] or needs_human_decision.
  `
})
```

### [CHECKPOINT A] Explore 結果を親に提示

```
## Checkpoint A — 設計方針確認 (IU: <IU名>)

### 類似既存実装
<similar_implementations>

### 模倣すべき手本パターン
<pattern_to_follow>

### 注意点
<risks>

### 推奨実装方針
<suggested_approach>

---
この設計方針で進めますか?
- OK の場合: そのまま「はい」または「進めて」と返してください
- 変更したい場合: 修正フィードバックを記載してください

(フィードバックは Step B の実装プロンプトに反映されます)
```

親が OK またはフィードバックを返したら Step B へ進む。

### Step B: Implement spawn

```javascript
// op-codev Step B — 実装フェーズ
Agent({
  subagent_type: "feature-expert",
  description: "op-codev implement: <IU名>",
  prompt: `
    invocation_mode: op_managed

    【実装フェーズ】

    ゴール: <IU の goal>
    code_map: <Step A の code_map>
    親フィードバック: <CHECKPOINT A のフィードバック (空なら「承認 — そのまま進める」)>
    branch: <BRANCH_NAME>

    指示書に従い、既存パターンを模倣して実装してください。
    PR は作成せず、commit のみ行ってください。
    commits_added を必ず返してください。

    手本ファイルパスと再利用した既存資産をコミットメッセージに記載してください。

    You must not ask interactive questions.
    If information is missing, return assumptions[] or needs_human_decision.
  `
})
```

### [CHECKPOINT B] Implement 結果を親に提示

```
## Checkpoint B — 変更内容確認 (IU: <IU名>)

### コミット
<commits_added の SHA と要約>

### 変更ファイル
<修正ファイル一覧>

### 手本にした既存ファイル
<手本ファイルパス>

### 再利用した既存資産
<再利用した crate / wrapper / component>

---
変更内容は OK ですか?
- OK の場合: 「はい」または「進めて」と返してください → Step C (検証) へ進みます
- 調整が必要な場合: フィードバックを記載してください → Step B を再実行します
```

親が OK の場合は Step C へ進む。再実装の場合はフィードバックを注入して Step B を再実行する。

### Step C: Verify spawn

```javascript
// op-codev Step C — 検証フェーズ (read-only)
Agent({
  subagent_type: "feature-expert",
  description: "op-codev verify: <IU名>",
  prompt: `
    invocation_mode: op_managed

    【検証フェーズ — コードを変更しないでください】

    worktree path: <WT_PATH>

    以下を実行し結果を返してください:
    - lint (cargo fmt --check / clippy / eslint 等、適用可能なものを実行)
    - typecheck (cargo check / tsc 等)
    - unit test (cargo test / npm test 等、既存テストのみ)

    検証コマンドはプロジェクトのスタックに合わせて選択してください。
    不明な場合は CLAUDE.md の規約を確認してください。

    Read-only です。コードを変更しないでください。
    You must not ask interactive questions.
  `
})
```

### [CHECKPOINT C] Verify 結果を親に提示

```
## Checkpoint C — 検証結果 (IU: <IU名>)

### lint
<結果: PASS / FAIL + エラー詳細>

### typecheck
<結果: PASS / FAIL + エラー詳細>

### unit test
<結果: PASS / FAIL + テスト件数>

---
<全 PASS の場合>
検証 OK です。

次の IU へ進みますか? (残り IU がなければ Step D へ進みます)
- 「はい」: 次の IU の Step A へ進む / または Step D (PR 作成) へ進む

<失敗がある場合>
検証に失敗しました。以下を確認してください:
<失敗内容の詳細>

どうしますか?
- Step B に戻って修正する場合: 「修正して」と指示してください
- 失敗を許容して先に進む場合: 「このまま進めて」と指示してください (残存リスクを記録します)
```

全 IU の Step A〜C が完了したら Step D へ進む。

### Step D: PR 作成

全 IU の実装が branch に順次コミットされた後、PR を作成する:

```bash
# PR 作成 (feature branch → main)
gh pr create \
  --title "<goal の要約>" \
  --body "$(cat <<'EOF'
## Summary
<ヒアリングで確定した goal の要約>

## 実装 Unit 一覧
<IU 一覧と各 IU の変更概要>

## 検証結果
<全 IU の Checkpoint C 結果の集約>

## 残存リスク
<未検証パス / 許容した検証失敗 / 設計判断保留事項>

Closes #<Issue 番号 (ある場合)>
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### [Review 選択] PR 作成後

```
## PR 作成完了

PR: <URL>
branch: <BRANCH_NAME>

レビュー方法を選択してください:

1. **軽い確認** (あなたはすでに各 checkpoint で diff を確認しています)
   → 親が直接承認 → op-merge 起動案内

2. **review-expert (7-lens 自動レビュー)**
   → Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor の 7 観点でレビュー
   → 結果を親に提示 → 親が判断

どちらで進めますか?
```

#### Review 選択 1: 軽い確認

```
checkpoint で各 diff を確認済みです。

マージの準備ができたら `/op-merge` を起動してください。
```

> **方針 A (確定済み設計決定)**: Review 選択 1 は親が直接承認するだけの軽い確認であり、
> **独立 review (review-expert 7-lens) を通過したセマンティクスを持たない**。
> そのため `op-review-meta` marker / `pro-reviewed` label は **付与しない**。
> `/op-merge` を直接起動するか、`gh pr merge <PR番号> --squash` で手動マージする。
> pro-reviewed = 独立 review 通過の保証であるため、親承認のみで付けると gate 信頼性が壊れる。

#### Review 選択 2: review-expert (7-lens)

##### PR 規模 / sensitive 判定 → active lens tier 決定 (spawn 前段判定)

review-expert を spawn する前に、PR の規模と sensitive path 該当有無から
**active lens tier** (small=core 3 lens / large=7 lens) と **investigate model** を決定する。

判定ロジックの正本は `skills/op-run/references/global-review-spawn.md` の以下 2 節:

- **§4-1-b** — narrow opt-down 判定 (LOC/sensitive → `REVIEW_MODEL` / `REVIEW_LOC_COUNT` / `REVIEW_SENSITIVE_TOUCHED` を確定)
- **§4-2-a-pre2** — active lens / bundle 解決 (`REVIEW_SENSITIVE_TOUCHED` + LOC tier → `REVIEW_ACTIVE_LENS_JSON` / `REVIEW_LENS_BUNDLES_JSON` を確定)

op-codev は **§4-1-b と §4-2-a-pre2 の判定ブロックを共有する** (ロジックの複製禁止、Single Canonical Source Rule)。
判定を実施してから `REVIEW_ACTIVE_LENS_JSON` / `REVIEW_MODEL` を確定させ、下記 spawn prompt の
`active_lens_keys` / `models.investigate` に注入すること。

安全弁 (下記は op-run と同一の不変則、必ず守ること):

- **core lens (`security` / `spec` / `test-regression`) は全 tier で必須** — 省略・bundle 禁止
- **sensitive PR は tier 分岐を無効化し 7-lens フル** — `REVIEW_SENSITIVE_TOUCHED != 0` のとき `REVIEW_ACTIVE_LENS_JSON='[]'` (workflow が全 7 lens に展開)
- **lens gate は `REVIEW_SENSITIVE_TOUCHED` に key し `REVIEW_MODEL` には依存しない** (lens/model 別軸、ADR-0015 constraint 7)

##### PR-wide review_round 導出 (spawn 前必須、§4-2-pre 同型)

**review_round の導出正本は `skills/op-run/references/global-review-spawn.md` §4-2-pre (L446-520)**。
op-codev は当該ブロックと同型の算出を行う (ロジックの複製禁止、Single Canonical Source Rule — lens/model 判定の pointer 方式と同じ方針)。

算出方針 (canonical):
- trusted author の valid op-review-meta (`reviewer == review-expert` AND `global_review_expert == review-expert`) を **head SHA 問わず全件カウント**
- `PREV_ROUND` = 過去の最大 `review_round` (= PR 通算 attempt 総数)
- `REVIEW_ROUND = PREV_ROUND + 1` (新規 attempt)

> **注意**: head SHA filter を round 算出から外す理由 — fix commit が head SHA を変えるため、
> 旧設計 (reviewed_head_sha == 現 head のみ算入) だと PREV_ROUND が毎回 0 になり、
> REVIEW_ROUND が永久に 1 のまま max_review_fix_rounds の安全弁が発火しない致命バグになる。
> PR 全体の attempt 通算に統一することで round 1 → fix → round 2 → round 3 の正しい遷移が成立する。
> session 跨ぎ / 別 session で fix しても PR 全体で累算されるため =1 にリセットされない。
> 詳細は global-review-spawn.md L451-465 の rationale 節を参照。

```bash
# === PR-wide review_round の導出 (global-review-spawn.md §4-2-pre と同型) ===
# op-codev は op-run の session_id 払い出し機構を通らないが、
# review_round 導出は PR 全体の attempt 通算であるため同じロジックを適用する。
: "${PR_NUMBER:?PR_NUMBER must be set before deriving REVIEW_ROUND}"

TRUSTED_REVIEW_AUTHORS_DEFAULT="github-actions[bot] claude-bot op-bot"
TRUSTED_REVIEW_AUTHORS="${OP_TRUSTED_REVIEW_AUTHORS:-$TRUSTED_REVIEW_AUTHORS_DEFAULT}"
REPO_OWNER=$(op repo info 2>/dev/null | jq -r '.details.owner // empty' || echo "")
[ -n "$REPO_OWNER" ] && TRUSTED_REVIEW_AUTHORS="${TRUSTED_REVIEW_AUTHORS} ${REPO_OWNER}"
TRUSTED_AUTHORS_JSON=$(printf '%s\n' $TRUSTED_REVIEW_AUTHORS | jq -R . | jq -s .)

PREV_ROUND=$(
  op pr view "$PR_NUMBER" --include body-comments-commits |
  jq -r --argjson allowed "$TRUSTED_AUTHORS_JSON" '
    (.comment_details // [])
    | map(select(.author_login as $a | $allowed | index($a)))
    | map(select(.body | contains("<!-- op-review-meta -->")))
    | sort_by(.created_at)
    | .[].body
  ' |
  awk '
    /<!-- op-review-meta -->/ { in_block=1; round=""; reviewer=""; gre=""; next }
    in_block && /^[[:space:]]*$/ {
      if (round != "" && reviewer == "review-expert" && gre == "review-expert" && (last == "" || round+0 > last+0)) last=round
      in_block=0
      next
    }
    in_block && /^<!--/ {
      if (round != "" && reviewer == "review-expert" && gre == "review-expert" && (last == "" || round+0 > last+0)) last=round
      in_block=0
      next
    }
    in_block && /^review_round:/         { round=$2 }
    in_block && /^reviewer:/             { reviewer=$2 }
    in_block && /^global_review_expert:/ { gre=$2 }
    END {
      if (in_block && round != "" && reviewer == "review-expert" && gre == "review-expert" && (last == "" || round+0 > last+0)) last=round
      print (last ? last : "")
    }
  '
)

# 数値以外 (空 / 非数値) は 0 扱い (= 初回 review) にフォールバック
if ! printf '%s' "$PREV_ROUND" | grep -Eq '^[0-9]+$'; then
  PREV_ROUND=0
fi
export REVIEW_ROUND=$((PREV_ROUND + 1))
```

```javascript
// review-expert spawn (proportional lens gating 適用後、REVIEW_ROUND 確定後)
Agent({
  subagent_type: "review-expert",
  description: "op-codev review: <PR番号>",
  prompt: `
    invocation_mode: op_managed

    以下の PR を レビューしてください:
    PR: <URL>

    active_lens_keys: <REVIEW_ACTIVE_LENS_JSON>   // §4-2-a-pre2 で確定した値 ([]= 全7lens, ["security","spec","test-regression"]= small tier 等)
    // lens 削減はベストエフォート / recall floor は full 7-lens。honor 契約の正本は expert-review/SKILL.md「op-codev 単一 spawn モードでの active_lens_keys honor 契約」節を参照。
    models: { investigate: "<REVIEW_MODEL>", verify: "opus", gate: "opus" }
    review_round: ${REVIEW_ROUND}                 // §4-2-pre で算出した PR 通算 attempt 番号 (固定値にしない)

    重要: 修正・commit・push は行わないでください。
    review-expert の責務は global review のみです。
    結果を op-review-meta / op-review-finding 形式で返してください。
  `
})
```

review-expert の結果を親に提示し、親が判断する:

```
## review-expert レビュー結果

<op-review-meta の verdict>

### 検出された Finding
<op-review-finding の一覧>

---
どうしますか?
- Finding を修正する場合: 対象 IU の Step B に戻って修正してください
- このままマージする場合: 下記 「approve 時の marker/label publish 手順」を実行してから `/op-merge` を起動してください
```

##### approve / approve_with_followup 時の marker/label publish 手順

review_result が `approve` または `approve_with_followup` の場合、`/op-merge` を起動する前に
以下の手順で `op-review-meta` marker を PR にコメント投稿し、`pro-reviewed` label を付与する。

> **push 責務の不変則 (commit-only / controller-push)**: fix round で feature-expert / debug-expert 等の
> expert を spawn した場合、**expert は commit-only** (push しない) 契約である。publish-approval を呼ぶ前に、
> controller は **`commits_added` が non-empty かつ remote head ≠ local head なら必ず push** してから
> publish-approval を呼ぶこと。push 漏れのまま marker を投稿すると、reviewed_head_sha と remote head が
> 乖離して op-merge の stale gate が block する (#737 / #745 で 2 回再演した手動補完の構造 fix)。
> 確認例: `git rev-parse HEAD` (local) と `op pr view <N> --include meta` の head_sha が一致するまで push する。

op-codev は op-run controller の session_id 払い出し機構を通らないため、以下の形式で生成値を作成し、
`op review publish-approval` (Issue #756) を呼ぶ。本 primitive が marker 組立 / marker-lint 自己検証 /
コメント投稿 / `pro-reviewed` 付与を 1 コマンドで atomic に行う (途中失敗で部分状態を残さない)。
これにより `review_result == approve` 時の marker / label publish は controller が **CLI を 1 回呼ぶだけ**で完了する。

```bash
# Step 1: op_run_session_id を生成する (空だと op-merge gate 3i が block するため必須)
PR_NUMBER=<PR番号>
SHORT_SHA=$(git rev-parse --short HEAD)
SESSION_ID="opcodev-$(date -u +%Y%m%dT%H%M%SZ)-pr${PR_NUMBER}-${SHORT_SHA}"

# Step 2: review-expert 返却 marker から review_round を抽出する (global-review-spawn.md L931 と同型)
# review-expert は spawn prompt の review_round を op-review-meta に転写して返す。
# 下記で返却 marker から RV_ROUND を取り出し publish-approval に渡すことで、
# B 独立 (RV_ROUND 未設定のまま --review-round を省略するいわゆる hollow fix) を防ぐ。
# A (PR-wide 導出) の結果が B に正しく伝搬することを確認する経路である。
RV_ROUND=$(printf '%s' "<review-expert の返却 JSON>" | jq -r '.review_round')
# 念のためフォールバック: review-expert が review_round を返さない場合は REVIEW_ROUND (A の算出値) を使う
if ! printf '%s' "$RV_ROUND" | grep -Eq '^[0-9]+$'; then
  : "${REVIEW_ROUND:?REVIEW_ROUND must be set (§4-2-pre PR-wide derivation)}"
  RV_ROUND="$REVIEW_ROUND"
fi

# Step 3: review approve を atomic に publish する
#   - marker 組立 (op-review-meta header 形式) → marker-lint 自己検証 → コメント投稿 → pro-reviewed 付与 を
#     1 コマンドで実行する。marker-lint fail なら投稿せず非0 exit (fail-closed)。
#   - op-codev は --source-hint pr-comment を明示指定する (op-run の review-comment と異なる。op-review-meta は
#     両 SourceKind とも検証同一だが歴史的使い分けを尊重する)。
#   - --rationale に review-expert の rationale / finding 要約を渡す。
op review publish-approval \
  --pr "$PR_NUMBER" \
  --session "$SESSION_ID" \
  --reviewer review-expert \
  --verdict approve \
  --review-round "$RV_ROUND" \
  --source-hint pr-comment \
  --rationale "<review-expert の rationale / finding 要約をここに記載>"
```

> **gotcha**: `--reviewer review-expert` は op-review-meta の必須フィールドであり、空だと CLI が即 error にする。
> `--session` が空または `unknown` では op-merge gate 3i が block するため、必ず上記の生成値を渡す。
> marker 形式 (header 形式 + 空行で block 終端、#583 教訓) と reviewed_head_sha 解決 (省略時 PR head を 1 fetch)、
> marker-lint 自己検証 (fail なら投稿せず非0 exit) はすべて CLI 内部で担保される。
> review approve publish の手続き正本は `op-run/references/global-review-spawn.md` §4-2-b、
> 公開スキーマは `skills/_shared/markers/review-markers.md` L67-79、CLI 仕様は
> `op-tools/docs/specs/review-publish-approval.md`。

##### needs-fix 時の処理

review_result が `needs-fix` の場合は marker/label を publish せず、Step B (fix round) に戻る。
該当 IU の修正を完了してから再び review-expert を spawn する。

再 spawn 前に **必ず上記の PR-wide PREV_ROUND 導出ブロックを再実行**すること。
fix commit 後に PR コメントから改めて PREV_ROUND を取得することで `REVIEW_ROUND` が自動的に +1 される。
session を跨いで別 session で fix した場合も、PR 全体の op-review-meta を通算するため
`REVIEW_ROUND` は正しく累算される (= セッションをまたいでも 1 にリセットされない)。
`review_round > max_review_fix_rounds + 1` (= 3) になると op-merge でブロックされるため注意。

---

## フェーズ 4: 完了サマリ

全 IU の実装と PR 作成が完了したら、完了サマリを表示する:

```
## op-codev 完了サマリ

### PR 一覧
- <PR URL>

### 実装 Unit
| # | Unit | commit | 検証 |
|---|------|--------|------|
| 1 | <IU 1> | <SHA> | PASS |
| 2 | <IU 2> | <SHA> | PASS |

### ループ回数
- Step B 再実行: <N 回> (checkpoint B でフィードバックを注入した回数)

### 次のアクション
- PR レビューが完了したら `/op-merge` でマージを実行してください
- 残存リスク: <あれば列挙 / なければ「なし」>
```

---

## feature-expert フェーズ別スポーン — 参照テンプレート

### Step A: Explore (read-only 探索)

```javascript
Agent({
  subagent_type: "feature-expert",
  description: "op-codev explore: <goal>",
  prompt: `
    invocation_mode: op_managed

    【探索フェーズ — コードを変更しないでください】

    ゴール: <goal>
    対象範囲 (推定): <scope_files>

    以下を調査して structured code_map として返してください:
    - similar_implementations: 類似既存実装 (path:line + 役割)
    - pattern_to_follow: 模倣すべき手本パターン
    - risks: 注意すべき制約・落とし穴・触ってはいけない領域
    - suggested_approach: 推奨実装方針 (2〜4 文)

    Read-only です。コードを変更しないでください。
    You must not ask interactive questions.
  `
})
```

### Step B: Implement (実装 + commit)

```javascript
Agent({
  subagent_type: "feature-expert",
  description: "op-codev implement: <goal>",
  prompt: `
    invocation_mode: op_managed

    【実装フェーズ】

    ゴール: <goal>
    code_map: <code_map from Step A>
    親フィードバック: <parent_feedback (空なら「承認 — そのまま進める」)>
    branch: auto/codev-...

    指示書に従い既存パターンを模倣して実装してください。
    PR は作成せず、commit のみ行ってください。
    commits_added を必ず返してください。
    You must not ask interactive questions.
  `
})
```

### Step C: Verify (検証 read-only)

```javascript
Agent({
  subagent_type: "feature-expert",
  description: "op-codev verify: <goal>",
  prompt: `
    invocation_mode: op_managed

    【検証フェーズ — コードを変更しないでください】

    worktree path: <WT_PATH>

    以下を実行し結果を返してください:
    - 適用可能な lint (cargo fmt --check / clippy / eslint 等)
    - typecheck (cargo check / tsc 等)
    - unit test (cargo test / npm test 等、既存テストのみ)

    Read-only です。コードを変更しないでください。
    You must not ask interactive questions.
  `
})
```

---

## worktree 戦略

- フェーズ 3 開始時に `auto/codev-<goal-slug>-YYYYMMDD-HHMMSS` branch を作成する
- 全 IU の implement が同じ branch に **順次コミット** する (IU ごとに branch を切り替えない)
- フェーズ 3 完了後に Step D で PR を作成する

branch 命名規則は CLAUDE.md ### 6 (OP skill 自動生成 branch の prefix 規約 / ADR-0002) に従い、
`auto/` prefix を必ず付ける。

### feature 正本の native auto-inject (ADR-0017)

op-codev は feature-expert を **controller の作業ディレクトリ上**で spawn し実装させる
(Direct 標準は main checkout 上、background job では controller が worktree 内に居るため
結果的に worktree 上となる)。いずれの経路でも feature 正本 (`.claude/rules/<feature>.md`) は
path-scoped frontmatter (`paths:`) を持ち、feature-expert が **その `paths:` に該当するファイルを
touch する作業のとき、対応する正本が native に context へ auto-inject される**。
**native binding は main checkout / worktree いずれでも効く** (ADR-0017 W-spike 2026-06-20:
Q-A=main / Q-B=worktree 両方 PASS)。constitution (`.claude/rules/00-constitution.md`) は always-on。

- **親 (controller) は spawn prompt に正本を明示注入しない** — native binding が効くため、明示 inject は
  native が効かない環境向けの contingency としてのみ残す (二重ロードは context 肥大の原因)。
- **運用条件 = 正本が tracked (commit 済) であること** — untracked だと `git worktree add` で worktree に
  伝播せず binding が silent に効かなくなる (ADR-0017 G1-op)。main checkout では git 管理下に正本が
  存在すれば常時有効。
- 正本の所在・spawn 規約の正本は `~/.claude/skills/_shared/expert-spawn.md` のパターン2 注記を参照。

---

## Direct Mode 固定の制約

本スキルは **Direct Mode 固定** であり、OP-managed 経路 (op-run / op-scan 等からの自動 spawn) はない。

- ユーザーが直接 `/op-codev` で起動することのみを想定する
- spawn prompt に `invocation_mode: op_managed` が混入していた場合は契約違反として停止する
- feature-expert へのスポーンは `invocation_mode: op_managed` を渡すが、
  op-codev 自体は人間が起動する Direct Mode スキルである

---

## 設計判断のグレーゾーン

checkpoint で親が「この設計はどうするか」を判断できない場面が出た場合:

1. **op-codev が Step A の code_map に含める**: suggested_approach で選択肢と推奨を提示し、
   CHECKPOINT A で親に確認する
2. **設計が op-architect レベルの場合**: 「この要望は ADR 化が必要そうです。`/op-architect` を推奨します」
   と伝えてスキルを終了する
3. **trivial な選択** (変数名 / コメント文言): feature-expert が判断して完了報告に明記する

feature-expert の設計判断グレーゾーン処理 (`_shared/expert-spawn.md` の
`needs_human_decision` 規約) については、CHECKPOINT B で親に提示して解決する。
