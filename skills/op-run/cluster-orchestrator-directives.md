<!--
schema_version: 1
last_breaking_change: 2026-06-14
notes: v1.4.1 相当 (2026-07-24, Issue #61): フェーズ4 の auto-fix label 付与 step を
       `op issue edit-labels "$PR_NUMBER"` から `op pr edit-labels --pr "$PR_NUMBER"` へ差し替え。
       前者は mcp channel で call-spec が issue_labels kind に載り、ingest の url_matches_issue が
       PR の /pull/N を必ず拒否して block する構造的欠陥 (Issue #61) を持つため。後者は pr_labels kind
       (op pr ingest-result / url_matches_pull_request、publish-approval が pass 実績を持つ経路) に載る。
       gh channel の挙動は無変更、ClusterSummary schema 不変のため schema_version 据置。
       v1.4 相当 (2026-07-23, ADR-0027 第六波 6b): review_round 導出 (フェーズ5) / review_mode 判定
       (フェーズ5.5) の入力元をコメント走査 (grep / trusted-author 照合) から `<!-- op-review-state -->`
       文書 (`op review state pull`) の読みへ全面置換。フェーズ6 の marker 投稿後に `op review state push`
       (approve は `op review publish-approval` が内包 / non-approve は明示呼び出し) を配線。フェーズ7
       terminal 処理に controller state push を追加。`pr_open_degraded_mcp_channel` verdict の適用条件を
       「mcp channel だから」から「state 経路自体が例外的に成立しない場合のみ」に縮退 (ADR-0027 6b で
       post-check / global review / Review Fix Loop が mcp channel でも state 文書経由で成立するため)。
       comment 投稿 (`op-review-meta` 等) は人間向け監査ログとして維持し、機械判定は行わない
       (review-markers.md v1→v2 breaking bump と対を成す)。ClusterSummary の公開 field schema・
       verdict union の値集合は不変のため非破壊 additive、schema_version 据置。
       v1.3 相当 (2026-07-23, ADR-0024/0027 第六波 6a): ①ClusterSummary.verdict union に
       `pr_open_degraded_mcp_channel` (optional `degrade_note?: string` 併設) を additive 追加し、
       第五波 5a dogfood で観測された「approved を捏造せず非 schema 値で表現していた」実態を
       正式な schema 値に昇格する (ADR-0024 検証実績節)。②フェーズ7 verdict 集約表に degrade 行を追加。
       ③フェーズ8 jq 組立に degrade_note の envelope 化を追加。④フェーズ4 (PR 作成) 直後に
       auto-fix label 付与 step を追加し、mcp channel で PR が無ラベルのまま残る gap
       (ADR-0024 検証実績節「mcp 経路の PR に auto-fix label が付かない」) を解消。
       いずれも非破壊 additive のため schema_version 据置。
       v1.2 相当 (2026-07-23, ADR-0024 Phase 3 第五波 5a): 生 gh 直叩き (`gh pr create` ×2 / `gh pr close` /
       `gh issue create`) を既存 op primitive (`op pr create` / `op pr close` / `op issue create`) への配線に
       置換 (drift 解消)。mcp channel では各コマンドが call-spec を emit しうるため、CO 自身が実行者として
       github-channel.md §3-§4 の protocol (verbatim MCP 実行 → read-back → ingest) を完遂する旨を注記。
       gh channel の挙動 (fence 構造・返却 envelope の扱い) は無変更。非破壊 additive のため schema_version 据置。
       v1.1 相当 (2026-06-30): ClusterSummary に pending_label / unfiled_followup を additive 追加
       (非破壊変更: optional フィールド追加のみ。既存 schema_version=1 pin との互換を維持するため
       schema_version は据置。controller 側 (>=1) 参照 pin も変更不要)。
       v1 (2026-06-14): ADR-0016 ClusterOrchestrator アーキテクチャ採択に伴い新規作成。
       controller を薄型 dispatcher に変え、1 クラスターの完全ライフサイクル
       (Issue 読込 → apply → 自己検証 → PR 作成 → post-check → review → round 管理 → verdict)
       を ClusterOrchestrator が独立コンテキストで担う設計の指示書正本。
       9 節 (payload schema / Issue 読込 / apply spawn / 自己検証 / PR 作成 /
       review_round 取得 / post-check / review spawn / verdict 分岐 / compact summary schema)
       + フェーズ 5.5 post-check を含む計 10 フェーズ構成。
       参照 pin: op-run/SKILL.md (>=1)。
-->

<!--
機能概要: ADR-0016 ClusterOrchestrator の完全指示書。
         main Claude が Agent tool で spawn した ClusterOrchestrator が、
         1 クラスターの apply → PR → post-check → review → round 管理 → verdict を
         独立コンテキストで完結させ、compact summary (~200 bytes) のみを controller に返す。
作成意図: controller コンテキスト溢れ (149KB/150KB) と review ループ不収束を構造的に解消するため、
         ライフサイクル全体を ClusterOrchestrator に委譲する ADR-0016 の主要実装物。
         apply → PR → post-check → review の各フェーズは既存 references/*.md への
         pointer 参照に留め、重複定義 (silent fork) を作らない。
注意点: Workflow ネストは PoC で不可と確認済 (ADR-0016 §PoC)。
       ClusterOrchestrator は main Claude の Agent tool で spawn される通常 agent であり、
       その内部で Agent tool を使って子 agent (apply-expert / review-expert) を spawn する経路が
       PoC 2 で動作確認済。
       (#744 で解消済: 上記不整合は `_shared/markers/labels-and-markers.md` の Writer フィールドを
       ClusterOrchestrator に整合することで解消した。対象 marker: op-review-controller-meta /
       op-review-meta / op-review-finding (投稿主体) / op-model-degraded / op-planned-post-check-skipped /
       model_used・model_decision_reason。ADR-0016 決定7)
-->

<!-- op-domain: feature -->
<!-- op-source: op-run -->

# op-run: ClusterOrchestrator 指示書 (ADR-0016)

ClusterOrchestrator は **1 クラスターの完全ライフサイクル** を担う独立 agent である。
main Claude が `Agent tool` で spawn し、以下の 10 フェーズを順番に実行して
compact summary を返す。controller との通信は起動時の入力 payload と返却時の compact summary のみ。

> 決定1: 各クラスターを管理する ClusterOrchestrator を main Claude が Agent tool で spawn する。
> controller は fanout 結果の全 finding / review raw data を保持しない。
> marker 組立も ClusterOrchestrator が担い、controller は marker URL だけを受け取る。

---

## フェーズ0: 受け取り payload schema (入力契約)

### 入力

controller から以下の payload を受け取る。

```typescript
interface ClusterOrchestratorInput {
  // クラスター識別
  cluster_id: string;          // clustering で確定した ID
  id_short:   string;          // ログ / label 用短縮 ID

  // 担当 Issues
  issues: number[];            // このクラスターが close する Issue 番号

  // apply-expert 情報
  expert:          string;     // active apply expert 名 (1-2-d 正規化済)
  model:           string;     // model-selection.md §6 で controller が決定
  module:          string;     // ドメイン / モジュール名 (clustering 由来)
  worktree_path:   string;     // op run worktree-provision 済みのパス

  // 探知フェーズ (2-A) 結果
  investigation_report:    object;   // discoverOut.reports[] の該当エントリ
  files_likely_to_modify:  string[]; // Stage 2 競合検出後のファイル候補
  files_allowed:           string[]; // scope_in 相当
  files_forbidden:         string[]; // scope_out 相当

  // 実行制御
  base_sha:   string;  // OP_RUN_BASE_SHA。通常は controller がフェーズ0-base で確定するが、
                       // op-loop 等の上位 orchestrator が層ごとに前進させた SHA を注入する場合もある (ADR-0019 D6)。
  base_ref:   string;  // OP_RUN_BASE_REF。base_sha と整合していること (整合責務は呼出側)。
  ts:         string;  // bundle-level run timestamp
  session_id: string;  // OP_RUN_SESSION_ID (controller がフェーズ4-2-pre-2 で払い出し)
}
```

### 実行

受け取り直後に以下を確認して fail-fast する。

```bash
# 必須フィールドの存在確認 (空・未設定は即停止)
: "${CLUSTER_ID:?cluster_id is required}"
: "${WORKTREE_PATH:?worktree_path is required}"
: "${BASE_SHA:?base_sha is required}"
: "${SESSION_ID:?session_id is required — controller が払い出す必須値}"

# worktree が実在することを確認
test -d "${WORKTREE_PATH}" || {
  echo "❌ worktree が存在しません: ${WORKTREE_PATH}" >&2
  exit 1
}
```

### 返却

フェーズ8 (compact summary) まで内部に保持し、最終フェーズで返却する。

---

## フェーズ1: Issue 読込

> 決定1 (継続): ClusterOrchestrator は担当 Issue の指示書を自力で読み取る。
> controller は Issue 本文を ClusterOrchestrator に転送しない (context 節約)。

### 入力

`issues[]` の番号リスト。

### 実行

各 Issue について `op issue view <N>` で本文を取得し、以下を抽出する。

```bash
for ISSUE_NO in ${ISSUES[@]}; do
  ISSUE_BODY=$(op issue view "$ISSUE_NO" --plain)

  # op-domain / op-source / op-run-expert marker を確認
  ISSUE_DOMAIN=$(printf '%s\n' "$ISSUE_BODY" \
    | grep -oE '<!-- op-domain:[[:space:]]*[a-z-]+' | head -1 \
    | sed -E 's/.*op-domain:[[:space:]]*//')

  # 指示書節 (goal / scope_in / scope_out / acceptance_criteria /
  # recommendation / verification_steps) を抽出して apply-expert 向け prompt に組み込む
done
```

抽出した指示書節は apply-expert spawn 時の prompt に埋め込む。
Issue に指示書節が存在しない場合は `needs_human_decision` (decision_type: "scope") を
compact summary に記録して ClusterOrchestrator のライフサイクルを停止する (apply しない)。

### 返却

抽出した `issue_directives_text` (issues ごとの指示書節結合文字列)。

---

## フェーズ2: apply-expert spawn

> 決定3 (前半): apply-expert は実装・commit・push を完了し、その後 Skill(code-review) 自己検証を行う。
> apply 指示書の詳細は `references/apply-prompt-directives.md` の common 節 +
> 当該 expert 節を pointer 参照する (#739 で自己検証節が追記される前提)。

### 入力

- `worktree_path` (provision 済み)
- `expert` / `model`
- フェーズ1 で抽出した `issue_directives_text`
- `files_allowed` / `files_forbidden`

### 実行

Agent tool で apply-expert を spawn する。`subagent_type` は **plugin scoped 名** `"op-skill:${EXPERT}"`
を渡す (`${EXPERT}` は payload の bare expert 名。前置は spawn 境界のみで、`apply-prompt-directives.md`
の `${EXPERT}` 節 lookup 等には bare 名を使う。正本は `_shared/expert-spawn.md`「Plugin scoped-name 規約」)。
prompt は以下の 3 層で構成する。

```
【構造層】
- 作業ディレクトリ: ${WORKTREE_PATH}
- 担当 Issue: ${ISSUES[@]}
- scope_in: ${FILES_ALLOWED[@]}
- scope_out: ${FILES_FORBIDDEN[@]}
- base_sha: ${BASE_SHA} (すべての変更はこの SHA から分岐すること)

【指示書層】
- `references/apply-prompt-directives.md` の common 節に従う
- `references/apply-prompt-directives.md` の ${EXPERT} 節に従う

【Issue 指示書層】
${ISSUE_DIRECTIVES_TEXT}

【完了条件】
- 実装が完了したら commit する (push は ClusterOrchestrator が行う)
- commit 後、Skill(code-review, --high) で自己検証を実施する (フェーズ3 参照)
- 完了報告に commits_added (SHA 配列) を必ず含める
```

apply-expert は commit するが **push しない** (push は ClusterOrchestrator がフェーズ4 で行う)。

> **無限待ち禁止**: background child (apply-expert) が rest 状態になり構造化完了報告が遅延しても、
> ClusterOrchestrator は無限待ちしない。git log / worktree 状態 / PR 情報から
> フェーズ完了を確認できた場合はそれを根拠に次フェーズへ進む。
> controller からの relay SendMessage に依存しない。

### 返却

apply-expert の完了報告から以下を抽出して保持する。

- `commits_added: string[]` — 追加されたコミット SHA の配列 (空は contract violation)
- `self_review_result: "pass" | "needs_fix" | "skip"` — フェーズ3 の自己検証結果

---

## フェーズ3: apply-expert 自己検証 (Skill(code-review, --high))

> 決定3: apply-expert は実装・commit 完了後に Skill(code-review, --high) を自己検証として走らせる。
> Critical/High が出た場合は apply-expert 自身が修正してから ClusterOrchestrator に返す。
> Medium/Low は review 工程に委ねる (自己検証での過剰ブロックを防ぐ)。

### 入力

フェーズ2 の apply-expert 完了報告 (`commits_added` が 1 件以上あること)。

### 実行

apply-expert spawn 時の prompt に自己検証指示を含める (フェーズ2 の指示書層に組み込み済み)。
自己検証の scope は apply-expert が変更した worktree の diff のみ。

```
【自己検証指示 (apply-expert prompt に含める)】
実装・commit が完了したら、以下を実行する:

1. Skill(code-review, --high) を起動する
   - scope: commit で変更したファイルの diff のみ
2. 結果を確認する:
   - Critical / High が出た場合: 自力で修正して追加 commit し、自己検証を再実行する
     (再実行は 1 回まで。2 回目の Critical/High は ClusterOrchestrator に戻す)
   - Medium / Low のみ: そのまま完了報告に含める (review 工程で処理)
   - 問題なし: "pass" を完了報告の self_review_result に記録する
   - code-review 非該当 (例: ドキュメントのみの変更): "skip" を完了報告の self_review_result に記録する
```

apply-expert の Skill tool 利用は ADR-0016 PoC 2 で確認済み (Agent tool で spawn された
sub-agent でも Skill tool は利用可能)。

> **無限待ち禁止**: background child (apply-expert) が rest 状態になり自己検証結果の返却が遅延しても、
> ClusterOrchestrator は無限待ちしない。git log / worktree 状態 / PR 情報から
> フェーズ完了を確認できた場合はそれを根拠に次フェーズへ進む。
> controller からの relay SendMessage に依存しない。

### 返却

`self_review_result: "pass" | "needs_fix" | "skip"` を compact summary に転記する。
- `skip`: code-review 非該当 (例: ドキュメントのみの変更) の場合に返す。フェーズ4 への進行は blocker なし。

---

## フェーズ4: PR 作成

### 入力

フェーズ3 が完了し `self_review_result` が `"pass"` / `"needs_fix"`(再検証済) / `"skip"`(code-review 非該当) のいずれかであること。

### 実行

ClusterOrchestrator が worktree から push し、PR を作成する。

```bash
# push (ClusterOrchestrator の責務)
: "${CLUSTER_ID:?}"
: "${WORKTREE_PATH:?}"
: "${BASE_SHA:?}"

export BRANCH_NAME="auto/${CLUSTER_ID}"
export BASE_REF="${BASE_REF:-main}"  # フェーズ0 の base_ref を使用 (OP_RUN_BASE_REF)
git -C "${WORKTREE_PATH}" push origin "${BRANCH_NAME}"

# PR タイトル / 本文の組み立て (_shared/pr-templates.md の「op-run: PR open テンプレ」に従う)
# タイトル形式: `<業務領域>: <利用者から見える変更> [#<issues>]`
# または refactor 等: `<type>(<scope>): <summary> [#<issues>]`
# 本文: 二層構造 (上半分=非エンジニア向け / 下半分=エンジニア向け技術詳細)
#       + 検証レベル別記録 (Static / Unit / Build / Integration)
# 詳細フォーマットは `_shared/pr-templates.md` を参照すること
PR_TITLE="<タイトルを _shared/pr-templates.md の規則に従い組み立てる>"
PR_BODY="<本文を _shared/pr-templates.md の PR open テンプレに従い組み立てる>"
export PR_TITLE
export PR_BODY

PR_CREATE_JSON=$(printf '%s' "$PR_BODY" | op pr create \
  --base "${BASE_REF}" \
  --head "${BRANCH_NAME}" \
  --title "${PR_TITLE}" \
  --body-file -)

# mcp channel: op pr create は call-spec を emit する。ClusterOrchestrator 自身が実行者として
# github-channel.md §3-§4 の protocol (verbatim MCP 実行 → read-back → `op pr ingest-result`) を
# 隔離 context 内で完遂してから envelope を得る (実行者定義・往復手順の正本は github-channel.md §4)。
# gh channel ではそのまま envelope が返る (fence 構造は無改変)。
export PR_URL=$(printf '%s' "$PR_CREATE_JSON" | jq -r '.details.url // empty')
export PR_NUMBER=$(printf '%s' "$PR_CREATE_JSON" | jq -r '.details.pr_number // empty')
```

PR body は `_shared/pr-templates.md` の「op-run: PR open テンプレ」に準拠する。
二層構造 (上半分=非エンジニア向け / 下半分=エンジニア向け技術詳細) と
検証レベル別記録 (Static / Unit / Build / Integration) は必須。

#### auto-fix label 付与 (PR 作成直後)

`op pr create` は (gh channel でも mcp channel でも) label 付与を行わない
(mcp channel は `--label` を意図的に block する)。ClusterOrchestrator は PR 作成直後に
必ず `auto-fix` label を付与する (第五波 5a dogfood で観測された「mcp 経路の PR に
auto-fix label が付かない」gap の解消、ADR-0024 検証実績節 / ADR-0027)。

対象は **PR** (Issue ではない) のため、必ず `op pr edit-labels` を使う (`op issue edit-labels` の
`issue_labels` kind は mcp channel で ingest の `url_matches_issue` が PR の `/pull/N` を拒否して
必ず block する構造的欠陥 = Issue #61 のため使わない。`op pr edit-labels` は `pr_labels` kind に載り
`op pr ingest-result` / `url_matches_pull_request` が `/pull/N` を受理する)。

```bash
# gh channel: 通常の label add (plain。review label 遷移ではないため label-transition ではなく edit-labels)
op pr edit-labels --pr "$PR_NUMBER" --add "auto-fix"

# mcp channel: 直前に fresh な search_pull_requests item を素材として取得し --input-json で渡す
# (PR labels の正準素材は search_pull_requests、github-channel.md §6「PR (pull_request) の read 層」)。
# 素材取得 → --input-json 付与 → call-spec 往復 (verbatim 実行 → read-back → ingest) は
# ClusterOrchestrator 自身が github-channel.md §3-§4 の protocol に従い隔離 context 内で完遂する。
# call-spec は expect.kind = "pr_labels" で emit され、ingest は `op pr ingest-result` で成立する。
op pr edit-labels --pr "$PR_NUMBER" --add "auto-fix" --input-json "<fresh search_pull_requests item>"
```

label 付与に失敗した場合は `pending_label` (フェーズ8 compact summary) に `"auto-fix"` を記録し、
controller 側 2-E-3 の補完回収に委ねる (silent skip しない)。

### 返却

`pr_url: string` / `pr_number: number`。フェーズ5 以降で使用する。

---

## フェーズ5: review_round 取得

> 決定7: review round の検出・管理を controller から ClusterOrchestrator に移管する。
> ClusterOrchestrator は起動時ではなく PR 作成後に `<!-- op-review-state -->` 文書 (`op review state pull`)
> の `attempts[]` を読み、review_round を取得する (ADR-0027 6b、旧 `op-review-meta` コメント走査は廃止)。
> 新規 PR (round 0 = attempt なし) は round 1 から開始する。

### 入力

フェーズ4 で確定した `PR_NUMBER`。

### 実行

`global-review-spawn.md §4-2-pre` のロジックに従い `review_round` を取得する。
具体的には `op review state pull --pr $PR_NUMBER` の `attempts[].review_round` の最大値を
`PREV_ROUND` として取得し、`REVIEW_ROUND=$((PREV_ROUND + 1))` とする (同一 round の重複 entry の
tie-break = `reviewed_at` 最新採用は CLI / op-core 側に内蔵)。

round 上限管理も同節に従う。

```bash
# review_round 算出 (global-review-spawn.md §4-2-pre のロジックに従う)
# 詳細 bash 実装は global-review-spawn.md §4-2-pre を参照する (丸コピー禁止)。

MAX_REVIEW_FIX_ROUNDS=2

# REVIEW_ROUND が上限を超えた場合 → フェーズ8 terminal 処理へ
if [ "$REVIEW_ROUND" -gt "$((MAX_REVIEW_FIX_ROUNDS + 1))" ]; then
  export REVIEW_TERMINAL=1
else
  export REVIEW_TERMINAL=0
fi
export REVIEW_ROUND
```

### 返却

`REVIEW_ROUND` / `REVIEW_TERMINAL` (後続フェーズで使用)。

---

## フェーズ5.5: post-check dispatch

> (open_question #5 回答により追加)
> review spawn (フェーズ6) の前に post-check を実施し、
> 結果に応じて review_mode (full / light-after-security-postcheck) を選ぶ。

### 入力

`PR_NUMBER` / `PR_URL`。

### 実行

`references/post-check-dispatcher.md` のロジックに従い、当該 PR の `op-post-check-expert` marker を
読んで post-check expert の要否を判定する。

```bash
# post-check 要否判定 (post-check-dispatcher.md §判定ロジックに従う)
# 詳細実装は post-check-dispatcher.md を参照する (丸コピー禁止)。

# security post-check が PASS / PASS_WITH_NOTES なら light モードに切り替える
# legacy skip (audit_result: SKIPPED) の場合は full に倒す
#
# ADR-0027 6b: 判定元を PR コメント走査 (grep) から state 文書 (`op review state pull`) の
# post_checks map 読みへ置換。gh channel は fetch 内蔵、mcp channel は fresh search_pull_requests
# 素材を REVIEW_STATE_INPUT_JSON に用意して --input-json で渡す。
REVIEW_STATE_JSON=$(op review state pull --pr "$PR_NUMBER" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"})
POST_CHECK_SECURITY_RESULT=$(printf '%s' "$REVIEW_STATE_JSON" \
  | jq -r '.details.state.post_checks["security-expert"].audit_result // "SKIPPED"')

if [ "$POST_CHECK_SECURITY_RESULT" = "PASS" ] \
   || [ "$POST_CHECK_SECURITY_RESULT" = "PASS_WITH_NOTES" ]; then
  export REVIEW_MODE="light-after-security-postcheck"
else
  export REVIEW_MODE="full"
fi
```

### 返却

`REVIEW_MODE: "full" | "light-after-security-postcheck"` (フェーズ6 で使用)。

---

## フェーズ6: review-expert spawn

> 決定4: Round 2 以降の review は fix diff のみを対象とする。
> Round 1: full PR diff を渡す (全 lens)。
> Round 2+: 前 round の fix commit diff のみを渡す + ADR-0015 lens 選択 + core 3 lens 常時維持。

### 入力

- `PR_NUMBER` / `REVIEW_ROUND` / `REVIEW_MODE` / `SESSION_ID`
- フェーズ5 の `REVIEW_TERMINAL` (= 0 であること。= 1 なら本フェーズをスキップしフェーズ7 terminal へ)

### 実行

**review_round が上限を超えている場合はこのフェーズに入らない。**

```bash
if [ "$REVIEW_TERMINAL" = "1" ]; then
  echo "⏭️ REVIEW_TERMINAL=1 のため review-expert spawn をスキップ。フェーズ7 terminal 処理へ。" >&2
  # → フェーズ7 の terminal 処理 (round >= 3 / REVIEW_TERMINAL = 1) へ移行する
  # bash 関数ではなくフェーズ7 の terminal 分岐節に制御を渡す (本フェーズの残処理をスキップ)
  export VERDICT="terminal_new_pr"
  # フェーズ7 terminal 処理節を実行 (VERDICT を terminal_new_pr として直接フェーズ7 terminal 節へ)
fi
[ "$REVIEW_TERMINAL" != "1" ] || return 0  # REVIEW_TERMINAL=1 なら以降の review spawn 処理をスキップ
```

#### review worktree 作成

`global-review-spawn.md §4-1` のロジックに従い、PR head SHA を detach checkout した
review worktree を作成する。`stale head 回避 (#651)` の poll ロジックも同節に従う。

#### review_model 決定

`global-review-spawn.md §4-1-b` の narrow opt-down 5 条件 AND に従い `REVIEW_MODEL` を確定する。

#### OP_RUN_SESSION_ID 確認

`global-review-spawn.md §4-2-pre-2` に従う。`SESSION_ID` は controller が払い出した値を使い、
ClusterOrchestrator 内部で新規生成しない。

#### active lens 決定 (Round 2+)

Round 2 以降は `review-fix-loop.md §4.5-5` の差分 lens 和集合ロジックに従い
`active_lens_keys` を確定する (前 round finding lens ∪ fix domain lens ∪ core 3)。
Round 1 は `global-review-spawn.md §4-2-a-pre2` の tier 判定に従う。

#### fix diff 生成 (Round 2+ のみ、決定4)

> 決定4: Round 2 以降の review は fix diff のみを対象とする。

Round 2 以降は前 round の `reviewed_head_sha` を `ROUND_BASE_SHA` として用い、
その時点から現 HEAD までの diff のみを review-expert に渡す。

```bash
if [ "$REVIEW_ROUND" -ge 2 ]; then
  # ROUND_BASE_SHA = 前 round で review-expert が審査した HEAD SHA
  # 取得元: 前 round の op-review-meta コメントの reviewed_head_sha フィールド
  #          (global-review-spawn.md §4-2-pre のロジックで取得した最新 op-review-meta から読む)
  : "${ROUND_BASE_SHA:?前 round の reviewed_head_sha を op-review-meta コメントから取得すること}"
  REVIEW_DIFF=$(git -C "${REVIEW_WT}" diff "${ROUND_BASE_SHA}".."${PR_HEAD_SHA}")
  export REVIEW_MODE_EFFECTIVE="fix_diff_only"
  export REVIEW_DIFF
else
  # Round 1: PR 全体 diff (REVIEW_MODE は フェーズ5.5 で決定した full / light-after-security-postcheck)
  export REVIEW_MODE_EFFECTIVE="${REVIEW_MODE}"
fi
```

#### review-expert を Agent tool で spawn

`subagent_type` は **plugin scoped 名** `"op-skill:review-expert"` を渡す
(`_shared/expert-spawn.md`「Plugin scoped-name 規約」)。

```
【review-expert spawn prompt の骨格 (global-review-spawn.md §4-2 に準拠)】
- 作業ディレクトリ: ${REVIEW_WT}
- PR 番号: ${PR_NUMBER}
- review_round: ${REVIEW_ROUND}
- review_mode: ${REVIEW_MODE_EFFECTIVE}    # Round 1= full|light-after-security-postcheck / Round 2+= fix_diff_only
- op_run_session_id: ${SESSION_ID}
- review対象 SHA: ${PR_HEAD_SHA}
- round_base_sha: ${ROUND_BASE_SHA:-}      # Round 2+ のみ (fix diff の起点 SHA)
- fix_diff: ${REVIEW_DIFF:-}               # Round 2+ のみ (前 round HEAD からの diff)
- active_lens_keys: ${ACTIVE_LENS_KEYS[@]}   # Round 2+ のみ
- lens_bundles: ${LENS_BUNDLES[@]}            # Round 2+ のみ
- carryover_findings: [...]                   # Round 2+ のみ (未解決 High/Critical)

禁止: コード編集 / commit / push / PR 本文編集 / label 操作
目的: global review。7 lens (または active lens) で PR 全体を審査し
      op-review-meta / op-review-finding を PR コメントに投稿する。
```

#### marker 投稿 + state push (controller 役割として ClusterOrchestrator が担う、ADR-0027 6b)

`global-review-spawn.md §4-2-b` のロジックに従い、review-expert が返す構造化 `reviews[]` から
単一の `<!-- op-review-meta -->` + 連番 `<!-- op-review-finding -->` を組み立て、
Marker Publish Validate を実施してから PR に 1 回投稿する (人間向け監査ログ)。

`<!-- op-review-meta -->` の schema は `_shared/markers/review-markers.md` が正本。
ClusterOrchestrator は schema から逸脱しない。`op-review-meta` は review-expert の値のみ反映し、
ClusterOrchestrator が偽造しない (terminal 時は `<!-- op-review-controller-meta -->` を使う)。

**machine 正本は state 文書 (ADR-0027 6b)**:

- **approve path**: `op review publish-approval` が marker 組立 / marker-lint 自己検証 / コメント投稿 /
  `pro-reviewed` 付与に加え、**state push (attempt payload) を atomic に内包する**。ClusterOrchestrator が
  別途 `op review state push` を呼ぶ必要はない (1 コマンドで完結)。
- **non-approve path** (needs-fix / needs-specialist-review / blocked): comment 投稿 (`op pr comment`) の後、
  ClusterOrchestrator が明示的に `op review state push --pr <N> --apply-json <attempt payload>
  --write-id "${OP_RUN_SESSION_ID}-r${REVIEW_ROUND}-attempt" --session "$OP_RUN_SESSION_ID"` を呼ぶ
  (attempt payload の findings[] は review-expert の `reviews[].findings[]` から summary/file/evidence を
  含めて転写する。詳細実装は `global-review-spawn.md §4-2-b` を参照、丸コピー禁止)。

### 返却

`review_result: "approve" | "needs-fix" | "needs-specialist-review" | "blocked"`
(後続フェーズで verdict 集約に使用)。
正本: `_shared/markers/review-markers.md` L83 / `skills/expert-review/` の 4 値 enum に準拠。
`approve_with_followup` は ClusterOrchestrator の verdict 値であり `review_result` ではない。

加えて、review-expert の構造化返却 (`reviews[]`) から以下を抽出してフェーズ7 / フェーズ8 で使用する:

```bash
# reviews[] は review-expert が返す構造化結果配列 (JSON)
# REVIEW_RESULT_JSON: review-expert の完了報告 JSON を変数に保持していること

# CRITICAL_COUNT: Critical severity の finding 件数
export CRITICAL_COUNT=$(echo "$REVIEW_RESULT_JSON" \
  | jq '[.reviews[]?.findings[]? | select(.severity == "Critical")] | length')

# MEDIUM_LOW_FINDINGS_SUMMARY: Medium/Low finding の要約テキスト (approve_with_followup 時の follow-up Issue 本文に使用)
MEDIUM_LOW_FINDINGS_SUMMARY=$(echo "$REVIEW_RESULT_JSON" \
  | jq -r '[.reviews[]?.findings[]? | select(.severity == "Medium" or .severity == "Low")
            | "- [\(.severity)] \(.title // .description // "finding")"] | join("\n")')
export MEDIUM_LOW_FINDINGS_SUMMARY

# BLOCKER_REASON: needs_human_decision 時の 1〜2 文要約 (決定2: finding 全文は渡さない)
BLOCKER_REASON=$(echo "$REVIEW_RESULT_JSON" \
  | jq -r '[.reviews[]?.findings[]? | select(.severity == "Critical")
            | .title // .description // "Critical finding"] | first // ""')
export BLOCKER_REASON
```

> **無限待ち禁止**: background child (review-expert) が rest 状態になり構造化返却が遅延しても、
> ClusterOrchestrator は無限待ちしない。git log / PR コメント / label 状態から
> フェーズ完了を確認できた場合はそれを根拠に次フェーズへ進む。
> controller からの relay SendMessage に依存しない。

---

## フェーズ7: verdict 分岐

> 決定5: review verdict を 3 値に再定義する。
> `approved` / `approve_with_followup` / `needs_human_decision` の 3 値で op-merge 到達を保証。
> `needs_human_decision` の適用条件を Critical security / data-loss finding のみに厳格化。

> 決定6: review_round == 3 (= MAX+1) を ClusterOrchestrator が検出したとき、
> 既存 PR close → 同 branch で新規 PR 作成 → counter reset の terminal 処理を自動実行する。

### 入力

フェーズ6 の `review_result` / `REVIEW_ROUND` / `REVIEW_TERMINAL`。

### 実行

#### verdict 集約テーブル

| 状況 | ClusterOrchestrator の動作 |
|------|--------------------------|
| `review_result = approve` かつ finding なし | verdict = `approved`。フェーズ8 compact summary へ |
| `review_result = approve` かつ Medium/Low finding 残存 | verdict = `approve_with_followup`。follow-up Issue を起票してフェーズ8 へ |
| Critical finding が security / data-loss ドメイン | verdict = `needs_human_decision`。フェーズ8 compact summary に `blocker_reason` を記録 |
| `review_result = needs-fix` かつ `REVIEW_ROUND < MAX+1` | `review-fix-loop.md §4.5` のロジックに従い apply expert に再委任。フェーズ2 に戻る |
| `review_result = needs-fix` かつ `REVIEW_ROUND >= MAX+1` | terminal 処理 (下記) |
| `review_result = needs-specialist-review` | verdict = `needs_human_decision`。specialist 判断が必要な旨を `blocker_reason` に記録し controller にエスカレーション |
| `REVIEW_TERMINAL = 1` | terminal 処理 (下記) |
| `review_result = blocked` | verdict = `needs_human_decision`。自動継続しない |
| **(6b 移行後、縮退)** state 経路 (`op review state pull/push`) 自体が例外的に成立しない (primitive 不在 / mcp 素材注入不能等) | verdict = `pr_open_degraded_mcp_channel`。`degrade_note` にどのフェーズで止めたかを 1 文記録しフェーズ8 へ (ADR-0027 6b で post-check / global review / Review Fix Loop は mcp channel でも state 文書経由で成立するようになったため、本 verdict は「state 経路も成立しない例外時」のみに縮退した。op-run/SKILL.md の段階degrade宣言節を参照) |

#### Re-apply ループ (needs-fix 時)

`review-fix-loop.md §4.5-1A` の finding.result 主語の状態遷移ロジックに従う。
apply expert 再委任 → push → post-check 再実行 → REVIEW_ROUND 再計算 → review 再 spawn のループを、
`REVIEW_ROUND <= MAX_REVIEW_FIX_ROUNDS + 1` の間繰り返す。

#### approve_with_followup 時の follow-up Issue 起票

> (open_question #4 回答) ClusterOrchestrator 自身が `gh issue create` で follow-up Issue を起票し、
> その URL を compact summary の `followup_issue_url` に入れる。
> review 由来 follow-up は enrichment 不要 (不変則8 は op-scan / op-patrol / op-plan 限定)。

```bash
# approve_with_followup: Medium/Low finding から follow-up Issue を起票する
# 起票時は op-domain / op-source marker を必ず埋める
FOLLOWUP_BODY="$(cat <<EOF
<!-- op-domain: ${ISSUE_DOMAIN} -->
<!-- op-source: op-run -->

## Follow-up: review で検出された Medium/Low finding の対応

本 Issue は PR ${PR_URL} の global review で検出された Medium/Low finding の
follow-up 対応を記録します。Critical/High は PR 内で解消済みです。

### 残存 finding

${MEDIUM_LOW_FINDINGS_SUMMARY}

### 参照
- 元 PR: ${PR_URL}
- review_round: ${REVIEW_ROUND}
EOF
)"

FOLLOWUP_CREATE_JSON=$(printf '%s' "$FOLLOWUP_BODY" | op issue create \
  --title "follow-up: ${CLUSTER_ID} review Medium/Low finding 対応" \
  --body-file - \
  --label "auto-report" \
  --ensure-labels)

# mcp channel: op issue create が call-spec を emit する場合も同じ protocol (github-channel.md §3-§4) を
# ClusterOrchestrator 自身が完遂する (verbatim MCP 実行 → read-back → `op issue ingest-result`)。
export FOLLOWUP_ISSUE_URL=$(printf '%s' "$FOLLOWUP_CREATE_JSON" | jq -r '.details.url // empty')
```

#### terminal 処理 (round >= 3 / REVIEW_TERMINAL = 1)

> 決定6 の自動実装: 人間が手動で close → 新規 PR を立て直す作業を不要にする。

```bash
# terminal 処理: 既存 PR close → 同 branch で新規 PR 作成
CONTROLLED_AT="$(date -Iseconds)"

# step 1: 既存 PR にコメントを投稿 (op-review-controller-meta で記録、人間向け監査ログ。
# op-review-meta は偽造しない)
op pr comment "$PR_NUMBER" --body "$(cat <<NOTE
<!-- op-review-controller-meta -->
controller_result: blocked
reason: review_round_over_limit
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
controlled_at: ${CONTROLLED_AT}
controller: cluster-orchestrator

## ⛔ Review Fix Loop 上限超過 — 新規 PR に移行します

\`review_round=${REVIEW_ROUND}\` が上限に達しました。
同一 branch で新規 PR を作成して review_round counter をリセットします。
NOTE
)"

# step 1.5: state 文書側 (機械正本) にも controller terminal state を記録する (ADR-0027 6b)。
# write_id は決定的キーのため再送は NO_OP で安全に冪等吸収される。
CONTROLLER_PAYLOAD=$(jq -n --arg reason "review_round_over_limit" \
  --argjson round "$REVIEW_ROUND" --arg at "$CONTROLLED_AT" \
  '{kind:"controller", value:{controller_result:"blocked", reason:$reason, review_round:$round, controlled_at:$at}}')
printf '%s' "$CONTROLLER_PAYLOAD" | op review state push --pr "$PR_NUMBER" \
  --apply-json - --write-id "${OP_RUN_SESSION_ID}-terminal" --session "$OP_RUN_SESSION_ID" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"} \
  || echo "⚠️ PR #${PR_NUMBER} への state push (controller terminal) が失敗しました (コメント監査ログは完了済み)" >&2

# step 2: 既存 PR を close (close 通知コメント → close の 2 step。op pr close は --comment を
# 持たない — mcp channel で comment+close を単一 call-spec にできないため意図的に分離)
op pr comment "$PR_NUMBER" --body "terminal: review_round 上限。新規 PR に移行します。"
op pr close --pr "$PR_NUMBER"

# step 3: 同一 branch で新規 PR を作成 (branch 削除なし、commit history 保持)
# mcp channel: op pr close / op pr create とも call-spec を emit しうる。フェーズ4 と同じ
# github-channel.md §3-§4 protocol (verbatim MCP 実行 → read-back → ingest) を CO が完遂する。
NEW_PR_CREATE_JSON=$(printf '%s' "$PR_BODY" | op pr create \
  --base "${BASE_REF}" \
  --head "${BRANCH_NAME}" \
  --title "${PR_TITLE}" \
  --body-file -)
NEW_PR_URL=$(printf '%s' "$NEW_PR_CREATE_JSON" | jq -r '.details.url // empty')
NEW_PR_NUMBER=$(printf '%s' "$NEW_PR_CREATE_JSON" | jq -r '.details.pr_number // empty')

export VERDICT="terminal_new_pr"
export NEW_PR_URL
export NEW_PR_NUMBER
```

**重要**: ClusterOrchestrator は terminal_new_pr を compact summary で返した後、
自動再 review を走らせない。controller がユーザーに新規 PR URL を提示し、
次回の op-merge または op-run 起動を案内する (自動再 review は無限再帰の危険があるため)。

### 返却

確定した `verdict` / `new_pr_url` (terminal 時) / `followup_issue_url` (approve_with_followup 時)。

---

## フェーズ8: compact summary 組立と返却

> 決定2: controller が受け取る情報はクラスターごとに ~200 bytes のみ。
> finding 全文 / review raw data は controller に渡さない。

### 入力

全フェーズの結果を集約する。

### 実行

以下の compact summary を組み立てて controller に返却する。

```typescript
interface ClusterSummary {
  cluster_id:           string;
  pr_url:               string | null;
  verdict:              "approved" | "approve_with_followup" | "needs_human_decision" | "terminal_new_pr" | "pr_open_degraded_mcp_channel";
  round:                number;
  new_pr_url?:          string;       // verdict = terminal_new_pr 時のみ
  followup_issue_url?:  string;       // verdict = approve_with_followup 時のみ
  critical_count:       number;       // Critical finding の件数
  blocker_reason?:      string;       // verdict = needs_human_decision 時のみ (1〜2 文の要約。finding 全文ではない)
  pending_label?:       string | null;  // CO が貼れなかった label (例: "pro-reviewed")
  unfiled_followup?:    {               // CO が起票できなかった follow-up
    title:  string;
    body:   string;
    labels: string[];
  } | null;
  degrade_note?:        string;       // verdict = pr_open_degraded_mcp_channel 時のみ (段階degrade宣言の要約 1 文)
}
```

`pending_label` / `unfiled_followup` は CO が write 操作 (label 付与 / Issue 起票) に失敗した場合のみ
非 null 値を埋める。成功時は null を出力すること (controller 側 2-E-3 で補完回収される)。

`verdict = "pr_open_degraded_mcp_channel"` は ADR-0024 第五波 5a dogfood で実測された非 schema 値を
正式 schema 値へ昇格したもの (ADR-0027 6a)。**6b (本 wave) で post-check / global review /
Review Fix Loop が state 文書経由で mcp channel でも成立するようになったため、本 verdict の
適用条件は縮退した**: 「mcp channel だから」という理由だけでは到達せず、**state 経路自体が
例外的に成立しない場合** (`op review state pull/push` primitive 不在、mcp 素材注入が構造的に
不能等) にのみ到達する。`degrade_note` にどのフェーズで・なぜ止めたかを 1 文で記録する
(例: `"op review state push (mcp) 素材注入不能のため controller terminal push 未実施"`)。
approve を捏造しないための明示 verdict であり、controller はこれを `needs_human_decision` と
同様に人間へ提示し、ローカル (gh channel) セッションでの後続実施を案内する。

**`blocker_reason` は 1〜2 文の要約のみ**。finding 全文を controller に渡さない (決定2 の core 制約)。

### 返却

ClusterOrchestrator の最終出力として compact summary を返す。

```bash
# compact summary を JSON で組み立てて stdout に出力
jq -n \
  --arg cluster_id      "$CLUSTER_ID" \
  --arg pr_url          "${PR_URL:-null}" \
  --arg verdict         "$VERDICT" \
  --argjson round       "$REVIEW_ROUND" \
  --argjson critical_count "$CRITICAL_COUNT" \
  --arg new_pr_url      "${NEW_PR_URL:-}" \
  --arg followup_url    "${FOLLOWUP_ISSUE_URL:-}" \
  --arg blocker_reason  "${BLOCKER_REASON:-}" \
  --arg pending_label   "${PENDING_LABEL:-}" \
  --argjson unfiled_followup "${UNFILED_FOLLOWUP_JSON:-null}" \
  --arg degrade_note    "${DEGRADE_NOTE:-}" \
  '{
    cluster_id:    $cluster_id,
    pr_url:        (if $pr_url == "null" then null else $pr_url end),
    verdict:       $verdict,
    round:         $round,
    critical_count: $critical_count,
    new_pr_url:         (if $new_pr_url      == "" then null else $new_pr_url      end),
    followup_issue_url: (if $followup_url    == "" then null else $followup_url    end),
    blocker_reason:     (if $blocker_reason  == "" then null else $blocker_reason  end),
    pending_label:      (if $pending_label   == "" then null else $pending_label   end),
    unfiled_followup:   $unfiled_followup,
    degrade_note:       (if $degrade_note    == "" then null else $degrade_note    end)
  }'
# PENDING_LABEL: gh pr edit --add-label が失敗した場合に label 名をセットする (例: "pro-reviewed")
# UNFILED_FOLLOWUP_JSON: gh issue create が失敗した場合に {"title":...,"body":...,"labels":[...]} をセットする
# DEGRADE_NOTE: verdict = pr_open_degraded_mcp_channel 時のみ、止めたフェーズの 1 文要約をセットする (ADR-0027)
# いずれも成功時 (または非該当 verdict 時) は空文字 / null のまま (controller 側 2-E-3 で補完回収される)
```

---

## 参照ドキュメント (pointer 参照一覧)

本ファイルが「丸コピーせず pointer 参照」と宣言している既存資産の一覧。
変更時はこれらの正本側も確認すること (Single Canonical Source Rule)。

| 参照先 | 参照している節 | 用途 |
|--------|--------------|------|
| `references/apply-prompt-directives.md` (>=1) | フェーズ2 | apply-expert への load-bearing 指示 (common 節 + expert 節) |
| `references/global-review-spawn.md` (>=3) §4-1 | フェーズ6 | review worktree 作成 / stale head 回避 |
| `references/global-review-spawn.md` (>=3) §4-1-b | フェーズ6 | narrow opt-down 5 条件 / REVIEW_MODEL 決定 |
| `references/global-review-spawn.md` (>=3) §4-2-pre | フェーズ5 | review_round 算出 (trusted author + awk) |
| `references/global-review-spawn.md` (>=3) §4-2-pre-2 | フェーズ6 | OP_RUN_SESSION_ID 確認 (controller 払い出し値を使う) |
| `references/global-review-spawn.md` (>=3) §4-2-a-pre2 | フェーズ6 | active lens / lens_bundles 決定 (Round 1) |
| `references/global-review-spawn.md` (>=3) §4-2-b | フェーズ6 | marker 組立 (単一 op-review-meta + 連番 finding + Marker Publish Validate) |
| `references/review-fix-loop.md` §4.5-1A | フェーズ7 | finding.result 主語の状態遷移 (needs-fix ループ) |
| `references/review-fix-loop.md` §4.5-2 | フェーズ7 | 再委任先 expert の決定 (判定優先順位 1-8) |
| `references/review-fix-loop.md` §4.5-5 | フェーズ6 | 差分 lens 和集合 (Round 2+ の active_lens_keys) |
| `references/post-check-dispatcher.md` (>=1) | フェーズ5.5 | post-check 要否判定 / security post-check 実施 |
| `_shared/markers/review-markers.md` | フェーズ6 | op-review-meta / op-review-finding / op-review-controller-meta の field schema 正本 |
| `_shared/markers/labels-and-markers.md` (>=2) | フェーズ6/7 | marker Writer / op-source 値リスト / label 排他制御 |
| `_shared/pr-templates.md` | フェーズ4 | PR body テンプレ / PR タイトル規則 |
| `_shared/worktree-ops.md` | フェーズ0/4/6 | worktree ライフサイクル / cleanup ルール |
