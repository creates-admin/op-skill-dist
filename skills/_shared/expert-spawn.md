# expert subagent spawn 規約

op-* skill が Agent tool で expert subagent を spawn するときの境界。scan / investigation / apply の入出力 schema は `_shared/expert-report-schemas.md`。
spawn 可否 (active / planned / routing metadata) は `_shared/runtime-contract.md`、prompt 共通ブロックは `_shared/spawn-prompt-common.md`、
model は `_shared/model-selection.md`。

## Plugin scoped-name 規約 (subagent_type の前置)

plugin 内 component は `op-skill:` prefix 付きで登録される。Agent tool の `subagent_type` に bare 名を渡すと
`Agent type '<name>' not found` で失敗する (自動補完なし)。

### 規約

- active expert 9 体と utility worker (`scout` / `spec-expert`) を spawn するときは `subagent_type: "op-skill:<name>"` を渡す
- bare 名が正本。`op run expert-resolve` 出力 / registry / marker 値 / fingerprint / `apply-prompt-directives.md` の
  `${EXPERT}` 節 lookup / payload の `expert` field はすべて bare 名。前置は `subagent_type` 引数の境界でのみ行う
- 動的 spawn (ClusterOrchestrator の apply / review 等) は `"op-skill:" + <resolved bare expert>` で組み立てる

### 前置しない例外

- built-in agent (`general-purpose` / `Explore` / `Plan`) は bare のまま渡す
- planned expert はそもそも spawn しない

## expert spawn は subagent であること (teammate 化させない)

- 戻り値契約 (ClusterSummary 等) を持つ skill を回す環境では `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` を設定しない
- spawn に個体名を付けない。識別は `description` (例: `"ClusterOrchestrator: c1"`) で行う。prompt で「teammate として」「チームを作って」と要求しない
- `run_in_background` は既定に委ね、CO 配下も同期直列に固定しない。`In-process teammates cannot spawn background agents` が返った場合のみ `false` で再送する

## subagent 内からの spawn

- 実行環境によっては subagent に Agent tool が渡されない (subagent から配下を spawn できない)
- 配下を spawn する subagent (CO 等) は起動直後に Agent tool の有無を確かめ、無ければ何も実行せず専用の verdict で返す
- 呼出側はその verdict を受けたら、同じ run の残りを subagent に頼らず、その手順書を自分の context で実行して配下を直接 spawn する
- 環境変数やホスト種別から推測して事前に切り替えない (判定は subagent 自身のツール一覧だけで行う)

## spawn の3パターン

prompt 冒頭に「あなたはこのコードを <書いた / 書いていない>」を明記する (review は「書いていない」)。

### パターン1: scan 用 (read-only audit)

- worktree 不要、並列 spawn 可。model は `model-selection.md` §5.2 (fable 禁止)
- prompt は `spawn-prompt-common.md` §1 / §2 (exploration-only) / §4 を含む
- 返却は `_shared/expert-report-schemas.md`「scan 出力契約」。`requires_runtime` / `inferred` / low confidence は `manual_review_bucket` (`_shared/auto-policy.md`)

### パターン2: apply 用 (worktree 内で実装)

- `isolation: "worktree"` 必須。model は `model-selection.md` §5.3 (§7.2 の承認を得た spawn のみ `fable`)
- prompt は `spawn-prompt-common.md` §1 / §2 (apply) / §4 を含み、ブランチ名・触ってよいファイルを明示する
- commit まで行い push しない (push は司令官)。返却は `_shared/expert-report-schemas.md`「修正完了報告 schema」
- op-run では ClusterOrchestrator が apply → PR → post-check → review → round 管理を完結させ ClusterSummary だけを返す
  (正本: op-run skill の `cluster-orchestrator-directives.md`)。CO が配下を spawn できない環境では controller が同書を実行する
  (「subagent 内からの spawn」)

### パターン3: review 用

- review-expert は apply とは別 worktree・別 context で spawn する (同一 context でロールを名乗るだけは不可)。read-only、fable 禁止
- 判定は approve / needs-fix / needs-specialist-review / blocked の 4 値。返却は `op help payload review-finding`、投稿・記録は controller
- 独立性手順・禁止事項・判定基準の正本は `agents/review-expert.md` と expert-review skill。Review Fix Loop の再委任は
  op-run skill の `references/review-fix-loop.md`

### 正本 (.claude/rules) の Read

- 全 spawn prompt に次の 1 行を含める:
  `作業対象のパスが決まったら、対応する .claude/rules/<feature>.md を Read ツールで開いてから着手すること (cat / grep では正本が読み込まれない)。`
- 正本の本文は spawn prompt に注入しない
- 正本は `paths:` に該当するファイルを Read ツールで開いたときだけ auto-inject される。untracked の正本は worktree に
  伝播しない。注入時に HTML コメントは除去されるため、正本の指示を `<!-- -->` 内に書かない

## Marker Publish Validate (全 expert 共通契約)

hidden marker を Issue / PR の body やコメントに publish する前に 2 段 validate する。

1. `op help marker <name>` (一覧は `--list`) で field 定義と例を確認する
2. 展開後の最終 body を lint し、pass してから publish する:

```bash
op core marker-lint --body - --source-hint <kind> --strict <<'EOF'
<展開後の最終 body>
EOF
```

`<kind>`: `pr-comment` / `pr-body` / `issue-body` / `review-comment` / `issue-comment` / `patrol-ledger-comment`。

- lint するのは shell 変数・算術展開後の最終 body。`${review_round}` 等が未展開のままだと lint を通って空フィールドが混入する
- meta block と `## 見出し` の間に空行を 1 行以上挟む
