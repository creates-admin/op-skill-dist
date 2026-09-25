---
name: op-codev
description: 対話型監督実装スキル。ヒアリング→作業分解→フェーズ別監督ループ (explore/implement/verify 各後に checkpoint)→柔軟 review (軽い=親確認のみ / 重い=review-expert 7-lens)。「op-codev」「段階的実装」「監督しながら実装」等のキーワードで起動。
effort: max
---

# op-codev: 対話型監督実装スキル

親 Claude が計画コンテキストを保ったまま、実装を IU (Implementation Unit) ごとに
explore → implement → verify の単位で feature-expert に委ね、各フェーズ後の checkpoint で確認・軌道修正する。

## 原則

1. **Direct Mode 固定** — 人間が `/op-skill:op-codev` で起動する。OP-managed 経路なし
2. **並列 fan-out なし** — IU もフェーズも順次実行
3. **checkpoint は実会話ターン** — 親が本当に介入できる
4. 司令官はコードを書かない。自動マージしない。ADR が要る規模なら `/op-skill:op-architect` を勧める

---

## フェーズ -1: EnterPlanMode (作業分解を plan mode 下で提示)

起動直後に `EnterPlanMode` を呼ぶ。フェーズ 0〜2 は plan mode 下で進む。
フェーズ 2 末尾の `ExitPlanMode` で作業分解を承認させ、承認後にフェーズ 3 へ進む。

## フェーズ 0: 環境確認

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」に従う。

### 0-2. git / gh 確認

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する。

### 0-3. current branch 確認

`git branch --show-current` を `BASE_BRANCH` (Step D の PR base) として記録する。

## フェーズ 1: ヒアリング

op-plan skill のフェーズ1 の方法論 (仮整理の提示 → 1 ラウンド 2〜3 問、最大 2 ラウンド) で確定する:
何を (概要 1〜2 文) / どこに (対象ファイル・モジュール、推定可) / 規模感 / 期待挙動 (成功の定義) /
既知の制約 (触らない領域・互換性) / UI の場合はデザインモック URL (`_shared/design-mock.md`。無ければ既存 design system に従う)。
3 ラウンド以上必要そうなら `/op-skill:op-architect` への切り替えを提案する。

## フェーズ 1.5: grooming gate (対象 feature 正本の reconcile)

着手前に、触る feature の正本 (`.claude/rules/<feature>.md`) が綺麗かを read-only で検出 → 提示 → ユーザーに選ばせる。
正本の write・spec-expert spawn は op-codev 内で行わない (正本 write は op-spec 専任)。

### 1.5-1. 正本 state の検出 (read-only)

`.claude/rules/` が無い repo、または `list-specs` が失敗した場合は gate を通過する。対象 path ごとに所属 feature を引く:

```bash
op spec-patrol list-specs --rules-dir .claude/rules | jq -r --arg t "<対象 path>" '
  .details.specs[] | select(any(.paths[]; (sub("/\\*\\*$";"") | sub("\\*.*$";"")) as $p
    | $p != "" and ($t | startswith($p)))) | "\(.feature)\t\(.status)"'
```

出力なし = `missing` / `status` が `draft`・`unverified` = `stale` / `cultivated` = `exists` (何も提示せずフェーズ 2 へ)。

### 1.5-2. 提示と選択 (2 択)

```
## grooming gate — <missing: 対象 feature の正本が未構築 | stale: 正本が古い/未成熟 (status=<draft|unverified>)>
対象: `<対象 path>` (feature: <F または なし>)

1. 先に `/op-skill:op-spec` で正本を起こす / reconcile してから `/op-skill:op-codev` を再開する (推奨)
2. このまま続行する — <正本なしの前提 | 正本が古い可能性> を記録してフェーズ 2 へ進む
```

### 1.5-3. 選択後

- 選択 1: op-codev を終了する。
- 選択 2: 前提 / 残存リスクとして完了サマリに記録する。同一 session では同じ feature に gate を再提示しない。

## フェーズ 2: 作業分解

ヒアリング結果を IU に分割する。IU = 単一の goal、1 回の explore → implement → verify で完結、他 IU との依存が明確。
`ExitPlanMode` で提示する:

```
## 作業分解 (Implementation Unit 一覧)

| # | Unit | 対象ファイル (推定) | 依存 |
|---|------|------------------|------|
| 1 | <IU 名 1> | <path 1> | なし |
| 2 | <IU 名 2> | <path 2> | IU 1 |

実装順序: 1 → 2 → ... / branch: auto/codev-<goal-slug>-YYYYMMDD-HHMMSS (フェーズ 3 開始時に作成)
承認すると監督実装ループを開始します。修正があれば指示してください。
```

---

## フェーズ 3: 監督実装ループ

IU ごとに Step A → CHECKPOINT A → 3-B-gate → Step B → B-1 → B-2 → CHECKPOINT B → Step C → C-2 → CHECKPOINT C を順次実行し、
全 IU 完了後に Step D。

開始時に branch を作る (全 IU が同じ branch に順次 commit する。`auto/` prefix 必須):

```bash
git checkout -b "auto/codev-<goal-slug>-$(date +%Y%m%d-%H%M%S)"   # = BRANCH_NAME
```

spawn prompt 共通 (各 prompt の該当プレースホルダを全文展開する):

- `<§4>` = `_shared/spawn-prompt-common.md` §4 ブロック
- `<§rules>` = `_shared/expert-spawn.md`「正本 (.claude/rules) の Read」の 1 行

`デザインモック:` 行は UI 変更でモック URL がある場合のみ残す。作業は controller の作業ディレクトリ上で行う。

### Step A: Explore spawn

```javascript
Agent({
  subagent_type: "op-skill:feature-expert",
  model: "sonnet",                 // read-only につき fable 禁止
  description: "op-codev explore: <IU名>",
  prompt: `
    invocation_mode: op_managed
    【探索フェーズ — コードを変更しないでください】
    ゴール: <IU の goal>
    対象範囲 (推定): <scope_files>
    デザインモック: <URL> — Artifact({action:"read", url}) で参照する
    <§rules>

    以下を structured code_map として返してください:
    - similar_implementations: 類似既存実装 (path:line + 役割)
    - pattern_to_follow: 模倣すべき手本パターン
    - risks: 注意すべき制約・落とし穴・触ってはいけない領域
    - suggested_approach: 推奨実装方針 (2〜4 文)。設計の選択肢があれば選択肢と推奨を併記

    <§4>
  `
})
```

### [CHECKPOINT A] 設計方針確認

code_map の 4 項目を見出し付きで提示し、「この方針で進めますか? (フィードバックは Step B に反映します)」と確認する。
設計の選択肢があればここで親に選ばせる。

### 3-B-gate: Step B の model 決定と Fable escalation gate

1. base model: `_shared/model-selection.md` §5.3 (feature-expert × task_complexity)。
2. Fable 提案は `_shared/model-selection.md`「§7.2 F4」の条件を満たす IU だけ (D 判定材料は Checkpoint A の code_map)。
   欠ければ base model で Step B へ。
3. 候補なら Checkpoint A の返答直後に会話ターンで提案する (「§7.2 F5」。既定は Opus 維持):

```
## model 提案 (IU: <IU名>)
難度シグナル: D<n>: <1 行根拠> / D<n>: <1 行根拠>
1. Opus のまま実装する (推奨・既定)
2. Fable へ昇格する — コストが上振れします (影響はこの IU の Step B のみ)
```

- 承認 scope は当該 IU の Step B (Checkpoint B の差し戻しによる再実行を含む)。他 IU に引き継がない。
- 承認済み Fable が rate limit / unavailable なら Opus へ degrade し、Checkpoint B で伝える (「§7.2 F8」)。

### Step B: Implement spawn

spawn 直前に `export IU_BASE_SHA="$(git rev-parse HEAD)"` を記録する (Step B-1 / B-2 が使う)。

```javascript
Agent({
  subagent_type: "op-skill:feature-expert",
  model: "<3-B-gate で確定: sonnet | opus | (承認済のときのみ) fable>",
  description: "op-codev implement: <IU名>",
  prompt: `
    invocation_mode: op_managed
    【必読】Read \`~/.claude/skills/_shared/apply-completion-checklist.md\` — 完了手順の正本。
    本フェーズは op-codev implement (apply) のため commits_added: [SHA, ...] (1 件以上) を完了報告に必ず含める。

    【実装フェーズ】
    ゴール: <IU の goal>
    code_map: <Step A の code_map>
    親フィードバック: <CHECKPOINT A のフィードバック (空なら「承認 — そのまま進める」)>
    branch: <BRANCH_NAME>
    デザインモック: <URL> — 扱いは ~/.claude/skills/_shared/design-mock.md「利用」。
    UI 変更では ~/.claude/skills/_shared/design-ng.md の NG を入れず、画面は ~/.claude/skills/_shared/design-system.md の登録済み部品だけで組む。
    コメントは ~/.claude/skills/_shared/project-profile.md「コメント作法」に従う (既定で書かない。理由は commit message へ)。
    <§rules>
    既存パターンを模倣して実装する。PR は作成せず commit のみ (push しない)。

    【実行順序】checklist「2-A. commit 先行経路」の順 (commit → 自己検証 → Critical/High のみ追加 commit)。
    自己検証は Skill({skill: "op-skill:op-code-review"}) を自分の変更差分に対して実行する (effort 指定なし)。
    手動 fallback は checklist「手動 fallback の発動条件」を満たす場合のみ。子 agent にレビューを委任しない。

    【完了報告】~/.claude/skills/_shared/expert-spawn.md「修正完了報告 schema」で返す。
    commits_added (SHA 文字列の配列、1 件以上) / self_review_result / self_check_blocked / code_review_invoked / code_review_result は必須。
    op-code-review の findings 配列をそのまま完了報告として返さない (code_review_result / self_review_result に要約する)。
    加えて「手本にした既存ファイル」「再利用した既存資産」を書く (空欄は silent fork 兆候として不可)。

    <§4>
  `
})
```

### Step B-1: commit verify gate (controller 実行、必須)

Step B-2 の前に commit の実在と worktree の clean を機械検証する。完了報告が canonical schema でない場合も skip せず
`COMMITS_ADDED_JSON='[]'` で実行する。

```bash
: "${IU_BASE_SHA:?}" "${COMMITS_ADDED_JSON:?Step B の commits_added (JSON 配列)}"
op apply verify-commit --worktree "$(pwd)" --base-sha "${IU_BASE_SHA}" --reported-json "${COMMITS_ADDED_JSON}"
```

判定別の retry (同じ worker への SendMessage) は `_shared/apply-completion-verify.md` §2-3 / §4 に従う。
retry に失敗したら §3 の隔離ではなく CHECKPOINT B で親に提示する。exit 99 は Step B-2 に進まず入力を確認して再実行する。

### Step B-2: 独立レビュー spawn (controller 実行、必須)

Step B が `status: completed` なら controller が自分で fresh context のレビュー agent を spawn する
(Step B の worker に委任させない)。model: 既定 Sonnet、重い IU (複数ファイル横断 / 並行処理 / 状態機械 / 破壊的変更) は Opus。

```javascript
Agent({
  subagent_type: "op-skill:debug-expert",
  description: "op-codev review: <IU名>",
  model: "sonnet",   // 重い IU は "opus"。read-only につき fable 禁止
  prompt: `
    invocation_mode: op_managed
    【独立レビューフェーズ (read-only)】
    あなたは実装者ではない。他者が書いた変更を初見でレビューする立場である。
    実装意図の説明を鵜呑みにせず、diff と実コードだけを根拠に判断すること。

    対象 diff: <IU_BASE_SHA>...HEAD
    IU ゴール: <IU の goal>
    変更ファイル: <Step B の modified_files>
    <§rules>

    1. Skill({skill: "op-skill:op-code-review", args: "diff: <IU_BASE_SHA>...HEAD effort: high"}) を実行する
    2. 返却された findings をそのまま報告する。severity を独自に格下げしない
    3. IU ゴールに対する未達 (実装漏れ / goal と挙動の食い違い) は findings とは別に goal_gap[] で報告する

    禁止: ファイル修正 / commit / push。findings をゼロ件に見せるための取り繕い。
    報告に含める: code_review_invoked (false なら理由) / findings (op-code-review の JSON 配列そのまま) /
    goal_gap: [] / review_verdict: "pass" | "needs_fix" (Critical / High が 1 件でもあれば needs_fix)

    <§4>
  `
})
```

### [CHECKPOINT B] 変更内容確認

以下を提示し、OK なら Step C、フィードバックがあれば注入して Step B を再実行する (controller は直接修正しない):

- コミット (SHA と要約) / commit verify の decision (block なら blocking_reasons と retry で解消したか)
- 変更ファイル / 手本にした既存ファイル / 再利用した既存資産
- 自己検証 (`code_review_invoked` / `code_review_result`、invoked: false なら理由)
- 独立レビュー: review_verdict と model / Critical・High の各 file:line + summary / Medium・Low の件数 / goal_gap
- `needs_human_decision` / trivial な判断 (変数名・文言) の完了報告上の記載

`review_verdict: "needs_fix"` のときは「そのまま進める」を既定にしない。修正して Step B 再実行 / 親判断で許容して Step C、
を明示的に選ばせる (許容した場合は記録する)。

### Step C: Verify spawn

```javascript
Agent({
  subagent_type: "op-skill:feature-expert",
  model: "sonnet",                 // read-only につき fable 禁止
  description: "op-codev verify: <IU名>",
  prompt: `
    invocation_mode: op_managed
    【検証フェーズ — コードを変更しないでください】
    allow_level_1: true   ← 検証コマンドの実行のみ許可。ファイル編集・commit は禁止
    作業ディレクトリ: <controller の作業ディレクトリ (branch: <BRANCH_NAME>)>
    <§rules>

    lint / typecheck / unit test (既存テストのみ) を ~/.claude/skills/_shared/project-profile.md「検証コマンド (スタック別)」
    (対象 repo の CLAUDE.md が優先) で実行し、各 PASS / FAIL と詳細を返してください。

    <§4>
  `
})
```

### Step C-2: 実機検証 spawn (runtime verify、controller 実行)

Step C の後に、op-run の runtime verify 段と同じ段を実施する (ADR-0034 決定 4)。これは Step B (implement = apply) とは別の段であり、
Level 5 を apply で実施しない規約 (`_shared/project-profile.md`「Verification Ladder」) は変えない。
起動条件・結果の扱い・skipped を受け取ったときの `op verify probe` による確認と再 spawn・pass の証跡の実在確認は、
op-run skill の `references/runtime-verify-dispatcher.md` に従う (op-codev 独自の規則は持たない)。起動条件に当たらない IU は spawn しない。

```javascript
Agent({
  subagent_type: "op-skill:verify-runner",
  model: "opus",                   // Opus が上限 (ADR-0034 決定 1)。fable 禁止
  description: "op-codev runtime verify: <IU名>",
  prompt: `
    invocation_mode: op_managed
    【実機検証フェーズ — コード・tracked ファイルを変更しないでください】
    checkout: <controller の作業ディレクトリの絶対パス (branch: <BRANCH_NAME>)>
    scenarios: <IU の goal とフェーズ 1 の期待挙動から組んだ確認項目 (画面・操作・期待結果、任意で wait_for)>
    windows_endpoint: <Windows 実行先が要る場合のみ。貸し借りは runtime-verify-dispatcher.md に従う>
    windows の理由: <Windows を借りられなかったときの WINDOWS_REQUIRES_RUNTIME。無ければ「なし」>
    windows_provision: <借りたときの WINDOWS_PROVISION_JSON。無ければ「なし」>
    対象 diff: <IU_BASE_SHA>...HEAD

    手順は preload された expert-verify skill に従い、同 skill「4. 返却スキーマ (JSON)」で返してください。

    <§4>
  `
})
```

- skipped のうち probe → 1 回だけ再 spawn の対象は `skip_reason: all_means_failed` だけ。
  `requires_runtime` / `harness_not_installed` は正当な skip として CHECKPOINT C に提示する (規則の本文は dispatcher)。
- 返却の `harness.stop_status` が `deferred` なら、この IU の verify-runner (再 spawn を含む) がすべて返ったあと、
  CHECKPOINT C の前に controller が expert-verify skill「保留した stop の引き取り」に従って stop を実行する。

### [CHECKPOINT C] 検証結果

lint / typecheck / unit test の PASS・FAIL と、Step C-2 の実機検証の結果を提示する:

- 実機検証: `result` と `summary`、シナリオごとの pass / fail と `evidence` のパス、fail のシナリオは `repro_steps`。起動条件に当たらず spawn しなかった IU は「対象外」
- `requires_runtime` (空でなければ、pass は検証した範囲だけの pass と明記) / `gaps`
- ハーネス未導入 (`skip_reason: harness_not_installed`、または dispatcher の判定で未導入として spawn しなかった) なら
  `Manual: skipped (ハーネス未導入)` と、`/op-skill:op-verify --init` でハーネスを導入できる旨
- 保留した stop を引き取った場合は、その exit code と stderr の末尾 (非 0 はプロセスや state が残ったことを示す)

全 PASS (実機検証は pass / 対象外 / 正当な skip) なら次 IU の Step A (残りが無ければ Step D) へ。
失敗 (実機検証の fail を含む) があれば「修正して」(Step B へ。実機検証の fail は `repro_steps` を親フィードバックに入れる) /
「このまま進めて」(残存リスクとして記録) を選ばせる。

### Step D: PR 作成

全 IU 完了後に push して PR を作成する (Cloud では `_shared/github-channel.md` の call-spec 経路)。

```bash
git push -u origin "<BRANCH_NAME>"
op pr create --base "<BASE_BRANCH>" --head "<BRANCH_NAME>" --title "<goal の要約>" --body-file - <<'EOF'
## Summary
<goal の要約>

## 実装 Unit 一覧
<IU 一覧と各 IU の変更概要>

## 検証結果
<全 IU の Checkpoint C 結果の集約。実機検証は IU ごとに `Manual: pass | fail | skipped (<skip_reason>)` と証跡のパス>

## 残存リスク
<未検証パス / 許容した検証失敗・review finding / 設計判断保留 / grooming gate で続行した前提>
<実機検証の requires_runtime (検証しなかった範囲と理由) と skipped>
<Fable 昇格した IU があれば「<IU名>: Fable (承認済、D<n>/D<n>)」>
<デザインモック: <URL> (UI 変更の場合)>

Fixes #<Issue 番号 (ある場合)>
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

### [Review 選択] PR 作成後

PR URL と branch を示し、レビュー方法を選ばせる:
1. 軽い確認 — 各 checkpoint で diff 確認済み。このままマージへ進む
2. review-expert (7-lens 自動レビュー) — Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor

#### Review 選択 1: 軽い確認

`/op-skill:op-merge` で監査・マージするか、人間が GitHub で手動マージする。独立 review を通っていないため `pro-reviewed` ラベルは付けない。

#### Review 選択 2: review-expert (7-lens)

`references/heavy-review-flow.md` を読んで実行する (`PR_NUMBER` / `BRANCH_NAME` を把握しておく)。
review-expert は read-only のため fable 禁止。

---

## フェーズ 4: 完了サマリ

以下を提示する:

- PR URL
- IU 表 (# / Unit / commit / 検証結果 / 実機検証) と Step B 再実行回数
- model: Step A / C / B-2 は Sonnet (重い IU の B-2 は Opus)、Step C-2 は Opus、Step B は IU ごとの model (Fable 昇格・degrade があれば明記、なければ「全 IU Opus 天井」)
- 残存リスク (grooming gate で続行した前提 / 許容した失敗 / 実機検証の requires_runtime・skipped。なければ「なし」)
- 次のアクション: `/op-skill:op-merge` または GitHub で PR をマージする (`Fixes #N` の Issue はマージで close される)。
  実機検証が `Manual: skipped (ハーネス未導入)` だった場合は `/op-skill:op-verify --init` でハーネスを導入するよう案内する
