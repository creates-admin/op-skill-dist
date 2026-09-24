# op-run: Global Review (フェーズ4)

ClusterOrchestrator (CO、`cluster-orchestrator-directives.md` フェーズ5-6) が実行する global review の手順。
review-expert は別 context・別 worktree の監査専任 (修正・commit・push・PR 本文編集・label 操作をしない)。
修正が要る場合は CO が specialist / apply expert に再委任する (`review-fix-loop.md`)。

### 4-1. レビュー用 worktree を別途作成

apply worktree とは別の worktree に PR head SHA を detach checkout する。
期待値は CO がローカルで push した branch の SHA。GitHub の `head_ref_oid` が追従するまで poll し、追従しなければローカルの SHA を採用する。

```bash
: "${PR_NUMBER:?}" "${TASK_ID:?}" "${BRANCH:?}" "${WORKTREE_PATH:?}" "${OP_RUN_REPO:?}"
REPO_NAME="${OP_RUN_REPO##*/}"
EXPECTED_HEAD_SHA=$(git -C "$WORKTREE_PATH" rev-parse --verify "refs/heads/${BRANCH}" 2>/dev/null || echo "")

PR_META=$(op pr view "$PR_NUMBER" --include meta)
BASE_REF=$(echo "$PR_META" | jq -r '.base_ref_name')
PR_HEAD_REF=$(echo "$PR_META" | jq -r '.head_ref_name')
PR_HEAD_SHA=$(echo "$PR_META" | jq -r '.head_ref_oid')

if [ -n "$EXPECTED_HEAD_SHA" ]; then
  POLL_N=0
  while [ "$PR_HEAD_SHA" != "$EXPECTED_HEAD_SHA" ] && [ "$POLL_N" -lt 5 ]; do
    sleep 3; POLL_N=$((POLL_N + 1))
    PR_HEAD_SHA=$(op pr view "$PR_NUMBER" --include meta | jq -r '.head_ref_oid')
  done
  [ "$PR_HEAD_SHA" = "$EXPECTED_HEAD_SHA" ] || PR_HEAD_SHA="$EXPECTED_HEAD_SHA"
fi
test -n "$BASE_REF" -a -n "$PR_HEAD_REF" -a -n "$PR_HEAD_SHA" || { echo "❌ PR #${PR_NUMBER} の base/head が解決できません" >&2; exit 1; }

# fork PR は対象外 (同一 repo branch 前提)
PR_HEAD_REPO_OWNER=$(echo "$PR_META" | jq -r '.head_repository_owner_login // empty')
BASE_REPO_OWNER=$(op repo info | jq -r '.details.owner')
if [ -n "$PR_HEAD_REPO_OWNER" ] && [ "$PR_HEAD_REPO_OWNER" != "$BASE_REPO_OWNER" ]; then
  echo "❌ fork PR (#${PR_NUMBER}) は op-run review の対象外です" >&2; exit 1
fi

# review-expert は origin/${BASE_REF} を読むため最新化する (base branch をハードコードしない)
git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"
git fetch origin "$PR_HEAD_REF"

export REVIEW_WT="${HOME}/cwork/worktrees/${REPO_NAME}/review-${TASK_ID}-pr-${PR_NUMBER}-$(date +%s)"
git worktree add --detach "$REVIEW_WT" "$PR_HEAD_SHA"
test "$(git -C "$REVIEW_WT" rev-parse HEAD)" = "$PR_HEAD_SHA" || {
  echo "❌ review worktree HEAD mismatch" >&2; git worktree remove --force "$REVIEW_WT"; exit 1; }
export PR_HEAD_SHA PR_HEAD_REF
```

### 4-1-b. review_model 決定 (narrow opt-down judgment)

`REVIEW_MODEL` (`opus` / `sonnet` のみ。global review は read-only のため cluster の Fable 昇格は波及しない) と
`REVIEW_MODEL_REASON`、後段の lens 判定入力 `REVIEW_LOC_COUNT` / `REVIEW_SENSITIVE_TOUCHED` /
`SENSITIVE_INVESTIGATE_SONNET` を確定する。条件・LOC 正規化・sensitive glob の正本は
`_shared/model-selection.md` §7.1 / §7.1.3 (`SENSITIVE_PATTERNS` は §7.1.3 の glob と一致させる)。

```bash
: "${OP_RUN_BASE_REF:?}" "${REVIEW_WT:?}" "${PR_NUMBER:?}"
PR_FILES_ARR=()
mapfile -t PR_FILES_ARR < <(op pr view "$PR_NUMBER" --include files | jq -r '.files[]?')

if [ "${#PR_FILES_ARR[@]}" -gt 100 ]; then
  # 100 files 超は safety default: opus + 7-lens フル
  export REVIEW_MODEL="opus" REVIEW_MODEL_REASON="large-pr-file-count"
  export REVIEW_LOC_COUNT=99999 REVIEW_SENSITIVE_TOUCHED=1
else
  NON_EXCLUDED_ARR=()
  mapfile -t NON_EXCLUDED_ARR < <(printf '%s\n' "${PR_FILES_ARR[@]}" \
    | grep -Ev '(\.lock$|\.svg$|\.png$|\.jpg$|\.webp$|/snapshot/|/__snapshots__/|/generated/|/vendor/|/node_modules/|/target/|/dist/|/build/)' || true)
  if [ "${#NON_EXCLUDED_ARR[@]}" -eq 0 ]; then
    export REVIEW_LOC_COUNT=0
  else
    LOC_STAT=$(git -C "$REVIEW_WT" diff --shortstat "origin/${OP_RUN_BASE_REF}...HEAD" -- "${NON_EXCLUDED_ARR[@]}")
    LOC_INS=$(printf '%s' "$LOC_STAT" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo 0)
    LOC_DEL=$(printf '%s' "$LOC_STAT" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo 0)
    export REVIEW_LOC_COUNT=$((LOC_INS + LOC_DEL))
  fi

  SENSITIVE_PATTERNS='(^|/)(migrations|auth|authentication|authorization|security|crypto|iam|capabilities|permissions|release|installer|updater|secrets)/|\.sql$|\.prisma$|(^|/)schema\.[^/]+$|(^|/)tauri\.conf\.json$|(^|/)scripts/release|(^|/)\.github/workflows/|^skills/_shared/|^agents/[^/]*\.md$|^op-tools/crates/|(^|/)LICENSE|(^|/)COPYRIGHT|(^|/)NOTICE|(^|/)\.env|(^|/)Cargo\.toml$|(^|/)package\.json$|(^|/)pubspec\.yaml$|(^|/)Cargo\.lock$|(^|/)VERSION$'
  # grep -c は no-match でも "0" を出して exit 1 する。`|| echo 0` を付けない
  export REVIEW_SENSITIVE_TOUCHED=$(printf '%s\n' "${PR_FILES_ARR[@]}" | grep -cE "$SENSITIVE_PATTERNS" || true)
  printf '%s' "$REVIEW_SENSITIVE_TOUCHED" | grep -Eq '^[0-9]+$' || export REVIEW_SENSITIVE_TOUCHED=0

  if [ "$REVIEW_LOC_COUNT" -le 100 ] && [ "$REVIEW_SENSITIVE_TOUCHED" -eq 0 ] \
     && [ "${OP_REVIEW_OPT_DOWN_DISABLE:-0}" != "1" ] && [ "${MODEL_DEGRADED:-0}" != "1" ]; then
    export REVIEW_MODEL="sonnet" REVIEW_MODEL_REASON="narrow-opt-down"
  else
    export REVIEW_MODEL="opus"
    if   [ "$REVIEW_LOC_COUNT" -gt 100 ];                 then export REVIEW_MODEL_REASON="large-pr-loc"
    elif [ "$REVIEW_SENSITIVE_TOUCHED" -ne 0 ];            then export REVIEW_MODEL_REASON="sensitive-path"
    elif [ "${OP_REVIEW_OPT_DOWN_DISABLE:-0}" = "1" ];     then export REVIEW_MODEL_REASON="kill-switch"
    elif [ "${MODEL_DEGRADED:-0}" = "1" ];                 then export REVIEW_MODEL_REASON="model-degraded"
    else export REVIEW_MODEL_REASON="default-opus"; fi
  fi

  # sensitive ∩ doc-only (.md / docs/ のみ、op-tools/crates は非 doc) ∩ small は investigate phase のみ sonnet に下げる
  CUMULATIVE_NONDOC=$(git -C "$REVIEW_WT" diff --name-only "origin/${OP_RUN_BASE_REF}...HEAD" \
    | grep -Ev '(\.md$|(^|/)docs/)' | wc -l | tr -d ' ')
  printf '%s' "$CUMULATIVE_NONDOC" | grep -Eq '^[0-9]+$' || CUMULATIVE_NONDOC=1
  if [ "$REVIEW_SENSITIVE_TOUCHED" -ne 0 ] && [ "$REVIEW_LOC_COUNT" -le "${OP_REVIEW_SMALL_MAX_LOC:-100}" ] \
     && [ "$CUMULATIVE_NONDOC" -eq 0 ] \
     && [ "${OP_REVIEW_OPT_DOWN_DISABLE:-0}" != "1" ] && [ "${MODEL_DEGRADED:-0}" != "1" ]; then
    export SENSITIVE_INVESTIGATE_SONNET=1
  fi
fi
export SENSITIVE_INVESTIGATE_SONNET="${SENSITIVE_INVESTIGATE_SONNET:-0}"
```

### 4-2. review-expert を別 context で spawn (post_check 結果に応じてモード分岐)

| review_mode | 適用条件 | Security/Abuse Lens |
|---|---|---|
| `full` | 下記以外 (post_check なし / ux-ui のみ / security SKIPPED) | 通常どおり |
| `light-after-security-postcheck` | state 文書 `post_checks["security-expert"]` が PASS / PASS_WITH_NOTES (aux 要求時は `post_checks["ux-ui-audit-expert@aux"]` も PASS / PASS_WITH_NOTES) | 「PR 全体として新たな露出面が増えていないか」のみ軽く |
| `fix_diff_only` | Round 2+ (`cluster-orchestrator-directives.md` フェーズ6 手順4) | active lens に従う |

判定 fence の正本は `cluster-orchestrator-directives.md` フェーズ5.5。post-check が SKIPPED の PR でも、review-expert は
SKIPPED だけを理由に `blocked` を返さない (`expert-review/references/result-decision.md`)。

#### 4-2-pre. review_round の計算 (司令官側、必須、state 文書ベース)

review_round は PR 全体での review attempt 通算 (head SHA で絞らない。絞ると fix のたびに round が 1 に戻り上限が効かない)。
上限は `max_review_fix_rounds = 2` → 許可 `review_round ≤ 3` (1 = 初回 / 2 = fix 1 回後 / 3 = fix 2 回後の最終)。
この fence が REVIEW_ROUND 算出と REVIEW_TERMINAL gate の唯一の実装で、Review Fix Loop の再 review 前にもそのまま再実行する。

```bash
: "${PR_NUMBER:?}"
REVIEW_STATE_JSON=$(op review state pull --pr "$PR_NUMBER" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"})
PREV_ROUND=$(printf '%s' "$REVIEW_STATE_JSON" | jq '[.details.state.attempts[]?.review_round] | max // 0')
printf '%s' "$PREV_ROUND" | grep -Eq '^[0-9]+$' || PREV_ROUND=0
export REVIEW_ROUND=$((PREV_ROUND + 1))
MAX_REVIEW_FIX_ROUNDS=2
if [ "$REVIEW_ROUND" -gt "$((MAX_REVIEW_FIX_ROUNDS + 1))" ]; then
  export REVIEW_TERMINAL=1   # review-expert を spawn せず 4-2-pre-blocked へ
else
  export REVIEW_TERMINAL=0
fi
```

`REVIEW_TERMINAL=1` のとき当該 PR の review-expert は spawn しない。失敗を `|| true` で握り潰さない。

#### 4-2-pre-blocked. terminal 処理

次のいずれかで実行する: (a) `REVIEW_TERMINAL=1`、(b) `review_round = 3` の結果が needs-fix / needs-specialist-review
(3 回目の fix はしない)。PR は close せず、`pro-review-blocked` を付けて停止し人間に委ねる。
review-expert の attempt は上書きしない (controller の判定は state 文書の `controller` として別に記録する)。

```bash
: "${PR_NUMBER:?}" "${REVIEW_ROUND:?}" "${OP_RUN_SESSION_ID:?}"
op pr label-transition --pr "$PR_NUMBER" --target review --result blocked \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
op pr comment "$PR_NUMBER" --body "Review Fix Loop の上限 (review_round=${REVIEW_ROUND}) に達したため自動修正を停止しました。Issue 分割 / scope 再定義 / 人間判断が必要です。" \
  || echo "⚠️ terminal コメント投稿に失敗 (label は更新済み)" >&2
jq -n --argjson round "$REVIEW_ROUND" --arg at "$(date -Iseconds)" \
  '{kind:"controller", value:{controller_result:"blocked", reason:"review_round_over_limit", review_round:$round, controlled_at:$at}}' \
  | op review state push --pr "$PR_NUMBER" --apply-json - --write-id "${OP_RUN_SESSION_ID}-terminal" \
      --session "$OP_RUN_SESSION_ID" ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
```

CO は verdict `needs_human_decision` (blocker_reason: review_round 上限) を返し、自動再 review しない。

#### 4-2-a. per-phase model 解決 + review-expert spawn (ClusterOrchestrator)

review-expert は PR ごとに prep (base-first digest) → lens-audit (lens 並列) → adversarial-verify (High/Critical を反証) →
synthesize (最終ゲート + backstop gap-check) を内部で実行し、構造化 `reviews[]` を返す。lens rubric / verdict 判定 /
evidence-policy は `expert-review` skill (review-expert に preload) が正本。CO は下記の値を確定して渡すだけ。

##### 4-2-a-pre. per-phase model

investigate = `REVIEW_MODEL` (sensitive doc-only small は sonnet)、verify / gate は常に opus (gate を安くして refuter で補う設計は採らない)。

```bash
: "${REVIEW_MODEL:?}" "${SENSITIVE_INVESTIGATE_SONNET:?}"
if [ "$SENSITIVE_INVESTIGATE_SONNET" = "1" ]; then export REVIEW_INVESTIGATE_MODEL="sonnet"
else export REVIEW_INVESTIGATE_MODEL="$REVIEW_MODEL"; fi
export REVIEW_VERIFY_MODEL="opus" REVIEW_GATE_MODEL="opus"
# investigate=opus の lens worker が構造化出力を返さなかった場合の再試行 model
if [ "$REVIEW_INVESTIGATE_MODEL" = "opus" ]; then export REVIEW_INVESTIGATE_FALLBACK_MODEL="sonnet"
else export REVIEW_INVESTIGATE_FALLBACK_MODEL="$REVIEW_INVESTIGATE_MODEL"; fi
```

`SENSITIVE_INVESTIGATE_SONNET=1` は investigate の model だけを下げる。lens 構成は変えない (sensitive PR は 7-lens フル)。

##### 4-2-a-pre2. active lens / bundle 解決 (Round 1)

lens 選択と model 選択は別軸。lens gate は `REVIEW_SENSITIVE_TOUCHED` と LOC tier に key し、`REVIEW_MODEL` を混ぜない
(混ぜると medium tier が到達不能になる)。Round 2+ は `review-fix-loop.md` §4.5-5 が決める。

```bash
: "${REVIEW_LOC_COUNT:?}" "${REVIEW_SENSITIVE_TOUCHED:?}" "${PR_NUMBER:?}"
PR_FILES_ARR=()   # 配列は fence を跨げないため再取得
mapfile -t PR_FILES_ARR < <(op pr view "$PR_NUMBER" --include files | jq -r '.files[]?')
eval "$(op model decide-review --emit-env 2>/dev/null || true)"   # op-config.yaml review.proportional_lens → env
PROP_ENABLED="${OP_REVIEW_PROPORTIONAL_LENS:-true}"
SMALL_MAX_LOC="${OP_REVIEW_SMALL_MAX_LOC:-100}"
MEDIUM_MAX_LOC="${OP_REVIEW_MEDIUM_MAX_LOC:-500}"

if [ "$PROP_ENABLED" != "true" ] || { [ "$REVIEW_SENSITIVE_TOUCHED" -ne 0 ] && [ "${SENSITIVE_DOC_DIFFERENTIAL:-0}" != "1" ]; }; then
  export REVIEW_ACTIVE_LENS_JSON='[]' REVIEW_LENS_BUNDLES_JSON='[]'    # [] = 全 7 lens 単独
elif [ "$REVIEW_LOC_COUNT" -le "$SMALL_MAX_LOC" ]; then
  export REVIEW_ACTIVE_LENS_JSON='["security","spec","test-regression"]' REVIEW_LENS_BUNDLES_JSON='[]'
elif [ "$REVIEW_LOC_COUNT" -le "$MEDIUM_MAX_LOC" ]; then
  REVIEW_UX_TOUCHED=$(printf '%s\n' "${PR_FILES_ARR[@]}" | grep -cE '(^|/)(src/components|src/pages|components|app|frontend)/|\.(vue|tsx|jsx|svelte|astro)$' || true)
  printf '%s' "$REVIEW_UX_TOUCHED" | grep -Eq '^[0-9]+$' || REVIEW_UX_TOUCHED=0
  if [ "$REVIEW_UX_TOUCHED" -ne 0 ]; then
    export REVIEW_ACTIVE_LENS_JSON='["security","spec","test-regression","compatibility","release","workflow-ux"]'
  else
    export REVIEW_ACTIVE_LENS_JSON='["security","spec","test-regression","compatibility","release"]'
  fi
  export REVIEW_LENS_BUNDLES_JSON='[["compatibility","release"]]'
else
  export REVIEW_ACTIVE_LENS_JSON='["security","workflow-ux","test-regression","compatibility","release","spec","refactor-maintainability"]'
  export REVIEW_LENS_BUNDLES_JSON='[]'
fi
```

不変則:
- core lens (`security` / `spec` / `test-regression`) は全 tier で必須・単独 (bundle しない)。
- bundle に `security` を含めない。許可ペアは `compatibility`+`release` / `workflow-ux`+`refactor-maintainability` のみ (2 lens まで)。
- sensitive PR は 7-lens フル。唯一の例外は `SENSITIVE_DOC_DIFFERENTIAL=1` (`review-fix-loop.md` §4.5-5、Round 2+ のみ)。

##### spawn 値の契約

`active_lens_keys` / `lens_bundles` は JSON 配列値として渡す (文字列化すると全 7 lens に silent 退行する)。

```js
{
  prs: [{
    number: PR_NUMBER,
    review_wt: REVIEW_WT,                   // §4-1
    review_wt_head_sha: PR_HEAD_SHA,        // §4-1 (reviewed_head_sha の根拠)
    review_mode: REVIEW_MODE,               // full | light-after-security-postcheck | fix_diff_only
    active_lens_keys: REVIEW_ACTIVE_LENS_JSON,   // [] = 全 7 lens
    lens_bundles: REVIEW_LENS_BUNDLES_JSON,
    carryover_findings: [],                 // Round 2+ は review-fix-loop.md §4.5-5
    round_base_sha: ROUND_BASE_SHA,         // Round 2+ のみ
    fix_diff: REVIEW_DIFF,                  // Round 2+ のみ
    issues: [/* close する Issue 番号 */],
  }],
  review_round: REVIEW_ROUND,               // §4-2-pre
  session_id: OP_RUN_SESSION_ID,            // CO フェーズ0 の入力値
  models: {
    investigate: REVIEW_INVESTIGATE_MODEL,
    investigate_fallback: REVIEW_INVESTIGATE_FALLBACK_MODEL,
    verify: REVIEW_VERIFY_MODEL,            // opus
    gate: REVIEW_GATE_MODEL,                // opus
  },
  review_model_reason: REVIEW_MODEL_REASON,
}
// 返却: { review_round, session_id, reviews: [{ verdict, pr_number, review_round, op_run_session_id, review_mode,
//   reviewed_head_sha, review_worktree_head_sha, model_used, model_decision_reason, rationale,
//   findings: [{ id, result, severity, lens, scope, recommended_fix_expert, requires_post_check,
//                summary, file, evidence, detected_by_lenses, verify_verdict }] }] }
// verdict は approve / needs-fix / needs-specialist-review / blocked
```

#### 4-2-b. review 結果の記録 (state push + label + 人間向けコメント)

CO は返却 `reviews[]` を PR ごとに publish する。記録の正本は state 文書の attempt。

- approve: `op review publish-approval` が state push (attempt) + `pro-reviewed` 付与 (他 review label 除去込み) を
  1 コマンドで行う。別途 state push / label 遷移をしない。
- needs-fix / needs-specialist-review / blocked: 人間向けに自然文のコメント (判定・理由・finding 一覧) を投稿し、
  attempt を state push し、label を遷移する。state push の失敗は握り潰さない (Review Fix Loop の入力が更新されない)。

```bash
# REV = reviews[] の 1 要素 (JSON)
: "${REV:?}" "${OP_RUN_SESSION_ID:?}"
PR_NUM=$(printf '%s' "$REV" | jq -r '.pr_number')
VERDICT=$(printf '%s' "$REV" | jq -r '.verdict')
RV_ROUND=$(printf '%s' "$REV" | jq -r '.review_round')

if [ "$VERDICT" = "approve" ]; then
  op review publish-approval --pr "$PR_NUM" --session "$OP_RUN_SESSION_ID" \
    --reviewer review-expert --verdict approve --review-round "$RV_ROUND" \
    --reviewed-head-sha "$(printf '%s' "$REV" | jq -r '.reviewed_head_sha')" \
    --review-worktree-head-sha "$(printf '%s' "$REV" | jq -r '.review_worktree_head_sha')" \
    ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
else
  printf '%s' "$REV" | jq -r '
    "## review-expert global review: \(.verdict) (round \(.review_round))\n\n\(.rationale // "")\n\n### Findings\n" +
    ([.findings[]? | "- **\(.id)** [\(.severity) / \(.lens) / \(.result)] \(.summary // "")\(if .file then " (`\(.file)`)" else "" end)"
      + (if .recommended_fix_expert then " — 修正担当候補: \(.recommended_fix_expert)" else "" end)] | join("\n"))' \
    | op pr comment "$PR_NUM" --body-file -

  printf '%s' "$REV" | jq -c --arg at "$(date -Iseconds)" \
    '{kind:"attempt", review_round:.review_round, review_result:.verdict,
      reviewed_head_sha:.reviewed_head_sha, reviewed_at:$at, reviewer:"review-expert",
      review_worktree_head_sha:.review_worktree_head_sha,
      findings:[.findings[]? | {id, result, severity, lens, scope,
        recommended_fix_expert, requires_post_check, summary, file, evidence}]}' \
    | op review state push --pr "$PR_NUM" --apply-json - \
        --write-id "${OP_RUN_SESSION_ID}-r${RV_ROUND}-attempt" --session "$OP_RUN_SESSION_ID" \
        ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}

  # needs-specialist-review は label 上 needs-fix と同じ遷移
  LABEL_RESULT=$([ "$VERDICT" = "needs-specialist-review" ] && echo needs-fix || echo "$VERDICT")
  op pr label-transition --pr "$PR_NUM" --target review --result "$LABEL_RESULT" \
    ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
fi
```

attempt payload は flatten 形式 (attempt の各 field を top-level に置く。`value:{}` で包むのは controller /
specialist_review payload のみ)。
