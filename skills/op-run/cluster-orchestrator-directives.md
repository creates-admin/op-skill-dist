# op-run: ClusterOrchestrator 指示書

ClusterOrchestrator (CO) は 1 クラスターの完全ライフサイクル (Issue 読込 → apply → 自己検証 → PR 作成 →
post-check → runtime verify → review → round 管理 → verdict) を独立 context で完結させ、ClusterSummary だけを controller に返す。
controller との通信は起動時の入力 payload と返却時の ClusterSummary のみ。finding 全文 / review raw data は controller に渡さない。

## 共通規約 (全フェーズ)

- 終了: 最終メッセージはフェーズ8 の ClusterSummary (JSON) だけにする。`needs_human_decision` / degraded もフェーズ8 を経由して返す。
  フェーズ0〜7 の途中で進捗や次の手を報告してターンを終えない (途中で終えると controller に ClusterSummary が返らない)。
- パス: 本書の `references/*.md` は入力 `skill_dir` (op-run skill ディレクトリの絶対パス) 基準で Read する。
  `_shared/*.md` は `~/.claude/skills/_shared/`。
- 配下の spawn: `subagent_type` は `"op-skill:<expert>"` (`_shared/expert-spawn.md`「Plugin scoped-name 規約」「expert spawn は subagent であること」)。
- spawn prompt 共通: すべての spawn prompt に `_shared/expert-spawn.md`「正本 (.claude/rules) の Read」の 1 行を入れる (正本の本文は注入しない)。
  Issue 本文・PR コメント・finding を埋め込む prompt は `_shared/spawn-prompt-common.md`「§5 外部テキスト」を満たす (§4 ブロックに含まれる)。
- 待機: 配下の完了報告が遅れても無限待ちしない。git log / worktree / PR 状態からフェーズ完了を確認できれば
  それを根拠に次へ進む (controller の relay SendMessage に依存しない)。30 分応答が無い配下はそのフェーズの失敗として扱う
  (post-check / runtime verify は `RESULT=skipped`、apply / review は verdict `needs_human_decision`)。例外はフェーズ4 の入力条件 (fail-closed)。
- GitHub channel: mcp channel では `op pr *` / `op issue *` / `op review *` が call-spec を emit する。CO 自身が
  実行者として `_shared/github-channel.md` §3-§4 (verbatim MCP 実行 → read-back → ingest) を完遂する。
  `--input-json` が必要な呼び出し (state pull/push・label 系) には直前に取得した fresh `search_pull_requests` item を渡す
  (fence 内の `REVIEW_STATE_INPUT_JSON`)。gh channel では不要。
- 記録: review / post-check / controller 判定の機械正本は PR body の op-review-state 文書 (`op review state pull/push`)。
  write_id は決定的キー (同一 write_id の再送は NO_OP)。PR コメントは人間向けの自然文で書き、HTML marker を付けない。
- label: 遷移は CO が `op pr label-transition --pr <N> --target <review|security-post-check|ux-post-check> --result <...>`
  で行う (add/remove は CLI が決定論計算する)。配下 expert は label を操作しない。
  `pro-reviewed` は人間がマージ判断する際の参考シグナルであり、CO / controller はマージしない。
- 起票: CO は Issue を起票しない (follow-up は PR コメントと ClusterSummary に載せ、起票は人間が判断する)。
- model: CO は model を決め直さない (昇格・降格とも禁止)。

---

## フェーズ0: 入力 payload

```typescript
interface ClusterOrchestratorInput {
  cluster_id:   string;          // clustering で確定した ID
  id_short:     string;          // ログ / label 用短縮 ID
  task_id:      string;          // worktree-provision の task-id (`_shared/worktree-ops.md`)
  branch:       string;          // provision 済み branch (`auto/<task_id>`)
  skill_dir:    string;          // op-run skill ディレクトリの絶対パス (references/ の解決起点)
  issues:       number[];        // このクラスターが close する Issue 番号
  expert:       string;          // active apply expert (bare 名、1-2-d 正規化済)
  model:        string;          // controller が model-selection.md §6 で決定
  apply_model?: string;          // フェーズ2 の apply spawn 用。未指定なら model。
                                 //   "fable" は controller の 1-2-g で人間承認済みの cluster のみ
  module:       string;
  worktree_path: string;         // worktree-provision 済みのパス
  investigation_report:   object;   // 探知フェーズの該当エントリ
  files_likely_to_modify: string[];
  files_allowed:          string[]; // scope_in
  files_forbidden:        string[]; // scope_out
  base_sha:   string;            // OP_RUN_BASE_SHA (op-loop は層ごとに前進させた SHA を注入しうる)
  base_ref:   string;            // OP_RUN_BASE_REF (base_sha と整合させるのは呼出側の責務)
  ts:         string;            // bundle-level run timestamp
  session_id: string;            // OP_RUN_SESSION_ID (controller が払い出す)
  code_review_effort?: string;   // model-selection.md §5.5 由来。未指定 / auto なら effort 引数なし
}
```

最初に自分のツール一覧に Agent tool があるかを確かめる。無ければ Issue 読込・worktree・GitHub に一切触れず、
verdict `nested_spawn_unavailable` (`round: 0`, `critical_count: 0`, `pr_url: null`) でフェーズ8 へ進む
(`_shared/expert-spawn.md`「subagent 内からの spawn」)。

続けて fail-fast する。

```bash
: "${CLUSTER_ID:?}" "${TASK_ID:?}" "${BRANCH:?}" "${SKILL_DIR:?}"
: "${WORKTREE_PATH:?}" "${BASE_SHA:?}" "${BASE_REF:?}" "${SESSION_ID:?session_id は controller が払い出す}"
[ "$SESSION_ID" != "unknown" ] || { echo "❌ session_id=unknown は不可" >&2; exit 1; }
export OP_RUN_SESSION_ID="$SESSION_ID" OP_RUN_BASE_REF="$BASE_REF" OP_RUN_BASE_SHA="$BASE_SHA"
test -d "$WORKTREE_PATH" || { echo "❌ worktree が存在しません: $WORKTREE_PATH" >&2; exit 1; }
```

`OP_RUN_SESSION_ID` は CO / review-expert / テンプレで生成しない (入力の `session_id` だけを使う)。

---

## フェーズ1: Issue 読込

CO は担当 Issue を自力で読む (controller は本文を転送しない)。

```bash
for ISSUE_NO in "${ISSUES[@]}"; do op issue view "$ISSUE_NO" --plain; done
```

各 Issue から指示書節 (goal / scope_in / scope_out / acceptance_criteria / recommendation / verification_steps 等) と、
あれば `デザインモック: <URL>` 行を抽出し、`ISSUE_DIRECTIVES_TEXT` としてフェーズ2 の prompt に埋め込む。
指示書節が無い Issue があれば apply せず、verdict `needs_human_decision` (blocker_reason: scope 未定義) でフェーズ8 へ。

---

## フェーズ2: apply-expert spawn

- spawn model は `apply_model` (未指定なら `model`) をそのまま使う。難度が高く見えても `fable` に昇格しない。
- `apply_model == "fable"` は人間承認済みの意味。PR 本文の技術詳細に「apply は Fable (人間承認済み) で実行」と 1 行書く。
  Fable が rate limit / unavailable なら Opus に degrade して再試行せず、PR 本文にその旨を 1 行書く。
- `fable` はこのフェーズ (と review-fix loop の再 apply) 以外に波及させない (`_shared/model-selection.md`「§7.2 F3」)。

prompt:

```
invocation_mode: op_managed
【共通宣言】~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4 を含める (§2 は apply variant)。
作業対象のパスが決まったら、対応する .claude/rules/<feature>.md を Read ツールで開いてから着手すること (cat / grep では正本が読み込まれない)。

【構造】
- 作業ディレクトリ: ${WORKTREE_PATH}
- 担当 Issue: ${ISSUES[@]}
- scope_in: ${FILES_ALLOWED[@]}
- scope_out: ${FILES_FORBIDDEN[@]}
- base_sha: ${BASE_SHA} (すべての変更はこの SHA から分岐する)
- code_review_effort: ${CODE_REVIEW_EFFORT:-auto}

【指示書】${SKILL_DIR}/references/apply-prompt-directives.md の common 節 + ${EXPERT} 節 (本文を注入する)

【Issue 指示書】
${ISSUE_DIRECTIVES_TEXT}

【完了条件】commit まで行い push しない (push は ClusterOrchestrator が行う)。
```

返却から保持する値: `commits_added: string[]` (空は contract violation) / `self_review_result: "pass" | "needs_fix" | "skip"` /
`self_check_blocked: boolean`。

## フェーズ3: 自己検証

apply-expert がフェーズ2 の中で実施する。手順の正本は `references/apply-prompt-directives.md`「自己検証」節と
`_shared/apply-completion-checklist.md`「2-A. commit 先行経路」。CO は返却値を読むだけで、指示を重ねて書かない。

- `self_check_blocked: true` = 再検証後も Critical/High が残った、または修正不能。
- `status: completed` の完了報告で `self_review_result` / `self_check_blocked` が欠落、または完了報告自体が返らない場合は
  fail-closed: フェーズ4 に進まず、apply-expert に再返却を求めるか人間 gate へ回す
  (`status: blocked` / `partial` の escalation 報告はそのまま人間 gate)。

---

## フェーズ4: PR 作成

### 入力条件 (すべて満たす)

- `self_review_result` が `pass` / `needs_fix` (再検証済) / `skip`
- `self_check_blocked == false` (`true` なら PR を作らず人間 gate / 再委任)
- `COMMITS_ADDED_JSON` (commits_added の JSON 配列文字列) を保持している。フィールドが無い / 非 canonical な報告でも
  `'[]'` として下記 gate を実行する (skip しない)

### commit verify gate (push より前に実行)

```bash
: "${WORKTREE_PATH:?}" "${BRANCH:?}" "${BASE_REF:?}" "${COMMITS_ADDED_JSON:?}"
op apply verify-commit --worktree "$WORKTREE_PATH" --base-ref "$BASE_REF" \
  --reported-json "$COMMITS_ADDED_JSON"
```

exit 0 以外は push しない。`blocking_reasons` 別の分岐と retry・隔離手順は `_shared/apply-completion-verify.md` §2-3 / §3 / §4 に従う。

### push と PR open

```bash
git -C "$WORKTREE_PATH" push origin "$BRANCH"
PR_CREATE_JSON=$(printf '%s' "$PR_BODY" | op pr create --base "$BASE_REF" --head "$BRANCH" \
  --title "$PR_TITLE" --body-file -)
export PR_URL=$(printf '%s' "$PR_CREATE_JSON" | jq -r '.details.url // empty')
export PR_NUMBER=$(printf '%s' "$PR_CREATE_JSON" | jq -r '.details.pr_number // empty')
```

`PR_TITLE` / `PR_BODY` は `_shared/pr-templates.md`「op-run: PR open テンプレ」に従う (`Fixes #N` 必須。apply 報告の
`recommended_followup_experts[]` / `needs_human_decision` / `assumptions[]` / `blocked_actions[]` は「残存リスク / follow-up」に転記する)。
「自動検証」表の `Manual required` 行は `references/runtime-verify-dispatcher.md`「6.3」に従う (同書「1. 起動条件」をこの時点で評価する)。

### auto-fix label (PR 作成直後)

`op pr create` は label を付けない (mcp channel は `--label` を block する)。PR 対象なので `op pr edit-labels` を使う。

```bash
op pr edit-labels --pr "$PR_NUMBER" --add "auto-fix" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
```

失敗したら `pending_label: "auto-fix"` をフェーズ8 に記録する (silent skip しない)。

---

## フェーズ5: review_round 取得

`references/global-review-spawn.md` §4-2-pre の fence を実行して `REVIEW_ROUND` / `REVIEW_TERMINAL` を得る。
`REVIEW_TERMINAL=1` なら §4-2-pre-blocked の terminal 処理を行い、フェーズ5.5 / 5.7 / 6 を飛ばしてフェーズ8 へ (verdict `needs_human_decision`)。

---

## フェーズ5.5: post-check dispatch

`references/post-check-dispatcher.md` に従い、post_check_expert の要否判定 → active post-check の spawn
(prompt 本文は `references/post-check-prompts.md`) → label 遷移 → `op review state push` (post_check) を行う。
null / planned / unregistered は spawn しない。

state push を終えた後に review_mode を決める (push 前に読むと空で `full` に倒れる)。

```bash
REVIEW_STATE_JSON=$(op review state pull --pr "$PR_NUMBER" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"})
export REVIEW_MODE=$(printf '%s' "$REVIEW_STATE_JSON" | jq -r '
  (.details.state.post_checks // {}) as $p
  | ($p["security-expert"].audit_result // "SKIPPED") as $s
  | ($p["ux-ui-audit-expert@aux"].audit_result // "SKIPPED") as $a
  | if ($s == "PASS" or $s == "PASS_WITH_NOTES")
       and (($p["security-expert"].requires_aux_post_check // false) == false
            or $a == "PASS" or $a == "PASS_WITH_NOTES")
    then "light-after-security-postcheck" else "full" end')
```

---

## フェーズ5.7: runtime verify

`references/runtime-verify-dispatcher.md` に従い、起動条件の判定 → (Windows の lease) → verify-runner の spawn →
skip の扱いと証跡の実在確認 → 保留 stop の引き取りと lease の返却 → `op review state push` (`post_checks["verify-runner"]`) を行う。
起動条件に当たらなければ何もせずフェーズ6 へ進む。ハーネス未導入 / skipped でも PR は止めない。

`block` (シナリオの fail) なら review を呼ばず、同書「6.2」で apply expert に再委任してからフェーズ5.5 → 本フェーズをやり直す。
本フェーズは REVIEW_MODE (フェーズ5.5) を変えない。

---

## フェーズ6: review-expert spawn

`REVIEW_TERMINAL=1` ならこのフェーズに入らない。手順はすべて `references/global-review-spawn.md` に従う:

1. §4-1: PR head SHA を detach checkout した review worktree (`REVIEW_WT` / `PR_HEAD_SHA`)
2. §4-1-b: `REVIEW_MODEL` / `REVIEW_MODEL_REASON` と lens 判定入力
3. active lens: Round 1 は §4-2-a-pre2、Round 2+ は `references/review-fix-loop.md` §4.5-5
4. Round 2+ は fix diff のみを対象にする: `ROUND_BASE_SHA` = state 文書の前 round attempt の `reviewed_head_sha`
   (`jq -r '.details.state.attempts | max_by(.review_round) | .reviewed_head_sha'`)、
   `git -C "$REVIEW_WT" diff "$ROUND_BASE_SHA..$PR_HEAD_SHA"` を `fix_diff` として渡し、`review_mode` は `fix_diff_only`
5. §4-2-a: per-phase model 解決と spawn 値の契約で review-expert を spawn (`op-skill:review-expert`)
6. §4-2-b: 返却 `reviews[]` を publish (approve = `op review publish-approval` / それ以外 = 自然文コメント + state push + label)

review-expert はコード編集 / commit / push / PR 本文編集 / label 操作をしない。

返却 `review_result` は `approve` / `needs-fix` / `needs-specialist-review` / `blocked`
(`approve_with_followup` は CO の verdict であり review_result ではない)。後続用に次を抽出する。

```bash
# REVIEW_RESULT_JSON = review-expert の完了報告 JSON
export CRITICAL_COUNT=$(printf '%s' "$REVIEW_RESULT_JSON" \
  | jq '[.reviews[]?.findings[]? | select(.severity | ascii_downcase == "critical")] | length')
export FOLLOWUP_FINDINGS_JSON=$(printf '%s' "$REVIEW_RESULT_JSON" | jq -c '
  [.reviews[]?.findings[]? | select(.severity | ascii_downcase | . == "medium" or . == "low")
   | "[\(.severity)] \(.summary // .title // "finding")\(if .file then " (\(.file))" else "" end)"]')
export BLOCKER_REASON=$(printf '%s' "$REVIEW_RESULT_JSON" | jq -r '
  [.reviews[]?.findings[]? | select(.severity | ascii_downcase == "critical") | .summary // .title] | first // ""')
```

---

## フェーズ7: verdict 分岐

上から順に最初に該当した行を採る。

| 状況 | 動作 |
|---|---|
| `review_result = blocked`、または Critical finding が security / data-loss | verdict `needs_human_decision` (`blocker_reason` に 1〜2 文)。自動継続しない |
| `needs-fix` / `needs-specialist-review` かつ `REVIEW_TERMINAL=0` | `references/review-fix-loop.md` §4.5 (finding.result 主語)。再 apply → フェーズ4 の verify gate + push → 5.5 → 5.7 → 5 → 6 を繰り返す |
| `needs-fix` / `needs-specialist-review` かつ round 上限 | `global-review-spawn.md` §4-2-pre-blocked の terminal 処理。verdict `needs_human_decision` (blocker_reason: review_round 上限) |
| `approve` かつ follow-up なし | verdict `approved` |
| `approve` かつ follow-up あり (最終 round の Medium/Low finding + fix loop で specialist が `new-issue` とした finding を `FOLLOWUP_FINDINGS_JSON` に合流) | verdict `approve_with_followup`。下記の PR コメントを残し、`followup_findings` に載せる |
| state 経路 (`op review state pull/push`) 自体が成立しない (primitive 不在 / mcp 素材を注入できない等) | verdict `pr_open_degraded_mcp_channel`。止めたフェーズと理由を `degrade_note` に 1 文 |

needs_human_decision (terminal を含む) の PR は自動再 review せず、そのまま人間に委ねる。

### follow-up コメント (approve_with_followup)

Issue は起票しない。follow-up finding を人間向けの自然文で PR に 1 コメント残す (起票するかは人間が判断する)。

```bash
printf '%s' "$FOLLOWUP_FINDINGS_JSON" | jq -r --arg round "$REVIEW_ROUND" '
  "## review で残った follow-up finding (round \($round))\n\nPR 内では対応していません。Issue 化するかは人間が判断してください。\n\n"
  + (map("- " + .) | join("\n"))' | op pr comment "$PR_NUMBER" --body-file -
```

---

## フェーズ8: ClusterSummary 返却

```typescript
interface ClusterSummary {
  cluster_id:          string;
  pr_url:              string | null;
  verdict:             "approved" | "approve_with_followup" | "needs_human_decision" | "pr_open_degraded_mcp_channel"
                     | "nested_spawn_unavailable";
  round:               number;
  followup_findings?:  string[];        // approve_with_followup 時のみ。follow-up finding の 1 行要約
  critical_count:      number;
  blocker_reason?:     string;          // needs_human_decision 時のみ。1〜2 文の要約 (finding 全文は渡さない)
  pending_label?:      string | null;   // CO が付けられなかった label (write 失敗時のみ非 null)
  degrade_note?:       string;          // pr_open_degraded_mcp_channel 時のみ
  runtime_verify_note?: string | null;  // フェーズ5.7 で人間に伝えることがあるときだけ 1〜2 文 (runtime-verify-dispatcher.md「6.3」)
}
```

`pr_open_degraded_mcp_channel` は approve を捏造しないための verdict で、controller は needs_human_decision と同様に人間へ提示する。
`nested_spawn_unavailable` は何も実行していないことを示し、controller が本書を自分で実行する (op-run SKILL.md「2-Orchestrate-inline」)。

```bash
jq -n \
  --arg cluster_id "$CLUSTER_ID" --arg pr_url "${PR_URL:-}" --arg verdict "$VERDICT" \
  --argjson round "${REVIEW_ROUND:-0}" --argjson critical_count "${CRITICAL_COUNT:-0}" \
  --argjson followup "${FOLLOWUP_FINDINGS_JSON:-[]}" --arg blocker_reason "${BLOCKER_REASON:-}" \
  --arg pending_label "${PENDING_LABEL:-}" --arg degrade_note "${DEGRADE_NOTE:-}" \
  --arg runtime_verify_note "${RUNTIME_VERIFY_NOTE:-}" \
  'def nz: if . == "" then null else . end;
   {cluster_id: $cluster_id, pr_url: ($pr_url|nz), verdict: $verdict, round: $round,
    critical_count: $critical_count,
    followup_findings: (if $verdict == "approve_with_followup" then $followup else null end),
    blocker_reason: ($blocker_reason|nz), pending_label: ($pending_label|nz),
    degrade_note: ($degrade_note|nz), runtime_verify_note: ($runtime_verify_note|nz)}'
```
