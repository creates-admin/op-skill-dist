---
name: op-codev
description: 対話型監督実装スキル。ヒアリング→作業分解→フェーズ別監督ループ (explore/implement/verify 各後に checkpoint)→柔軟 review (軽い=親確認のみ / 重い=review-expert 7-lens)。「op-codev」「段階的実装」「監督しながら実装」等のキーワードで起動。
effort: max
---

<!--
schema_version: 2
last_breaking_change: 2026-07-31
notes: v1 (2026-06-14): 初版。対話型監督実装スキル (op-codev)。
       op-plan (計画のみ) と op-run (全自動) の間のギャップを埋める。
       Direct Mode 固定、並列 fan-out なし、checkpoint は実会話ターン。
       v2 (2026-06-21): ADR-0017 W4 IU1 grooming gate 追加 (フェーズ 1.5、正本 reconcile を着手前 gate 化)。
       (2026-07-29, non-breaking): review_round 導出を旧 PR コメント awk 走査から `op review state pull`
       (state 文書 attempts[]) ベースへ現行化 (global-review-spawn.md §4-2-pre / ADR-0027 6b に追従)。
       フェーズ1 の op-plan 逐語再掲を pointer 化、Step D に mcp channel pointer 追加、
       spawn fallback を spawn-prompt-common.md §4 の 5 択へ整合。schema_version 据置 (contract 不変)。
       v3 (2026-07-31, additive): 実装後レビューの配線を追加。(a) Step B prompt に自己検証
       (Skill op-skill:op-code-review) を commit 前ステップとして明示注入 — 従来は agent.md →
       expert-feature/SKILL.md → apply-completion-checklist.md の 2 ホップ間接参照のみで、
       実測 (2026-07-31) では自走せず `code_review_invoked: false` + 事実誤認の skip_reason を
       返した (同一 fixture / 同一 agent に op-run 相当の verbatim 注入を行った対照実験では
       invoked: true で発火)。(b) Step B-2「独立レビュー spawn」を新設 — controller が
       fresh context の debug-expert を spawn し op-code-review を実行させる (context 独立性 +
       worker の自己申告に依存しない担保)。subagent は Agent tool を持たず子 agent を
       spawn できない実測 (2026-07-31) のため、委任主体は worker ではなく controller。
       (c) CHECKPOINT B に自己検証 / 独立レビューの結果欄を追加。schema_version 据置
       (既存 contract の削除・変更なし、追加のみ)。
       v3.1 相当 (2026-07-31, additive): model-selection.md v5 §7.2 (Fable escalation gate) 実装。
       フェーズ3 に 3-B-gate (Step B の model 決定 + Fable 昇格提案) を新設。Step A / Step C /
       Step B-2 (v3 で新設された独立レビュー) の spawn に read-only 経路の `fable` 禁止 (§7.2 F3) を固定。
       Step B のみ 3-B-gate 確定値 (人間承認済のときだけ fable)。参照 pin を (>=5) へ同期、
       完了サマリに model 節を追加。契約は additive (既存フェーズの順序・checkpoint 構造は不変) ゆえ
       schema_version 据置。
       v4 (2026-07-31): **commit 取りこぼし対策**。実測事故 (2026-07-31, IU1 Step B 再実行) で
       agent が「実装 → 自己検証 → High 検出 → 自己修正」まで完遂しながら **commit だけを落とし**、
       完了報告として op-code-review の findings JSON 配列のみを返した (commits_added フィールド
       自体が無い)。原因は 3 つとも op-codev 固有だったため以下を同時に是正する:
       (a) Step B を **commit 先行** (実装 → Static/unit → commit → 自己検証 → 修正時は追加 commit) へ変更。
       従来の Section 2 (自己検証 → commit) は、op-run が ADR-0030 CX-03 で「code-review 後に commit を
       忘れる」failure mode を理由に Section 2-A (commit 先行) へ移した、まさにその順序だった。
       op-codev だけが旧順序で取り残されており、同じ穴を踏んだ。
       (b) Step B 直後に **controller verify gate (`op apply verify-commit --base-sha`) を必須配線**。
       従来 op-codev には commit 実在を検証する gate が一つも無く、commits_added は自己申告のまま
       CHECKPOINT B へ流れていた。gate 未配線だったのは、既存 primitive が `origin/<ref>..HEAD`
       前提で op-codev のローカル branch 経路では使えなかったため (本 PR で `--base-sha` を新設して解消)。
       (c) Step B prompt に **完了報告 schema の乗っ取り禁止**を明示。Step B-2 の報告契約が
       「findings: op-code-review の JSON 配列そのまま」であり、同一 SKILL.md 内で隣接するため
       Step B 側がこれに引きずられた。
       schema_version bump (Step B の実行順序という既存 contract を変更するため)。
       v5 (2026-08-05, additive): **v4 が塞ぎきれなかった「完了報告の乗っ取り」の残り穴**。
       実測 (IU-3) で v4 適用済 (plugin 0.1.25 = 本 SKILL.md とバイト一致) にもかかわらず、
       worker が commits_added 無しの findings JSON のみを返す事故が再演した。
       原因は v4 (c) の禁止文の「位置」と「形」:
       (a) 禁止文は spawn prompt (t0) にあるが、乗っ取る側の指示は Step B 手順 5 の
       Skill(op-skill:op-code-review) 実行時に注入される (最終メッセージ直前 = t_last)。
       しかも op-code-review 側は「findings を JSON 配列のみで返す」という**排他的かつ具体的な
       スケルトン付き**である一方、こちらは canonical schema を _shared/expert-spawn.md への
       **ポインタでしか示していなかった** — context 内に対抗テンプレの実体が無い状態で
       「X をするな」だけを置いても、直前に読んだ具体形が勝つ。
       → Step B prompt に completion_report の**逐語テンプレを inline** した (正本は
       expert-spawn.md のまま。inline は prompt 用の複製である旨を明記し二重正本化を避ける)。
       (b) Step B prompt に spawn-prompt-common §1〜§4 の共通宣言 pointer と
       【必読】apply-completion-checklist の Read 指示が **無かった** (§4 の fallback のみ参照)。
       v6 で checklist に追加した乗っ取り禁止の 2 箇所 (Section 3 チェック項目 / Section 4 強警告) が、
       op-codev worker が開くよう指示されていないファイルの中にあった。op-run 側は
       cluster-orchestrator-directives.md に同 pointer があり、この非対称が op-codev だけの穴だった。
       → 共通宣言 + 必読ブロックを追加し、apply Run Mode 該当を明示。Read 失敗時の
       fallback (plugin root 探索 → inline テンプレ) も併記した。
       契約の追加のみ (既存フェーズ順序・checkpoint 構造・Step B-1 gate は不変) ゆえ
       schema_version 据置。関連: op-code-review/SKILL.md の Output contract 適用範囲節、
       agents/feature-expert.md の apply (op-codev) 行。
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
- `~/.claude/skills/_shared/model-selection.md` (>=5) — model 選択ルール (explore/verify=Sonnet、implement=Opus、
  Step B-2 独立レビュー=Sonnet 既定 / 重い IU は Opus)。
  **§7.2 Fable escalation gate**: worker の自動選択は Opus 天井。`fable` は Step B (implement) で
  3-B-gate の人間承認を得た IU のみ。**Step A (explore) / Step C (verify) / Step B-2 (独立レビュー) /
  Review 選択 2 (review-expert) は read-only につき承認があっても `fable` 禁止**
- `~/.claude/skills/_shared/spawn-prompt-common.md` (>=1) — spawn prompt 共通必須ブロック
  (§1 invocation_mode / §2 必読 checklist / §3 commits_added / §4 質問禁止 + fallback) の正本。
  Step B は §1〜§4 すべて、Step A / Step C / Step B-2 は §1・§4 を pointer 参照する
- `~/.claude/skills/_shared/apply-completion-checklist.md` (>=6) — apply 完了手順の正本。op-codev は
  **Section 2-A の commit 先行順序** を使う (v4 で Section 2 の 5 段階順序から変更。理由は下記)
- `~/.claude/skills/_shared/apply-completion-verify.md` (>=4) — controller 側 verify gate の正本。
  Step B 直後の `op apply verify-commit` 配線はこれに従う
- `~/.claude/skills/op-code-review/SKILL.md` — Step B 自己検証 / Step B-2 独立レビュー が共通で使う correctness review の正本 (手順 / angle / verify 判定 / 出力形式)
- `~/.claude/skills/op-plan/SKILL.md` — Phase 0/Phase 1 方法論 (流用元)
- `references/heavy-review-flow.md` — 「Review 選択 2: review-expert (7-lens)」を選んだ場合のみ読む詳細手順 (lens tier 判定 / review_round 導出 / spawn / publish-approval / needs-fix 処理)

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

### 1-1. 仮整理の提示・深掘り (op-plan フェーズ1-1/1-2 に準拠)

仮整理の提示 (上記 5 項目 + 不明点を「あなたの要望を以下のように整理しました…この整理で進めますか?」形式で
提示しユーザー確認) と、1 ラウンドあたり 2〜3 問にまとめた深掘り (最大 2 ラウンドで確定) の方法論は
**op-plan フェーズ1-1 / 1-2 と同じ**。テンプレとラウンド規則の詳細はそちらを参照する (複製しない)。

op-codev 固有の分岐: 3 ラウンド以上が必要そうなら ADR 必要レベルの可能性を検討し、
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

> **責務分離 (重要)**: 正本の構築・育成 (write) は **`op-spec` の専任** (op-spec/SKILL.md の「DO / DON'T (位置づけの境界)」節)。op-codev は正本を write しない。
> ゆえに gate の第一推奨は **「先に `/op-spec` を回して正本を起こす / reconcile してから op-codev を再開する」**。
> 「op-codev 内で spec-expert を spawn してその場構築」は責務分離と plan mode 制約の両方に反するため、**第一級の選択肢にしない**。

> **note (本 repo への自己適用について)**: 本 repo (op-skill) には現状 op-codev / op-run の正本が `.claude/rules` に無い
> (op-patrol / op-scan / op-sweep のみ)。op-codev で op-codev 自身を触ると下記 gate は missing を返すが、**それは仕様どおり**
> (決定 12 の lazy 構築トリガ)。この gate を本 W4 実装 session 自身に適用する必要はない (gate の bootstrapping)。

### 1.5-1. 正本 state の検出 (read-only)

フェーズ 1 で確定した「対象 path / モジュール」を、`op spec-patrol list-specs` の各 entry の `paths` glob と照合して
所属 feature を引き、正本 state を `exists` / `stale` / `missing` の 3 値で判定する (op-spec/SKILL.md の「1-2. feature 主役での構造化」節の state 定義と同じ)。

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
  subagent_type: "op-skill:feature-expert",
  model: "sonnet",                 // read-only 経路につき `fable` 禁止 (model-selection.md (>=5) §7.2 F3)
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
    情報不足時の fallback は spawn-prompt-common.md §4 の 5 択
    (assumptions[] / needs_human_decision / blocked_actions[] / verification_not_run / manual_review_bucket) に従う。
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

親が OK またはフィードバックを返したら **3-B-gate (model 判定)** を経て Step B へ進む。

### 3-B-gate: Step B の model 決定と Fable escalation gate

Step B (implement) の spawn model を確定する段。**worker の自動選択は Opus 天井**であり、
controller が難度を自己判定して Fable を投入することはない (`model-selection.md` (>=5) §7.2 F1)。

1. **base model を引く** — `model-selection.md` §5.3 (feature-expert × IU の task_complexity)。
   `routine` / `extension` → Sonnet、`design` / `integration` / `api-design` → Opus。
2. **Fable 提案の候補か判定する** (§7.2 F4 の AND。1 つでも欠ければ提案せず base model で Step B へ):
   - base model が **Opus**
   - kill switch 不在 (`OP_FABLE_DISABLE=1` なし、op-config `fable_escalation.enabled` が `false` でない)
   - degrade 中でない
   - **難度シグナル D1〜D6 が 2 つ以上** — 判定材料は Checkpoint A の code_map:
     D1 = 対象が 3 module 以上 / 10 file 以上、D2 = 公開 API・後方互換・migration (`api-design`)、
     D3 = 既存重複実装の統合 (`integration`)、D4 = `risks` に並行性・状態機械・トランザクション整合、
     D5 = §7.1.3 の sensitive glob 該当、D6 = 同 IU で Step B 再実行 2 回目以降 (Checkpoint B 差し戻し済)
3. **候補なら Checkpoint A の返答直後に 2 択で提案する** (既定は Opus 維持):

```
## model 提案 (IU: <IU名>)

この IU は難度シグナルが複数立っています:
- D<n>: <1 行根拠>
- D<n>: <1 行根拠>

実装 (Step B) の model をどうしますか?
1. **Opus のまま実装する** (推奨・既定)
2. **Fable へ昇格する** — コストが上振れします

昇格しても影響するのは **この IU の Step B (実装) だけ**です。
Step A (探索) / Step C (検証) / review-expert は read-only のため Opus 以下で固定されます。
```

- **無応答 / 曖昧な返答は非承認**として扱い、Opus で実行する (§7.2 F5)。
- ユーザーが自分から「この IU は Fable で」と言った場合は D 条件を問わず承認扱い (F4 例外)。
- 承認 scope は **当該 IU の Step B のみ** (Checkpoint B 差し戻しによる Step B 再実行を含む)、同 session 内。
  **他の IU には引き継がない** — IU ごとに判定し、候補なら都度提案する。
- 本 gate は **IU ごとに通る**。Checkpoint B から差し戻して Step B を再実行する場合も本 gate を再通過する
  (D6 が立つのはこの経路)。op-codev は元から checkpoint が会話ターンである設計のため、これは
  §7.2 F4 が禁じる「走っている自動フローを中断する追加提案」には当たらない。
- 承認したら Step D の PR body と フェーズ4 完了サマリに
  `<!-- op-model-escalated: feature-expert:fable:implement:<IU名> -->` を残す。
- 承認済み Fable が rate limit / unavailable なら Opus へ degrade し、Checkpoint B でその旨を伝える (§7.2 F8)。

### Step B: Implement spawn

**spawn 前に IU の base SHA を記録する** (Step B-1 の verify gate と Step B-2 の
レビュー対象 diff がこの値を使う。spawn 後に取ると実装コミットを含んでしまい、
どちらも成立しない)。

```bash
export IU_BASE_SHA="$(git rev-parse HEAD)"
echo "IU base SHA: ${IU_BASE_SHA}"
```

```javascript
// op-codev Step B — 実装フェーズ
Agent({
  subagent_type: "op-skill:feature-expert",
  model: "<3-B-gate で確定した値: sonnet | opus | (承認済のときのみ) fable>",
  description: "op-codev implement: <IU名>",
  prompt: `
    invocation_mode: op_managed

    【共通宣言層】
    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):
    ~/.claude/skills/_shared/spawn-prompt-common.md (>=1) §1〜§4 を参照。
    【必読】Read ~/.claude/skills/_shared/apply-completion-checklist.md (>=6) — 完了手順の正本。
    **本フェーズは op-codev の apply Run Mode である** (同 §1 の mode 表で「apply Run Mode
    (op-run / op-codev 経由 または Direct apply)」に該当する)。よって commits_added: [SHA, ...]
    (1 件以上) を完了報告に必ず含める (§3)。順序は同 **Section 2-A (commit 先行)** を使う。
    上記 2 ファイルが Read できない場合 (plugin 配布ではパスが異なることがある) は、
    **skip せず** plugin root 配下の skills/_shared/ を探して読むこと。
    それでも解決しないときは、本 prompt 内に逐語で埋め込んだ下記【完了報告の形式】が
    完了報告の契約として有効であり、これに従って報告する。

    【実装フェーズ】

    ゴール: <IU の goal>
    code_map: <Step A の code_map>
    親フィードバック: <CHECKPOINT A のフィードバック (空なら「承認 — そのまま進める」)>
    branch: <BRANCH_NAME>

    指示書に従い、既存パターンを模倣して実装してください。
    PR は作成せず、commit のみ行ってください。
    commits_added を必ず返してください。

    手本ファイルパスと再利用した既存資産をコミットメッセージに記載してください。

    【実行順序 — commit 先行 (必ずこの順で)】

    順序の正本は _shared/apply-completion-checklist.md Section 2-A (commit 先行)。
    自己検証より先に commit を打つこと。理由: 自己検証を先にすると、検証結果に
    意識が向いた時点で commit を落とす事故が実測で発生している (2026-07-31)。

    1. 実装完了 (スコープ内ファイルの変更)
    2. Static 検証 pass 確認 (project-profile.md のスタック別コマンド)
    3. unit test pass 確認 (該当する Level のみ)
    4. commit                          ← ここが先。この時点で必ず打つ
    5. Skill({skill: "op-skill:op-code-review"}) を変更差分に対して実行する
       (scope: 自分が変更した diff のみ。effort は指定不要 — skill 既定 = high)
    6. Critical / High が検出された場合: 自己修正して **追加 commit を打つ**。
       そのうえで自己検証を 1 回だけ再実行する
       (2 回目も Critical/High が残るなら self_check_blocked: true を付けて報告)
       Medium / Low は自己修正せず、後段の review 工程に委ねる
    7. 完了報告に code_review_invoked / code_review_result を必ず含める
    8. **最後に**、下記【完了報告の形式】のテンプレを開き、そのフィールドを埋める形で
       完了報告を組み立てて返す。手順 5 で読んだ op-code-review の出力形式ではなく、
       このテンプレが最終メッセージの形である (直前に読んだ形式に引きずられない)

    【commit 取りこぼしの禁止 (contract violation)】

    - 自己修正したのに **追加 commit を打たない** ことは contract violation である
    - **worktree に uncommitted 変更を残したまま完了報告することは contract violation** である。
      未 commit の変更は後続工程に渡らず失われる
    - 完了報告を返す直前に `git status --porcelain` が空であることを必ず確認すること。
      空でなければ、まだ完了していない
    - controller は `op apply verify-commit` で実際の commit 集合と worktree の
      dirty 状態を機械的に検証する。自己申告は検証される

    【完了報告の形式 (重要 — 他の出力形式で代替しないこと)】

    完了報告は canonical completion_report (正本: _shared/expert-spawn.md
    「修正完了報告 schema」節) の形式で返すこと。**以下はその逐語テンプレであり、
    schema の正本ではない** (必須性・enum の判定は必ず正本側を読む)。
    あなたの最終メッセージは、この形を埋めたものでなければならない:

    {
      "status": "completed | blocked | partial",
      "modified_files": ["<path>", ...],
      "commits_added": ["<SHA1>", "<SHA2>"],
      "verification_executed": ["<実行した検証ステップ>", ...],
      "verification_results": {
        "level1_lint_type": "pass | fail | skip",
        "level2_unit_test": "pass | fail | skip",
        "level3_build": "pass | fail | skip"
      },
      "code_review_invoked": true,
      "code_review_result": "pass | warning | skip",
      "code_review_skip_reason": null,
      "self_review_result": "pass | needs_fix | skip",
      "self_check_blocked": false,
      "assumptions": [],
      "needs_human_decision": { "required": false }
    }

    加えて op-codev 固有の必須節 (CHECKPOINT B が使う): 手本にした既存ファイル /
    再利用した既存資産。この 2 つが空欄の完了報告は silent fork 兆候として不可。

    commits_added は **SHA 文字列そのものの配列** (string[])。
    [{"sha": "...", "files": [...]}] のように object でラップしない。

    **op-code-review が返す findings JSON 配列を、そのまま完了報告として返してはならない。**
    自己検証 skill の Output contract (「findings を JSON 配列のみで返す」) が規定するのは
    **その skill の返却値の形**であって、あなたの最終報告の形ではない。
    findings は完了報告の一部 (code_review_result / self_review_result 等) に要約して
    載せるものであり、完了報告そのものではない。
    commits_added フィールドを含まない報告は invalid である。
    報告を書き始める前に、上のテンプレのフィールドを埋める形で組み立てること
    (直前に読んだ出力形式に引きずられない)。

    重要 — この skill は plugin 同梱で portable であり、対象 repo の CLAUDE.md /
    op-tools / registry / op CLI に一切依存しない。「repo が小さい」「skill の
    呼び出し環境がない」等を理由に skip してはならない。
    skip が正当なのは _shared/apply-completion-checklist.md 「expert 固有 skip 条件」節
    および expert-feature/SKILL.md「実装完了後の code-review invoke」節に
    列挙された条件に該当する場合のみで、その場合は code_review_result: "skip" と
    code_review_skip_reason を報告する (feature-expert は skip 条件なし = 必ず invoke する)。
    skill 解決自体に失敗した場合のみ、skills/op-code-review/SKILL.md の
    Angle A〜E + 3 値 verify を同一 context で手動一巡し、その旨を報告する。

    なお本自己検証は Step B-2 の独立レビューを代替しない (両者は別レイヤー)。
    自分が Agent tool で子 agent を spawn することはできない (harness 制約) —
    レビューの委任は controller が Step B-2 で行う。

    You must not ask interactive questions.
    情報不足時の fallback は spawn-prompt-common.md §4 の 5 択
    (assumptions[] / needs_human_decision / blocked_actions[] / verification_not_run / manual_review_bucket) に従う。
  `
})
```

### Step B-1: commit verify gate (controller 実行、必須)

Step B が返ったら、**Step B-2 に進む前に** controller が commit の実在と worktree の
clean 状態を機械的に検証する。worker の `commits_added` 自己申告をそのまま信じてはならない。

> **なぜ必須か**: 2026-07-31 の実測事故では、agent が実装 → 自己検証 → 自己修正まで
> 完遂しながら commit だけを落とし、完了報告として findings JSON のみを返した。
> このとき op-codev には commit 実在を検証する gate が一つも無く、
> CHECKPOINT B まで気付けなかった。gate はその再演を構造的に塞ぐ。

`IU_BASE_SHA` は **Step B spawn の直前**に controller が記録した SHA を使う
(Step B-2 の「Step B 開始時点の SHA」と同一値。ここで確定させて以降で使い回す)。

```bash
# Step B spawn の直前に記録しておく
# export IU_BASE_SHA="$(git rev-parse HEAD)"

: "${IU_BASE_SHA:?IU_BASE_SHA must be recorded before Step B spawn}"
: "${COMMITS_ADDED_JSON:?Step B の completion_report.commits_added を JSON 配列で渡す}"

op apply verify-commit \
  --worktree "$(pwd)" \
  --base-sha "${IU_BASE_SHA}" \
  --reported-json "${COMMITS_ADDED_JSON}"
VERIFY_EXIT=$?
```

> `--base-sha` を使う (`--base-ref` ではない)。op-codev は main checkout 上の
> ローカル branch で作業するため `origin/<ref>..HEAD` が成立しない。

判定別の分岐:

| 判定 | 挙動 |
|---|---|
| `decision: pass` (exit 0) | Step B-2 へ進む |
| `UNCOMMITTED_CHANGES` | **取りこぼし**。`details.uncommitted_files` を添えて Step B の worker に SendMessage し、残りを commit させる。再検証して pass なら続行。応答がない / 2 回目も dirty なら CHECKPOINT B で親に提示して判断を仰ぐ |
| `COUNT_ZERO` | commit が 1 件も無い。worktree が dirty なら上と同じ retry。clean なら真に no-op の可能性があるため、`status: blocked` / `partial` + `needs_human_decision` の有無を確認し、無ければ CHECKPOINT B で親に提示 |
| `FABRICATED_SHA` / `NOT_IN_COMMIT_SET` | 報告 SHA が捏造 / 範囲外。SendMessage で実 SHA の再報告を要求。失敗なら CHECKPOINT B で親に提示 |
| exit 99 (内部エラー) | 判定不能。fail-closed で Step B-2 に進まず、入力 (`IU_BASE_SHA` / `COMMITS_ADDED_JSON`) を確認して再実行 |

**完了報告が canonical schema でない場合** (例: `commits_added` フィールド自体が無い /
findings JSON 配列だけが返る) は、`COMMITS_ADDED_JSON` を `[]` として本 gate を実行する。
worktree に変更が残っていれば `UNCOMMITTED_CHANGES` で、残っていなければ `COUNT_ZERO` で
確実に block される。**schema 違反を理由に gate を skip してはならない** — 実測事故は
まさにこの形 (schema 違反 + commit 落ち) だったため、ここが最後の防波堤になる。

### Step B-2: 独立レビュー spawn (controller 実行、必須)

Step B が `status: completed` で返ったら、**controller が自分で** レビュー agent を
fresh context で spawn する。Step B の worker にレビューを委任させてはならない
(subagent は Agent tool を持たないため子 agent を spawn できない = harness 制約)。

本ステップの目的は **context 独立性の確保**である。実装した本人の自己検証
(Step B prompt の「自己検証」節) は思い込みを共有するため、それだけでは代替にならない。
また controller が自ら spawn することで、worker 側の申告に依存せずレビュー実行を担保する
(worker の `code_review_invoked` 自己申告は controller 側で検証できない)。

model は IU の重さで選ぶ (`_shared/model-selection.md` の task_complexity 基準に準じる):
**Sonnet = 既定** (単一ファイル / 既存パターン模倣 / 定型追加)、
**Opus = 重い IU** (複数ファイル横断 / 並行処理 / 状態機械 / 破壊的変更を含む)。

```javascript
// op-codev Step B-2 — 独立レビューフェーズ (controller が spawn)
Agent({
  subagent_type: "op-skill:debug-expert",
  description: "op-codev review: <IU名>",
  model: "sonnet",   // 重い IU は "opus"。read-only レビューにつき `fable` 禁止 (model-selection.md (>=5) §7.2 F3)
  prompt: `
    invocation_mode: op_managed

    【独立レビューフェーズ (read-only)】

    あなたは実装者ではない。他者が書いた変更を初見でレビューする立場である。
    実装意図の説明を鵜呑みにせず、diff と実コードだけを根拠に判断すること。

    対象 diff: <IU_BASE_SHA>...HEAD   (Step B spawn 直前に記録した値)
    IU ゴール: <IU の goal>
    変更ファイル: <Step B の files_modified>

    1. Skill({skill: "op-skill:op-code-review", args: "diff: <IU_BASE_SHA>...HEAD effort: high"})
       を実行する (手順・angle・verify 判定・出力形式の正本は skills/op-code-review/SKILL.md)
    2. 返却された findings をそのまま報告する。severity を独自に格下げしないこと
    3. IU ゴールに対する未達 (実装漏れ / goal と挙動の食い違い) があれば
       findings とは別に goal_gap[] として報告する

    禁止事項:
    - ファイル修正 / commit / push は一切行わない (read-only)
    - findings をゼロ件に見せるための取り繕いをしない
    - 質問で停止しない

    報告に必ず含めること:
    - code_review_invoked: true | false (false なら理由)
    - findings: op-code-review の JSON 配列そのまま
    - goal_gap: []
    - review_verdict: "pass" | "needs_fix"  (Critical / High が 1 件でもあれば needs_fix)
  `
})
```

Critical / High が出た場合 (`review_verdict: "needs_fix"`) は CHECKPOINT B で
親に提示し、承認を得てから Step B を再実行して修正させる (controller が直接修正しない)。
Medium / Low は CHECKPOINT B に列挙するのみで、対応要否は親が決める。

### [CHECKPOINT B] Implement 結果を親に提示

```
## Checkpoint B — 変更内容確認 (IU: <IU名>)

### コミット
<commits_added の SHA と要約>

### commit verify (Step B-1、機械検証)
<op apply verify-commit の decision。block だった場合は blocking_reasons と、
 retry で解消したか未解消かを明示する。未解消のまま進めてよいかは親の判断>

### 変更ファイル
<修正ファイル一覧>

### 手本にした既存ファイル
<手本ファイルパス>

### 再利用した既存資産
<再利用した crate / wrapper / component>

### 自己検証 (実装者、Step B)
<code_review_invoked / code_review_result。invoked: false の場合はその旨と理由を明示>

### 独立レビュー (別 agent、Step B-2)
<review_verdict と model>
<Critical / High: 件数と各 finding の file:line + summary (0 件なら「なし」)>
<Medium / Low: 件数のみ (詳細は求められたら提示)>
<goal_gap: あれば列挙>

---
変更内容は OK ですか?
- OK の場合: 「はい」または「進めて」と返してください → Step C (検証) へ進みます
- 調整が必要な場合: フィードバックを記載してください → Step B を再実行します
```

親が OK の場合は Step C へ進む。再実装の場合はフィードバックを注入して Step B を再実行する。

> **`review_verdict: "needs_fix"` の場合**: controller は「そのまま進める」を既定の選択肢として
> 提示しない。Critical / High の内容を提示した上で、修正して Step B 再実行 / 親判断で
> 許容して Step C へ進む、を明示的に選ばせる。親が許容を選んだ場合はその判断を記録して進む。

### Step C: Verify spawn

```javascript
// op-codev Step C — 検証フェーズ (read-only)
Agent({
  subagent_type: "op-skill:feature-expert",
  model: "sonnet",                 // read-only 経路につき `fable` 禁止 (model-selection.md (>=5) §7.2 F3)
  description: "op-codev verify: <IU名>",
  prompt: `
    invocation_mode: op_managed

    【検証フェーズ — コードを変更しないでください】
    allow_level_1: true   ← 検証コマンド (lint / typecheck / unit test) の実行を許可する
                             (scan mode の Level 0 固定契約の例外。ファイル編集は依然禁止)

    worktree path: <WT_PATH>

    以下を実行し結果を返してください:
    - lint (cargo fmt --check / clippy / eslint 等、適用可能なものを実行)
    - typecheck (cargo check / tsc 等)
    - unit test (cargo test / npm test 等、既存テストのみ)

    検証コマンドはプロジェクトのスタックに合わせて選択してください。
    不明な場合は CLAUDE.md の規約を確認してください。

    Read-only (no-write) です。ファイルを変更・commit しないでください。
    上記 allow_level_1 により検証コマンドの **実行のみ** 許可されています。
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

> **GitHub write channel (Cloud)**: 本節以降の GitHub 書き込み (PR 作成 / 後述 publish-approval /
> `op pr comment`) は、Cloud 環境では `~/.claude/skills/_shared/github-channel.md` (`OP_GITHUB_CHANNEL=mcp`) の
> call-spec protocol に従う (gh subprocess の代わりに call-spec を emit → 司令官が MCP tool を verbatim 実行)。
> 既定 (`gh`) 環境では下記のまま gh / op が直接 fetch する。

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

**選択 2 を選んだ場合のみ** `references/heavy-review-flow.md` を読んで実行する。
review-expert は read-only 監査のため **`fable` 禁止** — model は `model-selection.md` §5.1 / §7.1
(Opus default、narrow opt-down 該当時のみ Sonnet) に従う (§7.2 F3)。
lens tier 判定 → review_round 導出 → review-expert spawn → 結果提示 → approve 時の
marker/label publish → needs-fix 時の再ループまでの詳細手順がそこにある
(選択 1 の場合はこのファイルを読む必要はない)。

読む前に、フェーズ3 Step D で確定した `PR_NUMBER` (`gh pr create` で得た PR 番号) と
`BRANCH_NAME` を把握しておくこと (references 側冒頭で前提として明記、ファイル内
`${PR_NUMBER:?...}` ガードが未設定を検知する)。

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

### model
- Step A / C / B-2 (read-only): Sonnet 固定 (重い IU の B-2 は Opus)
- Step B: <IU ごとに sonnet / opus、Fable 昇格があれば「<IU名>: Fable (承認済、D1/D4)」と明示。
  昇格なしなら「全 IU Opus 天井 (Fable 昇格なし)」>
- degrade があればその旨 (例: `<IU名>: Fable 承認済だが unavailable のため Opus で実行`)

### 次のアクション
- PR レビューが完了したら `/op-merge` でマージを実行してください
- 残存リスク: <あれば列挙 / なければ「なし」>
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
ユーザーが直接 `/op-codev` で起動することのみを想定する。判定・契約違反時の停止は フェーズ 0-1 (0-1. Invocation Mode 判定) を参照。

補足: feature-expert へのスポーンは `invocation_mode: op_managed` を渡すが、
op-codev 自体は人間が起動する Direct Mode スキルである (spawn される側と spawn する本体で invocation mode が異なる)。

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
