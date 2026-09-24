---
name: op-codev
description: 対話型監督実装スキル。ヒアリング→作業分解→フェーズ別監督ループ (explore/implement/verify 各後に checkpoint)→柔軟 review (軽い=親確認のみ / 重い=review-expert 7-lens)。「op-codev」「段階的実装」「監督しながら実装」等のキーワードで起動。
effort: max
---

# op-codev: 対話型監督実装スキル

親 Claude が計画コンテキストを保ったまま、実装を IU (Implementation Unit) ごとに
**explore → implement → verify** の単位で feature-expert に委ね、各フェーズ後の checkpoint で確認・軌道修正する。

## 原則

1. **Direct Mode 固定** — 人間が `/op-codev` で起動する。OP-managed 経路なし
2. **並列 fan-out なし** — IU もフェーズも順次実行
3. **checkpoint は実会話ターン** — 親が本当に介入できる
4. 司令官はコードを書かない。自動マージしない。ADR が要る規模なら `/op-architect` を勧める

## 参照ドキュメント (`~/.claude/skills/` 配下)

- `_shared/spawn-prompt-common.md` (spawn prompt 共通ブロック) / `_shared/expert-spawn.md` (修正完了報告 schema・「正本 (.claude/rules) の Read」節)
- `_shared/apply-completion-checklist.md` (Section 2-A commit 先行) / `_shared/apply-completion-verify.md` (controller verify gate)
- `_shared/model-selection.md` (§5.3 / §7.2 Fable escalation gate) / `_shared/design-mock.md` / `_shared/github-channel.md` (Cloud の GitHub write)
- `op-code-review/SKILL.md` (Step B 自己検証 / Step B-2 独立レビュー) / `references/heavy-review-flow.md` (Review 選択 2 のみ)

---

## フェーズ -1: EnterPlanMode (作業分解を plan mode 下で提示)

起動直後に `EnterPlanMode` を呼ぶ。フェーズ 0〜2 は plan mode 下で進む。
フェーズ 2 末尾の `ExitPlanMode` で作業分解を承認させ、承認後にフェーズ 3 へ進む。

## フェーズ 0: 環境確認

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md` に従う。本スキル自体に `invocation_mode: op_managed` が渡されていたら契約違反として停止し
ユーザーに報告する (spawn する expert には `op_managed` を渡す)。

### 0-2. git / gh 確認

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する。

### 0-3. current branch 確認

`git branch --show-current` を `BASE_BRANCH` (Step D の PR base) として記録する。

## フェーズ 1: ヒアリング

op-plan skill のフェーズ1 の方法論 (仮整理の提示 → 1 ラウンド 2〜3 問、最大 2 ラウンド) で確定する:
**何を** (概要 1〜2 文) / **どこに** (対象ファイル・モジュール、推定可) / **規模感** / **期待挙動** (成功の定義) /
**既知の制約** (触らない領域・互換性) / **UI の場合はデザインモック URL** (`design-mock.md`。無ければ既存 design system に従う)。
3 ラウンド以上必要そうなら `/op-architect` への切り替えを提案する。

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

1. **先に `/op-spec` で正本を起こす / reconcile してから `/op-codev` を再開する** (推奨)
2. **このまま続行する** — <正本なしの前提 | 正本が古い可能性> を記録してフェーズ 2 へ進む
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

IU ごとに Step A → CHECKPOINT A → 3-B-gate → Step B → B-1 → B-2 → CHECKPOINT B → Step C → CHECKPOINT C を順次実行し、
全 IU 完了後に Step D。

開始時に branch を作る (全 IU が同じ branch に順次 commit する。`auto/` prefix 必須):

```bash
git checkout -b "auto/codev-<goal-slug>-$(date +%Y%m%d-%H%M%S)"   # = BRANCH_NAME
```

spawn prompt 共通: `<§4>` は `spawn-prompt-common.md` §4 ブロックを全文展開する。`デザインモック:` 行は UI 変更で
モック URL がある場合のみ残す。作業は controller の作業ディレクトリ上で行い、正本の本文は prompt に注入しない。

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
    作業対象のパスが決まったら、対応する \`.claude/rules/<feature>.md\` を **Read ツールで**開いてから着手すること (cat / grep では正本が読み込まれない)。

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

### 3-B-gate: Step B の model 決定と Fable escalation gate

worker の自動選択は Opus 天井。controller が自己判断で Fable を投入しない (`model-selection.md` §7.2)。

1. **base model**: §5.3 (feature-expert × task_complexity)。`routine` / `extension` → Sonnet、`design` / `integration` / `api-design` → Opus。
2. **Fable 提案の候補** (すべて満たす場合のみ。欠ければ base model で Step B へ): base model が Opus /
   kill switch 不在 (`OP_FABLE_DISABLE=1` なし、op-config `fable_escalation.enabled` が `false` でない) / degrade 中でない /
   難度シグナルが 2 つ以上 (Checkpoint A の code_map から判定):
   D1 = 3 module 以上 / 10 file 以上、D2 = 公開 API・後方互換・migration、D3 = 既存重複実装の統合、
   D4 = `risks` に並行性・状態機械・トランザクション整合、D5 = §7.1.3 の sensitive glob 該当、D6 = 同 IU の Step B 再実行
3. 候補なら Checkpoint A の返答直後に提案する:

```
## model 提案 (IU: <IU名>)
難度シグナル: D<n>: <1 行根拠> / D<n>: <1 行根拠>
1. **Opus のまま実装する** (推奨・既定)
2. **Fable へ昇格する** — コストが上振れします (影響はこの IU の Step B のみ)
```

- 無応答・曖昧な返答は非承認 (Opus)。ユーザーが自分から Fable を指定した場合は D 条件を問わず承認扱い。
- 承認 scope は当該 IU の Step B (差し戻し再実行を含む)、同 session 内。他 IU に引き継がない。差し戻し時も本 gate を再通過する。
- 承認した場合は PR 本文と完了サマリに「<IU名>: Fable (承認済、D<n>/D<n>)」と記録する。
- 承認済み Fable が rate limit / unavailable なら Opus へ degrade し、Checkpoint B で伝える。

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
    順序は同 Section 2-A (commit 先行)。Read できない場合も下記【完了報告の形式】が契約として有効。

    【実装フェーズ】
    ゴール: <IU の goal>
    code_map: <Step A の code_map>
    親フィードバック: <CHECKPOINT A のフィードバック (空なら「承認 — そのまま進める」)>
    branch: <BRANCH_NAME>
    デザインモック: <URL> — Artifact({action:"read", url}) で参照する。見た目の目標であり、実装は既存の
      design system / component を使う。モックと既存 component の差分で判断が要るものは needs_human_decision で返す。
    作業対象のパスが決まったら、対応する \`.claude/rules/<feature>.md\` を **Read ツールで**開いてから着手すること (cat / grep では正本が読み込まれない)。
    既存パターンを模倣して実装する。PR は作成せず commit のみ (push しない)。
    手本ファイルパスと再利用した既存資産をコミットメッセージに記載する。

    【実行順序 — commit 先行 (この順で)】
    1. 実装 (スコープ内ファイルの変更)
    2. Static 検証 pass 確認 (project-profile.md のスタック別コマンド)
    3. unit test pass 確認 (該当する Level のみ)
    4. commit ← 自己検証より先にここで打つ
    5. Skill({skill: "op-skill:op-code-review"}) を自分の変更差分に対して実行する (effort 指定不要 = 既定 high)
    6. Critical / High が出たら自己修正して **追加 commit を打ち**、自己検証を 1 回だけ再実行する
       (2 回目も残れば self_check_blocked: true)。Medium / Low は修正せず後段の review に委ねる
    7. \`git status --porcelain\` が空であることを確認する。空でなければ未完了
       (uncommitted 変更を残したままの完了報告は contract violation)
    8. 最後に下記【完了報告の形式】のテンプレを埋めて返す (op-code-review の出力形式ではない)
    controller は \`op apply verify-commit\` で commit 集合と worktree の dirty 状態を機械検証する。

    【自己検証の skip と手動 fallback】
    - feature-expert に skip 条件は無い。「repo が小さい」「呼び出し環境がない」等を理由に skip しない
      (op-code-review は plugin 同梱で、対象 repo の CLAUDE.md / op CLI 等に依存しない)。
    - 手動 fallback (op-code-review skill の Angle A〜E + 3 値 verify を同一 context で一巡) は次の両方を満たす場合のみ:
      1. Skill({skill: "op-skill:op-code-review", ...}) を **実際に呼んだ** (呼ばずに「解決できないはず」と判断しない)
      2. 返ってきた **エラー文言を verbatim で** code_review_skip_reason に入れた (要約・言い換え不可)
      エラー文言を伴わない fallback 申告は contract violation であり、code_review_invoked: true を名乗ってはならない。
    - 自己検証は best-effort。判定権は controller が別途 spawn する独立レビューにある。
      あなたが子 agent を spawn してレビューを委任することはできない。

    【完了報告の形式 — 他の出力形式で代替しない】
    最終メッセージは次のテンプレを埋めたものにする
    (canonical completion_report の複製。必須性・enum の正本は _shared/expert-spawn.md「修正完了報告 schema」節):
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
    加えて「手本にした既存ファイル」「再利用した既存資産」を必ず書く (空欄は silent fork 兆候として不可)。
    commits_added は SHA 文字列の配列 (object でラップしない)。commits_added を含まない報告は invalid。
    **op-code-review が返す findings JSON 配列を、そのまま完了報告として返してはならない。**
    findings は code_review_result / self_review_result に要約して載せる。

    <§4>
  `
})
```

### Step B-1: commit verify gate (controller 実行、必須)

Step B-2 の前に commit の実在と worktree の clean を機械検証する。完了報告が canonical schema でない
(`commits_added` が無い / findings JSON 配列だけ等) 場合も skip せず `COMMITS_ADDED_JSON='[]'` で実行する。

```bash
: "${IU_BASE_SHA:?}" "${COMMITS_ADDED_JSON:?Step B の commits_added (JSON 配列)}"
op apply verify-commit --worktree "$(pwd)" --base-sha "${IU_BASE_SHA}" --reported-json "${COMMITS_ADDED_JSON}"
```

(ローカル branch のため `--base-ref` ではなく `--base-sha`)

| 判定 | 挙動 |
|---|---|
| `decision: pass` (exit 0) | Step B-2 へ |
| `UNCOMMITTED_CHANGES` | `details.uncommitted_files` を添えて同じ worker に SendMessage し commit させ再検証。無応答 / 2 回目も dirty なら CHECKPOINT B で親に提示 |
| `COUNT_ZERO` | dirty なら上と同じ retry。clean なら `status: blocked` / `partial` + `needs_human_decision` を確認し、無ければ CHECKPOINT B で提示 |
| `FABRICATED_SHA` / `NOT_IN_COMMIT_SET` | SendMessage で実 SHA の再報告を要求。失敗なら CHECKPOINT B で提示 |
| exit 99 | fail-closed。Step B-2 に進まず入力を確認して再実行 |

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
    作業対象のパスが決まったら、対応する \`.claude/rules/<feature>.md\` を **Read ツールで**開いてから着手すること (cat / grep では正本が読み込まれない)。

    1. Skill({skill: "op-skill:op-code-review", args: "diff: <IU_BASE_SHA>...HEAD effort: high"}) を実行する
    2. 返却された findings をそのまま報告する。severity を独自に格下げしない
    3. IU ゴールに対する未達 (実装漏れ / goal と挙動の食い違い) は findings とは別に goal_gap[] で報告する

    禁止: ファイル修正 / commit / push。findings をゼロ件に見せるための取り繕い。
    報告に必ず含める: code_review_invoked (false なら理由) / findings (op-code-review の JSON 配列そのまま) /
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
    作業対象のパスが決まったら、対応する \`.claude/rules/<feature>.md\` を **Read ツールで**開いてから着手すること (cat / grep では正本が読み込まれない)。

    プロジェクトのスタックに合わせて実行し、各 PASS / FAIL と詳細を返してください (不明なら CLAUDE.md の規約を確認):
    - lint (cargo fmt --check / clippy / eslint 等) / typecheck (cargo check / tsc 等) / unit test (既存テストのみ)

    <§4>
  `
})
```

### [CHECKPOINT C] 検証結果

lint / typecheck / unit test の PASS・FAIL を提示する。全 PASS なら次 IU の Step A (残りが無ければ Step D) へ。
失敗があれば「修正して」(Step B へ) / 「このまま進めて」(残存リスクとして記録) を選ばせる。

### Step D: PR 作成

全 IU 完了後に push して PR を作成する (Cloud では `github-channel.md` の call-spec 経路)。

```bash
git push -u origin "<BRANCH_NAME>"
op pr create --base "<BASE_BRANCH>" --head "<BRANCH_NAME>" --title "<goal の要約>" --body-file - <<'EOF'
## Summary
<goal の要約>

## 実装 Unit 一覧
<IU 一覧と各 IU の変更概要>

## 検証結果
<全 IU の Checkpoint C 結果の集約>

## 残存リスク
<未検証パス / 許容した検証失敗・review finding / 設計判断保留 / grooming gate で続行した前提>
<Fable 昇格した IU があれば「<IU名>: Fable (承認済、D<n>/D<n>)」>
<デザインモック: <URL> (UI 変更の場合)>

Fixes #<Issue 番号 (ある場合)>
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

### [Review 選択] PR 作成後

PR URL と branch を示し、レビュー方法を選ばせる:
1. **軽い確認** — 各 checkpoint で diff 確認済み。このままマージへ進む
2. **review-expert (7-lens 自動レビュー)** — Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor

#### Review 選択 1: 軽い確認

`/op-skill:op-merge` で監査・マージするか、人間が GitHub で手動マージする。独立 review を通っていないため `pro-reviewed` ラベルは付けない。

#### Review 選択 2: review-expert (7-lens)

`references/heavy-review-flow.md` を読んで実行する (`PR_NUMBER` / `BRANCH_NAME` を把握しておく)。
review-expert は read-only のため fable 禁止 (model は `model-selection.md` §5.1 / §7.1)。

---

## フェーズ 4: 完了サマリ

以下を提示する:

- PR URL
- IU 表 (# / Unit / commit / 検証結果) と Step B 再実行回数
- model: Step A / C / B-2 は Sonnet (重い IU の B-2 は Opus)、Step B は IU ごとの model (Fable 昇格・degrade があれば明記、なければ「全 IU Opus 天井」)
- 残存リスク (grooming gate で続行した前提 / 許容した失敗。なければ「なし」)
- 次のアクション: `/op-skill:op-merge` または GitHub で PR をマージする (`Fixes #N` の Issue はマージで close される)

## 設計判断のグレーゾーン

- 選択肢がある設計は Step A の suggested_approach に載せ、CHECKPOINT A で親に確認する。
- ADR レベル (新アーキ / データモデル) なら `/op-architect` を推奨してスキルを終了する。
- trivial な選択 (変数名 / コメント文言) は feature-expert が判断し完了報告に明記する。`needs_human_decision` は CHECKPOINT B で提示する。
