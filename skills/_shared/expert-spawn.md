<!--
schema_version: 16
last_breaking_change: 2026-05-21
additive_only_policy:
  - 新フィールド追加は optional スタートを default とする (additive 変更、schema_version bump 不要)
  - breaking change (既存フィールドの削除 / 型変更 / required 化 / marker 仕様変更) のみ schema_version を bump する
  - 現行 schema_version 一覧は `~/.claude/skills/_shared/version-check.md` の
    「## _shared ファイル 現行 schema_version 一覧」節を参照する
notes: v16 (2026-07-21, additive) — plugin 配布移行: 「Plugin scoped-name 規約」節を追加し、
       Agent tool の subagent_type に plugin scoped 名 (op-skill:<name>) を渡す契約を明文化。
       spawn の3パターン template と post-check 節の例を scoped 表記へ更新。
       bare canonical 名は resolution/registry/marker の正本として保持し、前置は spawn 境界のみ。
       prose 追加 + 例更新のみ・marker schema 不変ゆえ schema_version 据置。
       v16 (2026-06-21, additive) — ADR-0017 W4: パターン2 (apply 用) に正本 native auto-inject 契約を追記
       (controller は spawn prompt に正本を明示注入しない)。prose 追加のみ・marker schema 不変ゆえ schema_version 据置。
       v16 (2026-05-23, additive) — §369 「op CLI helper 活用推奨例」節に
       `op core debt-key` / `op core extract-pr-markers` / `op core fingerprint` 説明を拡充。Fixes #453。
       v16 (2026-05-21) — `/simplify` → `/code-review` rename 反映: `simplify_*` → `code_review_*`。
       `code_review_effort` optional 追加。v14/v15 完了報告は 1 release backward-compat。Fixes #367。
       v15 (2026-05-20) — Marker Publish Validate 節追加 (全 expert 共通 2 段 validate 契約)。Fixes #312。
       v14 (2026-05-18) — `commits_added: string[]` required 化、`commit_sha` deprecated、
       controller 検証規約節追加。
       v13 (2026-05-17) — investigation report schema に `e2e_verification_plan`、
       完了報告に `simplify_*` field 追加。
       v12 (2026-05-06) — Shared Runtime Boundary 切り出し。active/planned expert 正本定義 /
       marker semantics 正本定義を runtime-contract.md / active-expert-registry.md /
       planned-experts.md / labels-and-markers.md へ pointer 化。
       v2〜v11: 旧版 changelog 省略 (git log 参照)。
-->

# expert subagent spawn 規約

/**
 * 機能概要: op-* スキル群が Agent tool で expert subagent を spawn する際の prompt 規約と独立性確保ルールを定義する
 * 作成意図: 司令官の context と subagent の context を物理的に分離し、self-review バイアスを構造的に抑える
 * 注意点: review 系の spawn は必ず別 worktree + 別ロールを使う。同一 context 内でロールを名乗るだけは禁止
 */

op-scan / op-run / op-merge は、ドメイン作業を `~/.claude/agents/` の expert に委譲する。
本ドキュメントは spawn 時の prompt 構造と独立性確保のルールを集約する。

## 関連ドキュメント

- `_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode の対話可否契約と
  `needs_human_decision` の正規スキーマ。本ドキュメントの spawn 規約はこれを前提とする。
- `_shared/runtime-contract.md` — runtime spawn eligibility / planned expert handling /
  reclassification policy / Issue・PR marker と spawn authorization の関係の正本。
- `_shared/active-expert-registry.md` — runtime spawn 可能な active expert の単一正本リスト。
- `_shared/planned-experts.md` — planned expert (env / release / compatibility / spec) の
  lifecycle・normalization ルール・実装予定の正本。
- `_shared/markers/labels-and-markers.md` — Issue / PR / Review コメントに埋める hidden marker と
  GitHub label の正本一覧および semantics。
- `_shared/model-selection.md` (>=3) — expert spawn 時の model (Opus / Sonnet / Haiku、具体 version は §1) 選択ルール
  および `task_complexity` 区分の正本。本ファイルの spawn schema は `model:` / `task_complexity:` field
  を持つが、その意味論・mapping table・override 優先順位はすべて本 pointer 先に集約される。
  パターン3 (review) の `model: "opus"` 注釈は §7.1 narrow opt-down 適用時に Sonnet になる ((>=3) で追加)。

---

## Shared Runtime Boundary

For canonical runtime spawn eligibility, planned expert handling, routing metadata semantics,
and label/marker names, see:

- `skills/_shared/runtime-contract.md`
- `skills/_shared/active-expert-registry.md`
- `skills/_shared/planned-experts.md`
- `skills/_shared/markers/labels-and-markers.md`

Issue markers and PR markers are routing metadata only.
They do not authorize runtime spawn.

Only experts listed in `active-expert-registry.md` may be spawned.
Planned experts listed in `planned-experts.md` must be normalized before spawn.

本ファイルが正本として保持するのは以下のみ:

- spawn prompt 構造 (3 パターン: scan / apply / review)
- spawn schema (canonical scan output schema および各 domain 拡張)
- review-expert の invocation details / 7 lens 手順 / 出力ブロック
- handoff mechanics (specialist review / Review Fix Loop / op-run 判定優先順位 1-8)
- execution boundary (司令官と subagent の責務分担、並列 spawn 制約)
- reclassification の **schema field** (`reclassified_from` / `reclassified_to` /
  `reclassification_reason`)。PR コメント側に reclassification を示す hidden marker が現れる場合、
  それは本 schema field の **mirror only** であり、canonical は schema field 側 (=本ファイル) に置く。
  marker 名の正本一覧と semantics は `labels-and-markers.md` を参照する。

active / planned expert lifecycle の判定、planned expert ごとの normalization ルール、
hidden marker / label 名の意味論は本ファイルでは正本定義しない。上記 4 ファイルを参照する。

---

## Planned Expert handling (summary only)

Summary only. Canonical semantics are defined in `skills/_shared/runtime-contract.md` and
`skills/_shared/planned-experts.md`.

- planned expert (`env-expert` / `release-expert` / `compatibility-expert`) は
  `subagent_type` および `Agent({...})` の引数として直接渡してはならない。
  Utility Worker (`scout` / `spec-expert`) も op-run routing 対象外であり、op-run の apply / post-check / review
  routing から直接 spawn しない (各 Utility Worker は専用 OP skill が内部 spawn する。`spec-expert` は op-run では `feature-expert` へ正規化)。
- canonical scan schema の `recommended_runner` / `post_check_expert` / `recommended_fix_expert`
  に planned expert 名が現れた場合は、op-run が spawn 前に **active expert** または
  `needs_human_decision` へ正規化する (planned-experts.md の per-expert ルールに従う)。
- `release-expert` は runtime fallback destination として使用してはならない
  (active fallback chain にも置かない)。詳細は `planned-experts.md` の release-expert 節を参照。
- canonical schema 拡張 (security / threat_model / usable_security / post_check 等) や
  active expert ごとの spawn 配線は本ファイルの後段 (canonical schema 節 / review prompt 節) に
  正本がある。

## expert agent と用途 (spawn 規約上の住み分けのみ)

Summary only. Canonical active expert list and lifecycle are defined in
`skills/_shared/active-expert-registry.md`. planned expert lifecycle は
`skills/_shared/planned-experts.md` を参照。

本節は spawn 規約 (= 司令官がどの expert に何を投げてよいか) を理解するための **最小住み分け** だけ載せる。
each expert の責務・契約・判定基準は agent 実体 (`agents/<name>.md`) と registry を正本とする。

**review と post-check は別役割** (spawn パターン上の前提):

- `review-expert` = **PR 全体の独立 global review** (監査専任、修正・push しない)。post-check expert として
  指定不可 (= `<!-- op-post-check-expert: review-expert -->` 禁止)。
- `security-expert` = **security 深掘り post-check** および scan / patrol / apply の specialist。
- `ux-ui-audit-expert` = **UX/UI domain post-check** および scan / architect gate。実装はしない。

UX/UI は **使いやすさ番人 (ux-ui-audit-expert)** と **美しさ番人 (designer-expert)** の二人体制で、
両者の検出が衝突した場合は **使いやすさが常に優先される**。op-architect の Design Plan gate と
op-run の post-check は `ux-ui-audit-expert` が担い、designer の出力を縛る。

攻撃者視点 / 悪用可能性は review-expert の Security/Abuse Lens で扱い、
深掘り specialist 鑑識は security-expert に集約する。

post-check expert として **runtime spawn 可能** なのは以下に限る:

- `ux-ui-audit-expert` (op-run フェーズ3.5-A)
- `security-expert` (op-run フェーズ3.5-B)

その他の値 (`env-expert` 等の planned expert) が canonical schema の `post_check_expert` に出現した
場合の扱いは Shared Runtime Boundary 節 / `runtime-contract.md` / `planned-experts.md` を参照。

---

## Plugin scoped-name 規約 (subagent_type の前置)

本 repo は Claude Code **plugin** (`op-skill`) として配布される (CLAUDE.md「配布・運用方式」)。
plugin 内の component は **`op-skill:` prefix 付き**で登録されるため、Agent tool の `subagent_type`
には **登録名 = scoped 名を渡さなければならない**。bare 名を渡すと
`Agent type '<name>' not found` で spawn が失敗する (実測確認済み: bare `debug-expert` = 失敗 /
`op-skill:debug-expert` = 正常 spawn)。ハーネスに bare→scoped の自動補完は無い。

### 規約

- **repo 提供の expert / utility worker を Agent tool で spawn する際は必ず `op-skill:<name>` を渡す**。
  対象 = active expert 9 体 (debug / feature / refactor / optimize / test / designer / ux-ui-audit /
  security / review) + utility worker (`scout` / `spec-expert`)。
- **bare canonical 名は正本として保持する**。`op run expert-resolve` の出力、
  `active-expert-registry.md`、marker 値 (`op-run-expert` 等)、fingerprint、
  `apply-prompt-directives.md` の `${EXPERT}` 節 lookup はすべて **bare 名**で扱う。
  `op-skill:` 前置は **Agent tool の `subagent_type` 引数の境界でのみ**適用し、
  内部の比較・正規化・payload の `expert` field には持ち込まない (前置すると section lookup 等が壊れる)。
- **動的 spawn** (payload の解決済み expert を使う ClusterOrchestrator の apply / review 等) では
  `subagent_type` を `"op-skill:" + <resolved bare expert>` として組み立てる。

### 前置しない例外

- **built-in agent** (`general-purpose` / `Explore` / `Plan`) は plugin component ではないため
  **bare のまま**渡す (前置すると逆に解決失敗する)。
- **planned expert** (`env-expert` / `release-expert` / `compatibility-expert`) は
  そもそも spawn しない (前置対象外)。canonical schema に現れた場合は spawn 前に active /
  `needs_human_decision` へ正規化する (下記 Planned Expert handling 節)。

> 非 plugin の dev 実行 (agent を `~/.claude/agents/` へ直置きする等) は本 repo の配布モデル外であり、
> OP skill の spawn は常に plugin 経由 (scoped) を前提とする。`claude --agent <name>` CLI フラグが
> bare 名で解決するのは単発 human 起動の話であり、Agent tool の `subagent_type` 契約とは別 (混同しない)。

---

## spawn の3パターン

### パターン1: scan 用 (read-only audit)

```
Agent({
  subagent_type: "op-skill:<domain>-expert",   ← plugin scoped 名 (「Plugin scoped-name 規約」節)
  model: "<from model-selection.md §5.2 by area complexity (single/typical→sonnet, complex/critical→opus)>",
  description: "scan: <domain>",
  prompt: """
    invocation_mode: op_managed

    あなたは <domain>-expert です。<scope> を read-only で audit してください。
    <... scan prompt 規約に従う ...>

    You must not ask interactive questions.
    If information is missing, return assumptions or needs_human_decision.
    Do not write Issue comments asking for clarification unless the OP skill
    explicitly delegates comment creation to you.
    Return the required canonical schema JSON array. Do not mix question text
    into the JSON output.
  """
})
```

- isolation 不要 (read-only なので worktree は要らない)
- 並列 spawn 可
- 出力は Critical/High 候補のみ。Medium/Low はノイズなので返さない
- expert は対話質問せず、不足情報は `assumptions` / `needs_human_decision` で構造化返却

### パターン2: apply 用 (worktree 内で実装)

```
Agent({
  subagent_type: "op-skill:<domain>-expert",   ← plugin scoped 名 (「Plugin scoped-name 規約」節)
  model: "<from model-selection.md §5.3 by cluster.task_complexity (routine/extension→sonnet, design/integration/api-design→opus)>",
  isolation: "worktree",            ← 必須
  description: "apply: cluster-<id>",
  prompt: """
    invocation_mode: op_managed

    あなたは <domain>-expert です。worktree <path> の branch <name> で
    Issue #<N> を実装してください。
    <... apply prompt 規約に従う ...>

    You must not ask interactive questions.
    Do not stop and wait for commander or user replies.
    If information is missing, return one of:
      - assumptions[] : 前提を置いて続行
      - needs_human_decision : 構造化された判断要求
      - blocked_actions[] : 判断なしでは実行しない操作
    Return the required apply report and commit. Do not push.
  """,
  run_in_background: true            ← 並列待機のため
})
```

- worktree 隔離必須 (ファイル競合防止)
- ブランチ名・触ってよいファイル一覧を prompt で明示
- apply agent は質問で停止しない。push は司令官が後段で実施

> **注記 (ADR-0016 後)**: 上記は Direct Mode の単発 apply spawn schema として有効。
> 一方、**OP-managed の apply fan-out** (op-run) は ADR-0016 で ClusterOrchestrator (Agent tool) 駆動へ移行済。
> OP-managed 経路では controller が各クラスター向けに ClusterOrchestrator を Agent tool で spawn し、
> apply → PR → post-check → review → round 管理の全ライフサイクルが ClusterOrchestrator 内で完結する
> (ClusterSummary のみ controller に返却)。`workflows/op-run-fanout.js` は ADR-0016 で削除済み。
> `skills/op-run/SKILL.md` / `skills/op-run/cluster-orchestrator-directives.md` を参照。
> 本パターンの `run_in_background` + Monitor は Direct Mode の手動 fan-out 時にのみ適用する。

> **注記 (ADR-0017): feature 正本の native auto-inject (controller は明示注入しない)**
> feature 正本 (`.claude/rules/<feature>.md`) は path-scoped frontmatter (`paths:`) を持ち、
> worktree で spawn された expert が **その `paths:` に該当するファイルを touch する作業のとき、
> 対応する正本が native に context へ auto-inject される** (W-spike 2026-06-20 で実証済)。
> constitution (`.claude/rules/00-constitution.md`) は always-on。
> したがって **controller は spawn prompt に正本を明示注入しない** — native binding が効くため、
> 明示 inject は native が効かない環境向けの contingency としてのみ残す (二重ロードは context 肥大の原因)。
> **運用条件 = 正本が tracked (commit 済) であること** — untracked だと `git worktree add` で worktree に
> 伝播せず binding が silent に効かなくなる (ADR-0017 G1-op)。
> **binding は worktree / main checkout いずれでも効く** (W-spike Q-A=main / Q-B=worktree 両方 PASS)。
> apply / review 等の worktree spawn にも等しく適用される。

### パターン3: review 用 (独立性確保が最重要)

```
Agent({
  subagent_type: "op-skill:review-expert",   ← plugin scoped 名 (「Plugin scoped-name 規約」節)
  model: "opus",                    ← global review は Opus default。§7.1 narrow opt-down 適用時は Sonnet (model-selection.md §5.1 / §7.1、具体 version は §1)
  isolation: "worktree",            ← 別 worktree で PR ブランチを checkout
  description: "global review PR #<N>",
  prompt: """
    invocation_mode: op_managed

    あなたはこの PR を書いていない独立 reviewer (review-expert) です。
    <... review prompt 規約に従う、独立性確保節を必須 ...>

    You must not ask interactive questions.
    You must not modify code, commit, or push.
    Return one of: approve / needs-fix / needs-specialist-review / blocked.
    Use <!-- op-review-meta --> and <!-- op-review-finding --> blocks.
    Do not produce free-form question text.
  """
})
```

- main の context から完全分離
- worktree も apply 時とは別ものを使う (物理的に別空間)
- ロールも別 (review-expert) で「書いていない第三者」を演じる
- review-expert は **修正・push しない**。指摘を finding として残し、op-run が specialist expert に再委任する
- 判定は approve / needs-fix / needs-specialist-review / blocked のいずれかに閉じる (質問テキスト禁止)

---

## model / task_complexity routing

OP-managed mode で spawn する際、controller は `Agent({ model: "..." })` 引数で model を明示する。
model 選択 (Opus / Sonnet / Haiku、具体 version は §1) の正本は `_shared/model-selection.md` (>=1)。本節は
spawn 時に渡す field の所在のみ規定し、意味論・mapping・優先順位は本ファイルに正本を置かない。

spawn 時に渡す追加 field:

| field | 値 | 用途 |
|---|---|---|
| `model` | `"opus"` \| `"sonnet"` \| `"haiku"` | `Agent({ model: ... })` に渡す。OP-managed mode では agent frontmatter `model:` より優先 |
| `task_complexity` | `routine` \| `extension` \| `design` \| `integration` \| `api-design` | apply spawn 時に prompt 内へ埋め、agent が task の重さを把握できるようにする |

controller の決定経路:

1. 入力 Issue の `task_complexity` を `issue-enrichment.md` の推論結果から取得 (apply 経路) または
   `区画 complexity` を `op-patrol` の区画スコアリングから取得 (scan / patrol audit 経路)
2. `model-selection.md` §5 mapping table を引いて model を決定
3. `--quality high/balanced/low` flag / `OP_QUALITY` env で override
4. 決定値を `Agent({ model: ... })` に渡す

Direct Mode (人間が直接 expert を呼ぶ場合) は controller を介さないため、`agents/*.md` の frontmatter
`model:` が default になる。OP-managed mode と Direct Mode の挙動分離は `_shared/invocation-mode.md` を
参照。

degrade (Opus rate limit 等で Sonnet に降格された場合) の取り扱いは `model-selection.md` §9 を参照。

---

## prompt 規約 (共通)

すべての spawn prompt は以下の構造を含む:

```
1. invocation_mode  — `op_managed` を明示 (OP skill 由来であることを宣言)
2. ロール宣言       — あなたは <expert>。○○の専門家
3. タスク定義       — 何をするか (1〜2 文)
4. 入力             — 対象ファイル / Issue / PR 番号
5. 制約             — 触ってよい範囲 / 触ってはいけない範囲 / 並列タスクが触る範囲
6. 出力契約         — 何を返すか (フォーマットを明示)
7. 不足情報の扱い   — 質問せず assumptions / needs_human_decision / blocked として返す
8. 完了条件         — どうなったら終わりか
```

expert は scan / patrol / review で以下の op CLI helper を活用してよい (推奨例):

- `op core fingerprint --plain --domain <d> --title <t> --file <f> [--symbol <s>]` — finding の `op-fingerprint` 値 (`<domain>:<normalized_title>:<primary_file>:<symbol>` 4-seg) を自前生成 (controller の事後計算に依存せず、手書きによる format drift を回避。全 expert 共通)。`--file` は `src/foo.py:42` 形式可 (`:LINE` は除去される)
- `op core debt-key --plain --bulk-group <bg> --root-path <lca> [--symbol-or-boundary <s>]` — architecture_debt finding 起票時の `op-refactor-debt-key` を採番一意性を保証して生成 (refactor-expert 専用、手書き衝突を回避)
- `op core extract-pr-markers --input-json - --plain` — merged PR 引用時に `pr_body` / `pr_comment_bodies` / `commit_message_bodies` を入力 JSON で渡し、決定論的に marker hit を抽出 (review-expert / refactor-expert。`--from-body` で `Fixes/Closes/Resolves` 9 活用形を case-insensitive 抽出。over-match / under-match と PR #161 snapshot bug を構造防止。ただし構造化 marker のみ抽出するため `## 残存リスク / follow-up` 節の自然文補完は agent 側で別途実施 — memory `feedback_extract_pr_markers_misses_natural_text`)
- `op help envelope scan-dedup` — 自分の finding が dedup でどう処理されるかを self-describe (#229 で追加)

prompt の冒頭に必ず「あなたはこのコードを <書いた / 書いていない>」を明記する。
review の場合は「書いていない」と明言し、独立性を強調する。

### invocation_mode の必須行

すべての OP skill 由来 spawn prompt は冒頭で以下を明示する。
これにより expert は `_shared/invocation-mode.md` の OP-managed Mode rules を適用する。

```text
invocation_mode: op_managed

You must not ask interactive questions.
You must not ask the commander or user for clarification.
Do not write Issue comments asking for clarification unless the OP skill explicitly delegates comment creation to you.
If information is missing, return one of:
  - assumptions[]               (前提を置いて続行する)
  - needs_human_decision        (構造化された判断要求)
  - blocked_actions[]           (この情報なしで実行しない操作のリスト)
  - verification_not_run        (検証不能な場合)
  - manual_review_bucket        (--auto 起票しないが人間レビューには載せる)
Return the required schema / report format. Do not produce free-form question text.
```

詳細な mode 判定 / 禁止フレーズ / `needs_human_decision` の正規スキーマは
`_shared/invocation-mode.md` を参照する。本ドキュメントは spawn 時の必須行のみ規定する。

各 SKILL.md での pointer 記述形式 (共通節のインライン展開禁止 / 1〜2 行 pointer 化) は
`_shared/spawn-prompt-common.md (>=1)` を参照する。

---

## scan 出力契約 (canonical schema)

**全 expert はこのスキーマで出力する。** これが scan / apply / review を貫く唯一の契約。
op-scan は本スキーマを `_shared/pr-templates.md` の指示書テンプレに直接マッピングする。

```json
[
  {
    "title": "<60 文字以内、症状の要約>",
    "severity": "critical | high",
    "severity_reason": "<Critical / High と判定した根拠。到達経路・観測可能な被害・影響範囲を含める (severity-rubric.md に従う)>",
    "domain": "debug | refactor | optimize | security | ux-ui | design | test | feature | env",
    "files": ["path/to/file.ext:LINE"],
    "symbols": ["<関数名 / コンポーネント名 / 型名>"],
    "summary": "<2-3 文の問題説明>",
    "evidence": "<該当コード 5-10 行>",
    "evidence_grade": "direct | inferred | requires_runtime",
    "reproduction_hint": "<再現条件 / 確認方法。requires_runtime のとき必須>",

    "hypothesis": "<scan が立てた根本原因仮説>",
    "excluded_hypotheses": [
      "<検討したが否定した仮説 X: 否定根拠>",
      "<検討したが否定した仮説 Y: 否定根拠>"
    ],
    "scope_in": ["path/to/touchable.ext"],
    "scope_out": ["<触ってはいけない範囲 / 別 Issue で扱う領域>"],

    "recommendation": {
      "type": "fix | refactor | optimize | test | feature | investigation",
      "steps": ["<実装手順 1>", "<実装手順 2>"]
    },
    "verification_steps": ["<修正後に確認すべき項目>"],
    "success_criteria": ["<どうなれば修正完了と判定できるか>"],
    "gotchas": ["<scan が遭遇した罠 / apply で踏みやすいミス>"],

    "bulk_group": "<カテゴリ ID。バッチ可能な検出をまとめるキー、なければ null>",
    "confidence": "high | medium",
    "requires_dynamic_verification": true,

    "recommended_runner": "debug-expert | refactor-expert | optimize-expert | security-expert | ux-ui-audit-expert | designer-expert | test-expert | feature-expert | env-expert",
    "post_check_expert": "ux-ui-audit-expert | security-expert | env-expert | null",
    // ↑ enum に planned expert (env-expert 等) が含まれるのは routing metadata としての記録目的。
    //   runtime spawn 許可ではない。planned expert handling と active expert lifecycle の正本は
    //   skills/_shared/runtime-contract.md / planned-experts.md / active-expert-registry.md を参照。

    // ---- 再分類 metadata (optional, canonical fields) ----
    // 通常の finding では省略する。canonical schema field として保持し、PR コメントの
    // `<!-- op-reclassified-from: ... -->` 系 marker は本 schema field の **mirror only** として扱う
    // (canonical は本 schema field 側、second source ではない)。
    // 詳細な再分類 policy (release-expert 由来 finding の active expert 再分類等) は
    // skills/_shared/runtime-contract.md / planned-experts.md を参照。
    "reclassified_from": "<元の (誤分類された) expert 名。例: release-expert>",  // optional
    "reclassified_to":   "<再分類後の active expert 名 / needs_human_decision>",  // optional
    "reclassification_reason": "<1 行理由。例: build / packaging failure のため debug domain と判定>",  // optional

    "design_principle_violated": "<designer-expert 専用: Scan Mode 観点 1〜9 のどれか。design domain 以外は省略>",
    "bypass_count": "<designer-expert 専用: 同一カテゴリの bypass を `confirmed_bypass_count` ベースで数えた値。design domain 以外は省略>",
    "affected_screens": "<designer-expert 専用: 影響画面数 (framework 別の数え方は scan-finding-policy.md 参照)。design domain 以外は省略>",
    "candidate_count": "<designer-expert 専用: 一次 grep 等のヒット候補数 (除外前の raw)。design domain 以外は省略>",
    "excluded_count": "<designer-expert 専用: token 定義 / SVG / generated / vendor / snapshot 等で除外した件数。design domain 以外は省略>",
    "confirmed_bypass_count": "<designer-expert 専用: 実際の design system bypass と確定した件数 (= candidate_count - excluded_count)。design domain 以外は省略>",
    "exclusion_summary": "<designer-expert 専用: どの allowlist で除外したかの 1 行説明 (例: `tokens.css / svg / snapshot / generated を除外`)。design domain 以外は省略>"
  }
]
```

### フィールドの必須性

| フィールド | 必須 | 備考 |
|-----------|-----|------|
| title / severity / domain | ✓ | 起票判定に必須 |
| severity_reason | ✓ | Critical / High と判定した根拠 (到達経路・観測可能な被害・影響範囲)。`severity-rubric.md` に従う |
| files / symbols | ✓ | 最低 1 件 |
| summary / evidence | ✓ | evidence は静的に観測したコード断片 |
| evidence_grade | ✓ | `direct` 以外で Critical を付けてはいけない |
| reproduction_hint | `requires_runtime` のとき必須 | 静的では不確実な場合 |
| hypothesis / scope_in / scope_out | ✓ | apply の context 継承に必要 |
| recommendation.type / .steps | ✓ | `fix` / `refactor` / `optimize` / `test` / `feature` / `investigation` のいずれか。additive (test / feature) のときは steps を計画として詳細化、`optimize` のときは steps に measurement_plan を必ず含める |
| verification_steps / success_criteria / gotchas | ✓ | apply / review の合否判定基盤 |
| excluded_hypotheses | 推奨 | 0 件でもよいが、検討した形跡があるほうが信頼度が高い |
| bulk_group | 任意 | 5 件以上同 group ならバッチ Issue 化 |
| recommended_runner | ✓ | apply 担当 expert の自己宣言。op-scan / op-patrol が hidden marker (`op-run-expert` 等) に転写する (marker 名の正本は `labels-and-markers.md`)。planned expert 値は op-run が spawn 前に正規化する (`runtime-contract.md` / `planned-experts.md` 参照)。security domain finding は **`security-expert` または `debug-expert`** (op-run の判定優先順位 1-8 で最終決定) |
| post_check_expert | ✓ | 必須。post-check が不要なら明示的に `null` を入れる。op-scan / op-patrol が hidden marker (`op-post-check-expert` 等) に転写する (marker 名の正本は `labels-and-markers.md`)。security domain finding は **必ず `security-expert`** (apply 後の深掘り post-check で再監査)。`review-expert` は post-check expert として指定不可 (global review 専任)。planned expert 値の解決は `runtime-contract.md` / `planned-experts.md` 参照 |
| reclassified_from / reclassified_to / reclassification_reason | optional (再分類時のみ) | canonical schema field として保持。PR コメントの reclassification marker は本 field の **mirror only** であり、second source ではない (canonical は本 field 側)。`from` / `to` / `reason` の 3 つは揃えて記録する (`from` だけ書いて `to` を省略しない)。`recommended_runner` / `recommended_fix_expert` は再分類後の値を入れる。再分類の policy 本体 (どの planned expert をどの active expert に倒すか等) は `runtime-contract.md` / `planned-experts.md` を参照 |
| design_principle_violated | design domain で必須 | scan-finding-policy.md の Scan Mode 観点 1〜9 のどれか |
| bypass_count | design domain で推奨 | confirmed_bypass_count をベースに数えた値 (raw grep カウントではない) |
| affected_screens | design domain で推奨 | 画面単位 (framework 別の数え方は scan-finding-policy.md) |
| candidate_count / excluded_count / confirmed_bypass_count / exclusion_summary | design domain で推奨 | 一次 grep の生数 / 除外数 / 確定数 / 除外理由。誤検知抑制と起票判定の透明性確保 |

### domain extension: refactor 拡張フィールド

`domain: "refactor"` の finding に限り、canonical schema に加えて以下の **refactor 拡張フィールド**
を **正式拡張**として保持する。op-scan / op-patrol はこれらを「forward compat で無視するスキーマ外項目」
ではなく **必須転写対象**として扱い、`_shared/pr-templates.md` の「🧱 Refactor Execution Control」節に
展開する。詳細は `~/.claude/skills/expert-refactor/references/report-schema.md` を正本とする。

| フィールド | 必須 | 値 / 備考 |
|-----------|------|----------|
| `finding_type` | ✓ | `immediate_refactor` / `staged_refactor` / `architecture_debt` / `needs_spec_decision` |
| `execution_mode` | ✓ | `direct_apply` / `staged_refactor` / `needs_human_decision` |
| `direct_apply_safe` | ✓ | true は immediate_refactor のみ。それ以外は false |
| `safe_first_step` | staged_refactor / architecture_debt で必須 | 最初の stage で安全に実行できる作業 (1〜2 文) |
| `proposed_stages` | staged_refactor / architecture_debt で必須 | 順序付き stage 配列 |
| `forbidden_stage_actions` | 任意 | 1 PR 内で実行してはならない操作の列挙 |
| `blocking` / `blocking_reason` | ✓ (false なら blocking_reason=null) | 新規悪化や scope_out 違反進行で true。`op:blocking-finding` ラベルへ反映 |
| `why_not_direct_apply` | architecture_debt で必須 | direct apply にしない理由 (1〜2 文) |
| `affected_paths` | architecture_debt / staged_refactor / needs_spec_decision で必須 | 影響範囲のパス glob 配列。`op-refactor-debt-key` の `root_path` (LCA) 計算に使うため、debt 系 finding 全てで必須 |
| `first_detected_at` / `last_seen_at` | architecture_debt で必須 | ISO 8601 date。agent 側は今回検出値のみ返し、op-patrol が fingerprint で正式値に上書きする |
| `seen_count` | architecture_debt で必須 | agent は新規検出時 `1` のみ返す。`>=2` の推測は禁止 (op-patrol の責務) |
| `risk_trend` | architecture_debt で必須 | `stable` / `worsening` / `spreading`。agent は新規検出時 `stable` のみ。再検出での更新は op-patrol の責務 |
| `needs_human_decision` | `required: true` の場合に block 全体必須 | 構造化 block (`_shared/invocation-mode.md` の正規 schema)。`required` / `reason` / `decision_type` / `options[]` / `recommended_option` / `safest_default` / `blocked_actions[]` / `can_continue_without_decision` / `next_safe_action` を全て埋める。判断不要なら block ごと省略可 |
| `human_decision_points` | 任意 (refactor 固有の補助) | 判断点の自然文配列。`needs_human_decision.options[]` の要約や日本語説明を 1〜N 件 |
| `recommended_followup_experts` | 任意 | post-check に乗らない follow-up 検証要件 (test / compatibility / release / designer 等)。各要素 `{ expert, reason, scope }` |

> **post_check_expert の制約** (refactor domain): Phase 1 では `ux-ui-audit-expert` / `security-expert` / `null`
> のみ許容する。`compatibility-expert` / `release-expert` / `test-expert` / `designer-expert` 等は
> `recommended_followup_experts` 経由で逃がす (詳細は expert-refactor/references/post-check-policy.md)。

### post_check_expert: routing metadata vs runtime spawn 許可

Summary only. Canonical semantics are defined in `skills/_shared/runtime-contract.md` and
`skills/_shared/planned-experts.md` (planned post-check expert lifecycle), and
`skills/_shared/markers/labels-and-markers.md` (post-check 関連 marker 名の正本一覧)。

spawn 規約上の最低限の不変則のみ本節に残す:

- `post_check_expert` enum に planned expert (例: `env-expert`) が出現するのは routing metadata
  としての記録目的であり、**runtime spawn 許可ではない**。op-run は当該 expert の agent 実体
  (`agents/<name>.md`) が存在しない限り直接 spawn してはならない。
- 現時点で **runtime spawn 可能な post-check expert** は `ux-ui-audit-expert` (op-run フェーズ3.5-A)
  および `security-expert` (op-run フェーズ3.5-B) のみ。`subagent_type` に直接渡してよいのはこの 2 体
  (spawn 時は plugin scoped 名 `op-skill:ux-ui-audit-expert` / `op-skill:security-expert` を渡す。「Plugin scoped-name 規約」節参照)。
- `review-expert` は **post-check expert として指定不可** (global review 専任)。
  `<!-- op-post-check-expert: review-expert -->` を marker として書いてはならない。

planned post-check expert の skip handling (PR 本文 / コメントに残す marker 名等) は
`labels-and-markers.md` を、planned expert の per-expert ルールは `planned-experts.md` を参照する。

### domain extension: security 拡張フィールド

`domain: "security"` の finding に限り、canonical schema に加えて以下の **security 拡張フィールド**
を **必須拡張**として保持する。op-scan / op-patrol はこれらを「forward compat で無視するスキーマ外項目」
ではなく **必須転写対象**として扱い、Issue 本文の Threat Model / Source-Sink / Usable Security 節および
post-check meta block に展開する。詳細は `~/.claude/skills/expert-security/references/report-schema.md`
を正本とする。

```yaml
security:
  attack_surface: ipc | file_io | path | shell | capability | secret | url | parser | updater | logging | indesign_com | installer
  trust_boundary: frontend_to_backend | user_file | user_selected_path | external_url | local_fs | env | config | generated_script | com_boundary
  source:
    kind: frontend_invoke | imported_file | external_url | config | clipboard | drag_drop | user_selected_file | env | cli_arg
    file: "<path>"
    symbol: "<関数 / コマンド名>"
    input_name: "<parameter 名>"
  sink:
    kind: file_read | file_write | file_delete | rename | copy | execute | request | disclose | parse | update
    file: "<path>"
    symbol: "<関数 / コマンド名>"
    operation: read | write | delete | execute | disclose | request | parse
  attack_path:
    reachable: true | false
    steps:
      - "<source から sink までの具体的な流れ>"
  exploitability: none | theoretical | reachable | practical
  impact:
    confidentiality: none | low | medium | high
    integrity: none | low | medium | high
    availability: none | low | medium | high
  data_sensitivity:
    - production_path | user_file | token | document_content | generated_artifact

threat_model:
  # primary actor は単一固定 (gate / 集計が単一前提)
  actor: local_user | malicious_document | malicious_project_file | compromised_frontend | network_attacker | malicious_update_source | malicious_plugin
  # 補助 actor。任意配列。空または省略可
  secondary_actors:
    - <enum と同じ語彙>
  preconditions:
    - "<攻撃が成立する前提>"
  required_user_action:
    - "<ユーザー操作が必要なら明記。不要なら空配列>"
  asset_at_risk:
    - user_file | production_path | token | document_content | generated_artifact

usable_security:
  affected_user_capability:
    - save_as | open_file | choose_directory | export | import | external_app_launch | batch_processing
  legitimate_workflow_preserved: true | false
  ux_impact: none | low | medium | high
  preferred_mitigation:
    - validate | canonicalize | scope | confirm | audit | permission_split
  forbidden_shortcuts:
    - do_not_remove_file_picker
    - do_not_force_fixed_output_directory
    - do_not_remove_import_export
    - do_not_remove_external_app_launch
    - do_not_disable_capability_entirely
    - do_not_redesign_auth_model
    - do_not_change_updater_design
    - do_not_force_dependency_update

post_check:
  primary_post_check_expert: security-expert
  requires_aux_post_check: true | false
  aux_post_check_experts:
    - ux-ui-audit-expert
```

| フィールド | 必須 | 値 / 備考 |
|-----------|------|----------|
| `security.attack_surface` | ✓ | enum (12 値) |
| `security.trust_boundary` | ✓ | enum。trust-boundaries.md (A〜G) と対応 |
| `security.source` | ✓ | kind / file / symbol / input_name |
| `security.sink` | ✓ | kind / file / symbol / operation |
| `security.attack_path.reachable` | ✓ | true でないと起票しない (= severity に到達しない) |
| `security.attack_path.steps` | ✓ | 3-7 ステップで断定的に |
| `security.exploitability` | ✓ | enum (`practical` のみ Critical 上限を解放) |
| `security.impact` | ✓ | C/I/A 3 軸で `none / low / medium / high` |
| `security.data_sensitivity` | ✓ | 配列 (1 つ以上) |
| `threat_model.actor` | ✓ | enum (7 種)。**主 actor は単一固定** (gate / 集計が単一前提) |
| `threat_model.secondary_actors` | optional | 配列 (補助 actor。空または省略可。primary actor 以外の経路で同一 finding が成立する場合のみ列挙) |
| `threat_model.preconditions` | ✓ | 観測可能な前提を 1 行ずつ。空配列禁止 |
| `threat_model.required_user_action` | ✓ | 配列。ユーザー操作不要なら空配列 |
| `threat_model.asset_at_risk` | ✓ | 配列 (1 つ以上) |
| `usable_security.affected_user_capability` | ✓ | 配列。該当する capability を必ず 1 つ以上 |
| `usable_security.legitimate_workflow_preserved` | ✓ | boolean。提案 mitigation で workflow 維持できるか |
| `usable_security.ux_impact` | ✓ | enum。`high` の修正は自動 apply 禁止 |
| `usable_security.preferred_mitigation` | ✓ | 配列 (1 つ以上)。mitigation ladder から選択 |
| `usable_security.forbidden_shortcuts` | ✓ | 配列。capability 全体禁止に踏み込まないための制約を明示 |
| `post_check.primary_post_check_expert` | ✓ | `security-expert` 固定 |
| `post_check.requires_aux_post_check` | ✓ | boolean。UI / workflow 影響あり mitigation の場合 true |
| `post_check.aux_post_check_experts` | requires_aux_post_check==true で必須 | 配列 (例: `[ux-ui-audit-expert]`) |

> **post-check policy** (security domain): apply 担当が `security-expert` または `debug-expert` のいずれでも
> post-check は **必ず `security-expert`** が実行する (op-run フェーズ3.5-B)。
> 8 観点 (元 finding 解消 / 別の攻撃面増加 / 入力検証 / 認可・capability / エラーパス / scope_out 違反 /
> 正当なユーザー操作維持 / UX/UI auxiliary post-check 必要性) で audit し、
> PASS / PASS_WITH_NOTES / BLOCK / NEEDS_HUMAN_DECISION の 4 種で判定する。
> `legitimate_workflow_preserved == false` を検出した場合は NEEDS_HUMAN_DECISION を優先する
> (capability 削除を機械的に「再実装」させると元木阿弥になるため)。

> **auxiliary post-check** (security domain): security mitigation が UI / workflow に影響する場合、
> security-expert は post-check 結果に `requires_aux_post_check: true` + `aux_post_check_experts: [ux-ui-audit-expert]` +
> `aux_post_check_status: required_pending` を返す。op-run はこれを受けて ux-ui-audit-expert post-check を
> 追加実行し、結果に応じて aux_post_check_status を `pass` / `block` に更新する。
> op-merge は `aux_post_check_status` が `required_pending` / `block` / `skipped` / `stale` のいずれかなら
> merge を BLOCK する (詳細は op-merge/SKILL.md)。

### severity の判定

severity の判定基準は `_shared/severity-rubric.md` を必ず参照する。
本スキーマだけでは判定できない場合、severity-rubric の手順 (到達経路 → 観測可能な被害 → 分類) に従う。

### 「可能性がある」を出力する条件

evidence_grade を導入した目的は、「可能性がある」という曖昧表現を排除すること。

- `direct` — 静的に確認可能 (コード読みで証拠が揃う)
- `inferred` — 周辺コードからの推論 (証拠は間接的、High が上限)
- `requires_runtime` — 実行時検証が必要 (High 上限、reproduction_hint 必須)

### バッチ可能性判定 (bulk_group)

同一 expert + 同一カテゴリの検出を `bulk_group` で関連付ける。
op-scan は同じ `bulk_group` の検出が **5 件以上** あれば、個別 Issue ではなく
バッチ Issue (`_shared/pr-templates.md` のバッチテンプレ) を生成する。

bulk_group の例:
- `test-expert` の `garbage-skip-untracked` (放置 .skip)
- `test-expert` の `garbage-trivial-snapshot` (無価値 snapshot)
- `refactor-expert` の `naming-inconsistency-foo` (foo 関連の命名不統一)
- `security-expert` の `security:path-traversal-in-export` (file IO の path 検証漏れ)
- `security-expert` の `security:unsafe-shell-args` (shell 引数 escape 漏れ)
- `ux-ui-audit-expert` の `ux-ui:missing-loading-state` (非同期処理にローディング無し)
- `ux-ui-audit-expert` の `ux-ui:focus-removed` (focus 不可視)
- `designer-expert` の `design:hardcoded-color` (色ハードコード散在)
- `designer-expert` の `design:component-bypass` (共通 component を使わない自前実装)

各 expert の SKILL.md に「自分の bulk_group カテゴリ命名規則」を定義する。

### 実装計画の埋め込み (additive 検出)

検出が「修正 (fix)」ではなく「**追加 (add)**」を要求する場合、
`recommendation` フィールドに **構造化された実装計画** を含める。
これで apply は context 喪失なく即実装に入れる。

対象となる検出タイプ (additive):
- `test-expert`: テスト不足 → 追加テスト計画
- `feature-expert`: 仕様の穴 → 機能追加計画
- `ux-ui-audit-expert`: state 欠如 / 復帰導線不足 / 確認ダイアログ不足 → 追加実装計画 (実装は designer-expert に委譲、`recommended_runner: designer-expert` を必ず付ける)
  - designer-expert 単独で完結しないケース (state machine / API retry / auth flow / draft 保持等) は `gotchas` に **co-run が必要な expert** (feature-expert / debug-expert) を明記する。schema は変えず、op-run 司令官が gotchas を読んで複数 spawn / Issue 分割を判断する運用 (詳細は `~/.claude/skills/expert-ux-ui-audit/references/scan-finding-policy.md` の co-run 判定節)
- `designer-expert`: トークン化不足 / 共通 component 未利用 / design system 構造的負債 → 移行計画 (実装は自分自身、`recommended_runner: designer-expert`)
- `optimize-expert`: 計測未整備 → ベンチ追加計画

実装計画の標準フォーマット (Markdown 構造、`recommendation` 内に埋め込む):

```markdown
## <種類> 計画

### 対象
- ファイル / 関数: `path::name`
- 現状: <現状を 1 行で>

### 追加するもの
| # | 名前 | 内容 / 入力 | 期待 / 効果 |
|---|------|-----------|------------|
| 1 | ... | ... | ... |

### 必要な前提・依存
- 既存の <fixture / コンポーネント / モジュール> を再利用
- 新規 <作る場合のみ列挙>

### 推定規模
- 追加 LoC: 約 N 行
- 追加ファイル: N 個
- 副作用: <なし or 列挙>

### 受入条件
- <条件 1>
- <条件 2>
```

「修正 (fix)」型の検出 (debug / refactor / security) では、`recommendation` は
従来通り「修正の方向性 (1〜3 文)」で十分。実装計画フォーマットは強制しない。

---

## investigation report schema (フェーズ 2-A)

op-run フェーズ 2-A 探知フェーズで各 expert が司令官に返す investigation report のスキーマ。
詳細な競合検出ロジックは `_shared/clustering.md` の Stage 2 を参照。

```json
{
  "issue": 42,
  "cluster_id": "auth-debug-1",
  "suspected_root_cause": "<調査で立てた根本原因仮説>",
  "files_read": ["src/auth/login.rs", "src/auth/session.rs", "src/lib.rs"],
  "files_likely_to_modify": ["src/auth/login.rs", "src/auth/middleware.rs", "Cargo.toml"],
  "risk_files": ["Cargo.toml"],
  "needs_serialization": true,
  "reason": "<直列化が必要な理由 (Cargo.toml に依存追加が必要、shared store も参照する可能性あり 等)>",

  "e2e_verification_plan": {
    "uses_existing_steps": true,
    "existing_steps_ref": "Issue #42 §verification_steps",
    "additional_steps": [
      { "step": "<Issue 本文に不足する検証ステップ>", "tool": "cargo test | bun run dev + curl | claude-in-chrome | tmux | skip" }
    ],
    "verification_tool_primary": "cargo test",
    "skip_reason": null
  }
}
```

### investigation report フィールドの必須性

| フィールド | 必須 | 備考 |
|-----------|------|------|
| `issue` / `cluster_id` | ✓ | 司令官が Stage 2 競合検出に使う |
| `suspected_root_cause` | ✓ | 探知フェーズでの仮説。修正フェーズの出発点 |
| `files_read` | ✓ | 探知中に読んだファイル一覧 |
| `files_likely_to_modify` | ✓ | 司令官が Stage 2 競合検出で `cluster_a.files_likely_to_modify ∩ cluster_b.files_likely_to_modify` を計算する |
| `risk_files` | ✓ | global_conflict_files に該当するもの |
| `needs_serialization` | ✓ | true の場合、司令官が該当クラスタを直列化する |
| `reason` | `needs_serialization: true` の場合必須 | 直列化が必要な理由 |
| `e2e_verification_plan` | ✓ (v13 以降) | 後述の e2e plan スキーマに従う。unit test のみで十分な場合は `skip_reason` に理由を記載し `additional_steps: []` で可 |

### e2e_verification_plan の詳細

```
e2e_verification_plan の一次ソース優先順位 (Single Canonical Source Rule):
1. Issue 本文の verification_steps 節 (一次ソース)
2. expert の additional_steps[] (Issue 本文に不足する分のみ補完)
3. skip_reason (unit test で十分と判断した場合の明示理由)
```

| フィールド | 必須 | 備考 |
|-----------|------|------|
| `uses_existing_steps` | ✓ | Issue 本文の `verification_steps` を使う場合 true |
| `existing_steps_ref` | `uses_existing_steps: true` 時必須 | `"Issue #N §verification_steps"` 形式で参照を明記 |
| `additional_steps` | ✓ | 不足分のみ補完。0 件の場合は `[]` |
| `verification_tool_primary` | ✓ | `"cargo test"` / `"bun run dev + curl"` / `"claude-in-chrome"` / `"tmux"` / `"skip"` のいずれか |
| `skip_reason` | `verification_tool_primary: "skip"` 時必須 | unit test のみで十分な理由を 1 文で記載 |

> **deprecation**: v12 以前の investigation report (e2e_verification_plan なし) は warning 止め。
> 自動失敗はさせない (`_shared/version-check.md` 段階移行プロトコル)。deprecation 期間 = 1 release。

---

## 修正完了報告 schema

op-run フェーズ 2-C 修正フェーズで各 expert が司令官に返す完了報告のスキーマ。
本節は apply agent が完了報告を組み立てる際の正本となる。

```json
{
  "issue": 42,
  "cluster_id": "auth-debug-1",
  "status": "completed | blocked | partial",
  "modified_files": ["src/auth/login.rs", "src/auth/middleware.rs"],
  "commits_added": ["<SHA1>", "<SHA2>"],
  "commit_sha": "<コミット SHA>",
  "verification_executed": ["<実行した検証ステップ 1>", "<実行した検証ステップ 2>"],
  "verification_results": {
    "level1_lint_type": "pass | fail | skip",
    "level2_unit_test": "pass | fail | skip",
    "level3_build": "pass | fail | skip"
  },
  "happy_path_tests_added": ["<test_xxx_when_yyy>"],
  "assumptions": [],
  "needs_human_decision": { "required": false },
  "blocked_actions": [],

  "code_review_invoked": true,
  "code_review_result": "pass | warning | skip",
  "code_review_skip_reason": null,
  "code_review_effort": "low | medium | high | xhigh | max | auto | null"
}
```

### 修正完了報告 フィールドの必須性

| フィールド | 必須 | 備考 |
|-----------|------|------|
| `issue` / `cluster_id` / `status` | ✓ | 司令官の進捗管理に必要 |
| `modified_files` | `status: completed` 時必須 | 変更ファイル一覧 |
| `commits_added` | ✓ (v14 以降) | apply spawn が追加した commit の SHA 配列。apply では `[SHA, ...]` (1 件以上) 必須。exploration-only spawn (investigation / post-check / review) では `[]` が正解。`commits_added: []` のまま apply 完了報告を返すことは contract violation |
| `commit_sha` | **deprecated** (v14 以降) | v13 以前との backward-compat のため optional として残置。新規実装では `commits_added` を使う。v14 以降は `commits_added[0]` が事実上の正本 |
| `verification_executed` | ✓ | 実行した検証ステップ一覧 (`e2e_verification_plan` に対応) |
| `verification_results` | ✓ | Verification Ladder Level 1〜3 の PASS / FAIL |
| `code_review_invoked` | ✓ (v16 以降) | code-review skill (旧 simplify) を呼び出したか否か |
| `code_review_result` | `code_review_invoked: true` 時必須 | `"pass"` / `"warning"` / `"skip"` |
| `code_review_skip_reason` | `code_review_result: "skip"` 時必須 | skip 理由を明記 (`"expert-review (read-only)"` / `"benchmark unstable revert"` / `"security finding 残置"` 等) |
| `code_review_effort` | optional (v16 以降) | controller が spawn 時に渡した effort-level の転写 (`"low"` / `"medium"` / `"high"` / `"xhigh"` / `"max"` / `"auto"` / `null`)。effort 自動派生ルールは `_shared/model-selection.md (>=2)` §5.5 を参照 |
| `assumptions` | 推奨 | OP-managed Mode で推定した前提条件 |
| `needs_human_decision` | 推奨 | 判断不能な設計判断を構造化返却 |
| `blocked_actions` | `needs_human_decision.required: true` 時必須 | scope 内の安全な実装のみ進めた場合の保留 action 一覧 |

> **deprecated fields (summary)**: 旧 `simplify_*` は `code_review_*` に auto-translate (v16 backward-compat)。
> 旧 `commit_sha` は `commits_added[0]` として扱う (v14 backward-compat)。
> v12 以前の完了報告 (対応フィールドなし) は warning 止め。全て deprecation 期間 = 1 release。
> auto-translate mapping: `simplify_invoked → code_review_invoked` / `simplify_result → code_review_result` /
> `simplify_skip_reason → code_review_skip_reason`。混在時は新フィールド優先。詳細は `_shared/version-check.md`。

### controller 検証規約 (v14 新設)

apply spawn 完了後、controller は **`commits_added` の中身が空でないこと** を必ず確認する。
詳細手順 (git log 実測 / 不一致分岐 / SendMessage retry / worktrees-failed/ 隔離 / retry 文面テンプレ) は
`skills/_shared/apply-completion-verify.md (>=1)` を参照 (Single Canonical Source Rule)。

- exploration-only spawn (investigation / post-check / review) の完了報告では `commits_added: []` が正解。controller は空配列を contract violation と見なしない。
- apply spawn の完了報告で `commits_added: []` の場合、controller は `apply-completion-verify.md` の手順に従い git log 実測 → SendMessage retry / failed: 隔離 の分岐を実行する。
- `commit_sha` (deprecated) が存在し `commits_added` が空の場合は、`commit_sha` 値を `commits_added[0]` として扱い、warning を出す (v13 以前 agent との backward-compat)。

### 完了報告の長さ目安 / 圧縮ルール (producer 側)

<!-- 正本: _shared/read-economy.md。本節は producer 側の長さ規定のみ。consumer 側は read-economy.md を参照。 -->

自由記述フィールドが肥大化すると controller の context コストが上昇する。要点のみ返す。
長さ目安 (超過しそうなら要点へ圧縮):

  | フィールド | 長さ目安 | 圧縮方針 |
  |-----------|---------|---------|
  | `status` 周辺の要約 (summary 系) | 2〜4 文程度 | 何をどう変えたかの意味レベルのみ。diff の逐語再掲をしない |
  | `assumptions[]` | 各項 1 文 / 全体 5 項以内目安 | OP-managed Mode で置いた前提を 1 件 1 文で。背景説明を盛らない |
  | `verification_executed` / `verification_results` | コマンド名 + pass/fail/skip のみ | ログ全文を貼らない。失敗時のみ失敗要旨を 1〜2 文 |
  | `needs_human_decision` / `blocked_actions[]` | 各 option / action 1〜2 文 | 判断に要る差分のみ。長文の論証を貼らない |
  | その他 notes 系 | 必要時のみ・数文以内 | 不要なら省略 (空でよいフィールドを埋めるために散文を足さない) |

- ファイル全文 / ログ全文の逐語引用をしない。load-bearing な数行のみ引用し、他は意味レベルで要約する。

---

## apply 入力契約 (Issue 指示書)

op-run から渡される Issue 本文は `_shared/pr-templates.md` の **指示書フォーマット** に従う。
apply agent は以下の節を必ず読み取り、自タスクの判断に使う:

| Issue 節 | apply での扱い |
|---------|--------------|
| 観測された挙動 / Evidence | 静的観察結果 (実行時検証は agent 自身が行う) |
| scan が立てた仮説 | 出発点の有力仮説。鵜呑みにせず自分でも検証 |
| 除外した仮説 | 再検証不要、ただし scan が見落とした角度がないか確認 |
| 触ってよいファイル | このリスト外を編集しない |
| 触ってはいけないファイル | 別タスクが扱う / 影響範囲外 / 触ると競合 |
| 必須検証項目 | 完了報告で全項目の pass を明示 |
| 成功条件 | 達成できなければ完了扱いしない |
| 既知の落とし穴 | apply 中に意識する |
| 🧱 Refactor Execution Control (domain=refactor のみ) | refactor-expert は本節を必ず読み、`finding_type` に従って分岐: `immediate_refactor` + `direct_apply_safe=true` のみ direct apply、`staged_refactor` / `architecture_debt` は `safe_first_step` のみ実行 (1 stage = 1 PR)、`needs_spec_decision` または `needs_human_decision.required=true` は実装せず block 全体を完了報告に返す |

scan→apply の context 継承はこの契約で担保する。Issue 本文に指示書節がない場合の扱い:

- Direct Mode: ユーザーに古い形式である旨を提示し、scan 再起票か手動補完を確認してよい
- OP-managed Mode: 質問で停止しない。`assumptions[]` に「指示書節欠如のため canonical schema の最低項目から推定」と
  記録し、`needs_human_decision` に「scan 再起票 / 現 Issue 本文だけで進行 / 別 Issue 化」を選択肢として返す。
  expert 側で勝手に Issue コメントを起こさない (commander が必要に応じて行う)。

---

## review 用 prompt の独立性確保節 (テンプレ, review-expert)

<!-- 詳細手順・7 lens 観点・review_result 判定は `skills/expert-review/SKILL.md` が正本。
     本節は spawn prompt に必要な最低限テンプレのみ保持する。
     finding-schema.md L64 がこの節を参照しているため節名を保持。 -->

review-expert は **監査専任**。コード編集・commit・push は禁止。
needs-fix の修正は op-run が specialist expert に再委任する。

```
あなたはこの PR を書いていない独立 reviewer (review-expert) です。
以下の手順を必ず守ること:

1. base ref を `gh pr view <N> --json baseRefName --jq '.baseRefName'` で解決し、$BASE_REF として固定する
2. **変更前ファイル (origin/${BASE_REF} 側) を `git show "origin/${BASE_REF}:<path>"` で先に読む**。
   current tree (Read / Grep / cat) の参照は diff 確認 (手順 4) の前まで禁止。
   詳細は `evidence-policy.md` の base-first evidence procedure を参照。
3. PR 本文と関連 Issue を読み、変更が「なぜ必要か」を自分で推論する
4. `git diff "origin/${BASE_REF}...HEAD"` (triple-dot) を見て推論とのズレを探す
5. 7 lens で検証 (詳細は `skills/expert-review/SKILL.md`):
   Security / Workflow-UX / Test / Compatibility / Release / Spec / Refactor
6. review_result を決定: approve / needs-fix / needs-specialist-review / blocked
7. needs-fix / needs-specialist-review / blocked のとき、各 finding を `<!-- op-review-finding -->` block 形式で残す
   (pr-templates.md 参照)。全体 review_result は最重値で決定。

self-review にならないよう外部監査の立場を最後まで保つこと。
```

### needs-fix の機械的判定 (3 条件 AND)

review-expert は以下 3 条件をすべて満たす場合のみ `needs-fix` を返す。
1 つでも欠けるなら `needs-specialist-review` に切り替える。

```text
needs-fix:
  same-pr 内で修正できる
  AND 単一 expert で完結する
  AND 既知パターンの修正である
```

`needs-specialist-review`:
- same-pr 可否が不明
- 担当 expert が一意に決まらない
- 修正パターンが未知
- 専門判断後でないと修正方針を決められない

`blocked`:
- scope_out / 人間判断必要 / loop 上限超過 / Issue 再設計が必要

### review-expert の禁止事項

| 禁止 | 理由 |
|------|------|
| コード編集 / commit / push | review-expert は監査専任。修正は op-run が specialist に再委任 |
| `needs-fix-applied` 判定の使用 | 本判定は廃止 (review-expert が修正すると独立性が壊れる) |
| post-check expert としての振る舞い | review-expert は global review 専用、`<!-- op-post-check-expert: review-expert -->` 指定は禁止 |
| PR 本文の typo 修正 | 軽微であっても push は禁止。typo は finding (Spec Lens / Refactor Lens) に残す |

### op-run による Review Fix Loop と再委任

review_result が `needs-fix` / `needs-specialist-review` の PR は op-run が制御する。
`recommended_fix_expert` は提案にすぎず、最終判断は op-run が以下の優先順位で行う。

```text
1. Issue / PR の scope_in / scope_out
2. 変更ファイルのドメイン (src-tauri/** / frontend/** / migrations/** / tests/** など)
3. finding の lens (Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor)
4. failure mode / 失敗種別 (bug / regression / state recovery / IPC violation / token bypass など)
5. required post-check (修正後に必要となる post-check expert と整合する apply expert を選ぶ)
6. review-expert の recommended_fix_expert (参考情報として参照)
7. ownership / 直前に修正した expert
8. 不明な場合は needs-specialist-review または blocked
```

判定例:

```text
- review-expert が feature-expert を推奨していても、対象が src-tauri/** の
  file IO / permission / IPC なら security-expert を優先する。
- UI 表示崩れでも、design token / component aesthetics なら designer-expert、
  状態復帰 / error flow / a11y 実装修正なら feature-expert を選ぶ
  (ux-ui-audit-expert は apply target にしない。再 audit 担当として `requires_post_check: ux-ui-audit-expert` を別フィールドで指定する)。
- テスト不足でも、仕様不明確なら test-expert ではなく spec-expert に先に回す。
- 認可・capability・shell / file IO 副作用なら recommended_fix_expert に関わらず security-expert。
```

### lens / failure mode → 再委任先 expert の対応例

```text
implementation gap (Workflow/UX, Spec):
  → feature-expert

bug / regression (Workflow/UX, Refactor):
  → debug-expert

test gap (Test):
  → test-expert (仕様不明確なら spec-expert へ先に handoff)

UX / state recovery / a11y / error flow (Workflow/UX 実装修正):
  → feature-expert (apply)
  ※ ux-ui-audit-expert は apply target にしない。再 audit 担当として
     finding 側の `requires_post_check: ux-ui-audit-expert` で指定する。

visual / design token / component aesthetics (Workflow/UX):
  → designer-expert

refactor / structure / duplication (Refactor):
  → refactor-expert

performance regression (Refactor / Test):
  → optimize-expert

security / file IO / permission / IPC (Security/Abuse):
  → security-expert (deep specialist, recommended_fix_expert を上書き可能)

compatibility / migration / saved data (Compatibility):
  → compatibility-expert (planned。op-run が spawn 前に正規化。詳細は planned-experts.md)

release / installer / updater / artifact (Release):
  → release-expert (planned。**runtime spawn / fallback destination 禁止**。
                     reclassification policy の正本は planned-experts.md。
                     再分類時は canonical schema field
                     `reclassified_from` / `reclassified_to` / `reclassification_reason` に記録する)

ambiguous requirement / scope issue (Spec):
  → spec-expert (op-spec 専用 Utility Worker。op-run routing 対象外のため spawn 前に feature-expert へ正規化。
                 仕様判断そのものは op-spec で正本照合する。詳細は active-expert-registry.md / planned-experts.md)
```

### needs-specialist-review の handoff

needs-specialist-review は即修正ではない。
specialist に finding の妥当性 / 影響範囲 / 修正方針 / same-pr 可否を判断させる。

specialist は判断結果を `<!-- op-specialist-review-meta -->` block として PR コメントに残す
(canonical schema は `~/.claude/skills/_shared/pr-templates.md` の
「op-run: specialist 判断結果コメント (specialist expert)」節を参照)。
これにより op-run の自動分岐が自然文依存にならない。

```text
<!-- op-specialist-review-meta -->
source_finding_id: RVW-<連番>
specialist: <expert 名>
specialist_result: same-pr-fixable | new-issue | blocked
recommended_apply_expert: <expert 名 | null>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
reviewed_round: <元 finding の review_round>
reviewed_at: <ISO8601>
reason: <短い理由>
```

specialist_result に応じた op-run の動作:

```text
specialist_result = same-pr-fixable:
  → op-run が判定優先順位 1-8 に戻り、recommended_apply_expert を参考に apply expert を決定して再委任
specialist_result = new-issue:
  → 当該 finding を別 Issue 化、本 PR 上では blocked finding 扱い
specialist_result = blocked:
  → 自動修正不能、pro-review-blocked で人間判断待ち
```

`recommended_apply_expert` に `review-expert` / `ux-ui-audit-expert` を指定してはいけない
(前者は監査専任 / 後者は検出 + post-check 専任、いずれも apply target ではない)。

### review-expert の出力 (必須)

review-expert は判定確定時に、`<!-- op-review-meta -->` ヘッダーで以下を必ず記録する。
フォーマットは `~/.claude/skills/_shared/pr-templates.md` の review コメントテンプレに従う。

```
<!-- op-review-meta -->
review_result: approve | needs-fix | needs-specialist-review | blocked
reviewed_head_sha: <sha>
reviewed_at: <ISO8601>
reviewer: review-expert
review_round: <1, 2, ...>
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: <op-run controller が払い出した id。OP-managed mode では non-empty かつ "unknown" 以外>
review_worktree_head_sha: <review worktree の HEAD SHA>
```

> **schema 同期の責務**: 本 schema の field 単位の正本 (SSoT) は
> `~/.claude/skills/_shared/markers/review-markers.md` の `<!-- op-review-meta -->` block schema 節。
> schema を変更する場合は `review-markers.md` を先に変更し、本サンプルをそれに追従させる
> (review-expert agent.md / op-merge gate / op-run の review meta 抽出が canonical schema に依存する)。

> **`op_run_session_id` の責務 (controller 固定)**:
> review-expert は `op_run_session_id` を生成しない。op-run controller から渡された
> `OP_RUN_SESSION_ID` をそのまま `<!-- op-review-meta -->` に転写する。OP-managed mode で
> missing / empty / `"unknown"` の場合、template 側 (`~/.claude/skills/expert-review/templates/`)
> で fail-fast し、op-merge gate 3i でも拒否される。Direct Mode (`<!-- op-review-report -->`) では
> 本 schema 自体を出さない設計のため、混入経路は無い。

needs-fix / needs-specialist-review / blocked のとき、各 finding を `<!-- op-review-finding -->` block で残す:

```
<!-- op-review-finding
id: RVW-<連番>
result: needs-fix | needs-specialist-review | blocked
severity: critical | high | medium | low
lens: Security / Abuse | Workflow / UX | Test | Compatibility | Release | Spec | Refactor
scope: same-pr | new-issue | blocked
recommended_fix_expert: <expert 名>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
-->
```

`<!-- op-review-meta -->` マーカーで始まるコメントが op-merge の gate 検証対象。
op-merge は `reviewed_head_sha == current_head_sha` かつ `review_result == approve`、
かつ `pro-reviewed` ラベル付き、かつ stale post-check / blocked / fix-in-progress / stale ラベルなし、
を **すべて満たす** PR のみマージ可能とする。

---

## 並列 spawn の制約

- 司令官は同時 spawn 数を `max_parallel` (デフォルト 3) で制御する
- subagent 完了通知は run_in_background の通知で受ける (sleep/poll しない)
- 30 分以上応答がない subagent はタイムアウト扱いで隔離 (worktree は保持してユーザー判断に委ねる)
- 失敗 subagent はリトライ最大 1 回。それでも失敗したら他タスクに影響させず続行

---

## Marker Publish Validate (全 expert 共通契約)

<!--
機能概要: 全 expert が hidden marker / completion report block を publish する前に
         op CLI で 2 段 validate を実行する契約。
作成意図: PR #307-#311 で review-expert spawn の 80% が canonical schema 違反
         (meta block 配置 / single-line HTML 形式 / shell var 未展開) で publish した。
         `op core marker-lint` は本 repo に既存しているのに agent prompt 側に
         validate 義務が inject されていなかった。本節をその正本とし、
         9 expert agent + 9 SKILL.md から 1 行 pointer で参照する。Fixes #312。
注意点: HOW (2 段 validate 手順) は本節のみに書く。各 expert/SKILL は
         1 行 pointer のみを持ち、内容を複製しない (Single Canonical Source Rule)。
-->

全 expert は hidden marker / completion report block を **publish**
(= PR comment / Issue comment / Issue body / patrol-ledger-comment / Review comment 経由で書き出す)
する前に、必ず以下の **2 段 validate** を実行する。

### Step 1: `op help marker <name>` で field 定義と例を確認

```bash
op help marker <marker_name>
# 例: op help marker op-review-meta
#     op help marker op-domain
```

`op help marker --list` で全 35 marker を一覧できる。publish する marker 全てが対象。

### Step 2: `op core marker-lint --body - --source-hint <kind> --strict` で実 body を lint

```bash
# 展開後の最終 body を stdin に流す
op core marker-lint --body - --source-hint <kind> --strict <<'EOF'
<ここに展開後の最終 body を貼り付け>
EOF
```

`<kind>` は以下から選択:

| kind | 使用場所 |
|------|---------|
| `pr-comment` | PR コメント |
| `pr-body` | PR 本文 |
| `issue-body` | Issue 本文 |
| `review-comment` | Review コメント (review-expert の出力先) |
| `issue-comment` | Issue コメント |
| `patrol-ledger-comment` | Patrol Ledger Issue コメント |

両 Step が pass で初めて publish 可。fail なら修正してから再 lint する。

### 既知の落とし穴 (Gotchas)

- **shell var 未展開のまま publish しない (#310 再演型)**:
  `op core marker-lint --body -` に流す body は `<<EOF` ヒアドキュメント変数展開後 +
  bash arithmetic 展開後の **最終 body のみ** を lint 対象にすること。
  `${review_round}` / `${OP_RUN_SESSION_ID}` 等の shell var が未展開のまま含まれる body を
  stdin に流しても lint pass してしまい、publish 時に空フィールドが混入する。

- **meta block は `## 見出し` から 1 行以上空けて配置する (#307/#309 再演型)**:
  meta block を `## 見出し` の直前に置くと、YAML parser が次の見出しを
  YAML scope 内と解釈し terminator が無いエラーになる。
  空行 1 行以上を meta block と `## 見出し` の間に必ず挟む。

- **marker block は canonical YAML block 形式のみ (#308 再演型)**:
  3 行以上 (`<!-- op-review-meta` 開始 + YAML body + `-->` 終端) の canonical YAML block 形式のみ。
  `<!-- op-review-meta: ... -->` のような single-line HTML コメント形式は canonical 違反。

- **validate 対象は publish する全 marker**:
  `op help marker --list` で list される 35 marker 全てが対象。
  `op-review-meta` / `op-review-finding` だけでなく、
  `op-domain` / `op-source` / `op-fingerprint` / `op-post-check-meta` 等も同様に validate する。

- **review approve publish は `op review publish-approval` に集約済み (#756)**:
  review_result == approve の op-review-meta 投稿は、controller が marker を手組みして本節の 2 段 validate を
  手動で回す代わりに、`op review publish-approval` (marker 組立 + marker-lint 自己検証 + コメント投稿 +
  pro-reviewed 付与を atomic に行う primitive) を呼ぶ。本節の 2 段 validate は CLI 内部で担保される。
  正本は `op-run/references/global-review-spawn.md` §4-2-b (approve path) / `op-codev/SKILL.md` Review 選択 2、
  CLI 仕様は `op-tools/docs/specs/review-publish-approval.md`。non-approve verdict (finding 連番を伴う) は
  従来どおり controller が marker を組み本節の 2 段 validate を回す。

---

## 司令官の責務 (subagent との分担)

| 司令官 (main Claude) | subagent (expert) |
|--------------------|------------------|
| Issue 取得・クラスタリング・タスク分解 | 個別タスクの investigate / plan / apply |
| worktree 作成・cleanup | worktree 内での作業 |
| 並列度管理・進捗監視 | 1 タスクの完遂 |
| PR open・マージ判断 | (PR open は run スキル内で司令官が実施) |
| 結果統合・ユーザー報告 | 自タスクの結果報告のみ |

司令官は **コードを直接編集しない**。すべて subagent に委譲し、自身は調整に徹する。
これで main の context が肥大化せず、長時間 auto mode で動き続けられる。
