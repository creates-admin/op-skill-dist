## フェーズ4.5: Review Fix / Specialist Decision Loop (op-run 制御)

ClusterOrchestrator (CO) が実行する。review-expert は修正しない。

| review_result | 動作 |
|---|---|
| `needs-fix` | finding を apply expert に再委任し、同一 PR 上で修正する |
| `needs-specialist-review` | specialist reviewer に妥当性 / 影響範囲 / same-pr 可否を判断させる。**即 apply しない** |
| `blocked` | 自動継続しない (`pro-review-blocked`) |
| `approve` | 完了。High/Critical は approve と共存しない |

### 4.5-1. round 上限管理

`max_review_fix_rounds = 2`、許可 `review_round ≤ 3` (1 = 初回 / 2 = fix 1 回後 / 3 = fix 2 回後の最終)。
round 算出と gate は `global-review-spawn.md` §4-2-pre。state 文書の最新 attempt で loop 継続可否だけを決める:

| 状況 | 動作 |
|---|---|
| approve | 完了 |
| blocked | 自動継続しない |
| needs-fix / needs-specialist-review かつ round < 3 | 4.5-1A へ |
| needs-fix / needs-specialist-review かつ round = 3 | 3 回目の fix はしない。`global-review-spawn.md` §4-2-pre-blocked の terminal 処理 |

3 回目以降の自動 fix は scope creep / 設計問題のサイン。Issue 分割や scope 再定義は人間が判断する。

全体 review_result は集約値 (`blocked > needs-specialist-review > needs-fix > approve`) で、上表は loop を回すかだけを決める。
apply / handoff の振り分けは **必ず finding 単位の `result` を主語にする** (4.5-1A)。

### 4.5-1A. finding.result 主語の状態遷移 (mixed finding 必須フロー)

`$REVIEW_FINDINGS` (4.5-2-pre) の各 finding を 1 件ずつ評価する。

```text
Step 1. blocked 早期停止
  finding.result = blocked が 1 件でもあれば loop を打ち切り、pro-review-blocked。
  残りの finding は保留 (人間判断後に再開を判断)。

Step 2. specialist handoff (needs-specialist-review を先に処理)
  finding.result = needs-specialist-review のみ 4.5-2A に回す。needs-fix はこの段階では apply しない
  (specialist 判断で scope が変わりうるため)。全件の specialist 判断が出揃うまで Step 3 に進まない。

Step 3. apply batch 構築
  | bucket     | finding                                                  | 扱い |
  | apply 対象 | result = needs-fix ∪ specialist_result = same-pr-fixable | 4.5-2 の apply path |
  | new-issue  | specialist_result = new-issue                            | 別 Issue を起票し本 PR では直さない |
  | blocked    | specialist_result = blocked                              | pro-review-blocked で停止 |
  blocked bucket が 1 件でもあれば apply bucket も止めて Step 1 と同じ扱いにする。

Step 4. apply 実行
  apply bucket を 4.5-2 の判定優先順位で expert ごとにまとめ、4.5-4 の再 verification → 再 post-check → 再 review に流す。
```

禁止: needs-specialist-review finding を 4.5-2A を経ずに apply すること / Step 1 の blocked を無視して続けること /
specialist 判断が出揃う前の部分 apply。

### 4.5-2. needs-fix finding の解析と apply expert 決定

本節は 4.5-1A Step 4 の apply bucket (result = needs-fix、または specialist_result = same-pr-fixable) にのみ適用する。

#### 4.5-2-pre. finding 抽出の限定条件 (必須・stale 防止、state 文書ベース)

入力は state 文書の最新有効 attempt 1 件の findings だけ。条件は (1) `review_round` が attempts 中で最大
(同 round 重複の tie-break は CLI 内蔵) かつ (2) `reviewed_head_sha == 現在の PR head`。古い round / 別 SHA の finding は読まない。

```bash
: "${PR_NUMBER:?}" "${WORKTREE_PATH:?}"
CURRENT_HEAD_SHA=$(git -C "$WORKTREE_PATH" rev-parse HEAD)   # CO が push した PR head
REVIEW_STATE_JSON=$(op review state pull --pr "$PR_NUMBER" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"})
LATEST_ATTEMPT_JSON=$(printf '%s' "$REVIEW_STATE_JSON" | jq -c --arg head "$CURRENT_HEAD_SHA" '
  (.details.state.attempts // []) as $a
  | ($a | map(.review_round) | max // 0) as $m
  | ($a | map(select(.review_round == $m)) | sort_by(.reviewed_at) | last) as $l
  | if $l == null then {ok:false, reason:"no_attempts"}
    elif $l.reviewed_head_sha != $head then {ok:false, reason:"stale_head"}
    else {ok:true, attempt:$l} end')
if [ "$(printf '%s' "$LATEST_ATTEMPT_JSON" | jq -r '.ok')" != "true" ]; then
  echo "⚠️ 最新 review attempt が無いか stale ($(printf '%s' "$LATEST_ATTEMPT_JSON" | jq -r '.reason'))。再 review が必要" >&2
  exit 1
fi
export REVIEW_FINDINGS=$(printf '%s' "$LATEST_ATTEMPT_JSON" | jq -c '.attempt.findings // []')
```

#### 4.5-2-pre-2. dispatch 用メタと handoff 用本文の分離

- dispatch 判定 (判定優先順位 / fallback / round 制御) には `id / result / severity / lens / scope /
  recommended_fix_expert / requires_post_check` だけを使う。
- apply expert / specialist の prompt には上記 + `summary / file / evidence` を渡す。

```bash
# dispatch 用
printf '%s' "$REVIEW_FINDINGS" | jq -c --arg id "$RVW_ID" \
  '.[] | select(.id == $id) | {id, result, severity, lens, scope, recommended_fix_expert, requires_post_check}'
# handoff 用
printf '%s' "$REVIEW_FINDINGS" | jq -r --arg id "$RVW_ID" '.[] | select(.id == $id) |
  "id: \(.id)\nresult: \(.result)\nseverity: \(.severity)\nlens: \(.lens)\nscope: \(.scope)\n" +
  "recommended_fix_expert: \(.recommended_fix_expert // "null")\nrequires_post_check: \(.requires_post_check // "null")\n\n" +
  (.summary // "") + (if .file then " (\(.file))" else "" end) + (if .evidence then "\n\n根拠:\n\(.evidence)" else "" end)'
```

#### 4.5-2. 再委任先 expert の決定 (op-run の判定優先順位 1-8)

```text
1. Issue / PR の scope_in / scope_out
2. 変更ファイルのドメイン (src-tauri/** / frontend/** / migrations/** / tests/** など)
3. finding の lens (Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor)
4. failure mode / 失敗種別
5. required post-check (修正後に必要な post-check expert と整合する apply expert)
6. review-expert の recommended_fix_expert (参考情報)
7. ownership / 直前に修正した expert
8. 不明な場合は needs-specialist-review または blocked
```

判定例:
- review-expert が feature-expert を推奨していても、src-tauri/** の file IO / permission / IPC なら security-expert。
- UI 系でも、design token / component / layout なら designer-expert、状態復帰 / error flow / a11y 実装なら feature-expert。
- テスト不足でも仕様が不明確なら needs-specialist-review に回す。

#### 4.5-2-guard. apply target にできない expert (固定ルール)

| expert | UI/UX 系 finding の置換先 |
|---|---|
| `ux-ui-audit-expert` (検出・post-check 専任) | visual / component / token / layout → `designer-expert`、state / recovery / flow / a11y 実装 → `feature-expert` |
| `review-expert` (監査専任) | 判定優先順位 1-8 で再決定 |

`recommended_fix_expert` (直す担当) と `requires_post_check` (再確認担当、例: `ux-ui-audit-expert`) は独立に決める。
null 許容範囲は `expert-review/references/finding-schema.md`。needs-fix で null なら needs-specialist-review に倒す。

#### 4.5-2-fallback. planned expert の自動 fallback (必須)

`recommended_fix_expert` / `recommended_apply_expert` が planned expert や op-run 非対象の Utility Worker でも、
spawn 前に `op run expert-resolve` で active expert に正規化する (正規化表の正本は `expert-resolution.md` 1-2-d と
`_shared/planned-experts.md`)。`release-expert` は fallback 先にも使わない。

```bash
jq -n --argjson n "$ISSUE_NUMBER" --arg rec "$RECOMMENDED_FIX_EXPERT" --arg ctx "$FINDING_TEXT" \
  --argjson labels "$ISSUE_LABELS_JSON" \
  '{issue_number:$n, body:("<!-- op-run-expert: " + $rec + " -->\n" + $ctx), labels:$labels}' \
  | op run expert-resolve --stdin | jq -r '.payload | if .needs_human_decision then "needs_human_decision" else .apply_expert // "" end'
```

結果にも 4.5-2-guard を適用する (CLI は `ux-ui-audit-expert` をそのまま返しうる)。
`needs_human_decision` / 空なら apply せず 4.5-2A の specialist handoff か `pro-review-blocked` に倒す。
置換した場合は再委任の PR コメント (自然文) に「推奨 X → 実行 Y (理由)」を 1 行残す。
`requires_post_check` の planned expert (env-expert 等) は値として残してよい (dispatcher が skip する)。

### 4.5-2A. needs-specialist-review の specialist handoff (即 apply 禁止)

対象は `finding.result = needs-specialist-review` の finding のみ。specialist (専門 expert を review-only で spawn) の
判断が出るまで apply expert を spawn しない。prompt は review-only とする。

```text
invocation_mode: op_managed
あなたは <expert-name> です。この起動は needs-specialist-review finding に対する specialist reviewer mode です。
You must not ask interactive questions.

禁止: コード編集 / commit / push / PR 本文編集 / label 操作 / PR コメント投稿

目的: finding の妥当性を判断し、same-pr で直せるか・修正方針・apply expert を決める。

完了報告に以下を返す:
source_finding_id: <RVW-xxx>
specialist: <expert 名>
specialist_result: same-pr-fixable | new-issue | blocked
recommended_apply_expert: <expert 名 | null>   # review-expert / ux-ui-audit-expert は不可
requires_post_check: <ux-ui-audit-expert | security-expert | null>
reason: <短い理由>
```

CO は判断を state 文書に記録し、PR に自然文で要約を 1 コメント残す (1 finding = 1 判断)。

```bash
jq -n --arg id "$RVW_ID" --arg sp "$SPECIALIST_EXPERT" --arg r "$SPECIALIST_RESULT" \
  --arg ae "${RECOMMENDED_APPLY_EXPERT:-}" --arg pc "${SPECIALIST_REQUIRES_POST_CHECK:-}" \
  --argjson round "$REVIEW_ROUND" --arg at "$(date -Iseconds)" --arg reason "$SPECIALIST_REASON" \
  '{kind:"specialist_review", value:{source_finding_id:$id, specialist:$sp, specialist_result:$r,
    recommended_apply_expert:(if $ae=="" then null else $ae end),
    requires_post_check:(if $pc=="" then null else $pc end),
    reviewed_round:$round, reviewed_at:$at, reason:$reason}}' \
  | op review state push --pr "$PR_NUMBER" --apply-json - \
      --write-id "${OP_RUN_SESSION_ID}-r${REVIEW_ROUND}-specialist-${RVW_ID}" --session "$OP_RUN_SESSION_ID" \
      ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
```

| specialist_result | 動作 |
|---|---|
| `same-pr-fixable` | 4.5-2 の apply path へ (4.5-2-guard / 4.5-2-fallback を通す) |
| `new-issue` | 別 Issue を起票し、本 PR では直さない |
| `blocked` | `pro-review-blocked` で人間判断待ち |

### 4.5-3. same worktree で直す条件 / 直さない条件

**直す**: 元 Issue の scope_in の修正漏れ / PR 変更が原因のバグ・UX 破壊・security・file IO・permission 副作用 /
acceptance criteria に必要な不足修正 / 妥当性確認に必要な最小限のテスト追加 / 同一 PR 由来の小規模な整合性問題。

**直さない (別 Issue / blocked)**: scope_out / 既存からある別問題 / 大きな設計変更・migration・compatibility 再設計 /
広範囲の security deep scan / release・installer・updater の別検証 / 人間判断が必要 / loop 上限超過。

### 4.5-4. 再委任 → 再 verification → 再 post-check → 再 review

1. `op pr label-transition --pr "$PR_NUMBER" --target review --result fix-in-progress`。
2. apply bucket の finding だけを 4.5-2 で決めた apply expert に再委任する。CO が既存 apply worktree で apply-expert を
   再 spawn する (`cluster-orchestrator-directives.md` フェーズ2 と同じ経路・同じ `apply_model`。fix loop で model を昇格しない)。
   prompt には `apply-prompt-directives.md` の common 節 + 当該 expert 節と、finding の handoff 本文を入れる。
3. `op pr label-transition --pr "$PR_NUMBER" --target review --result stale` (新 commit で既存 review / post-check は stale)。
4. 再 verification: 完了報告の `self_review_result` / `self_check_blocked` をフェーズ4 の入力条件で確認し、
   `op apply verify-commit` gate を通してから push する (`cluster-orchestrator-directives.md` フェーズ3-4)。
   条件を満たさなければ以降に進まず人間 gate / 再委任。
5. required post-check を再実行 (フェーズ5.5)。
6. `global-review-spawn.md` §4-2-pre の fence を再実行して REVIEW_ROUND / REVIEW_TERMINAL を得る。
   `REVIEW_TERMINAL=1` なら再 review せず §4-2-pre-blocked。0 なら `cluster-orchestrator-directives.md` フェーズ6 で再 review
   (Round 2+ の lens は 4.5-5)。
7. 結果が approve なら完了、needs-fix / needs-specialist-review なら 4.5-1 に戻る。

### 4.5-5. 差分 lens 化 (Fix Loop 2 round 目以降)

Round 1 の lens は `global-review-spawn.md` §4-2-a-pre2。Round 2+ は fix の範囲と前 round の指摘に絞る。

**active lens = 和集合**:
- (a) 前 round (`$REVIEW_FINDINGS`) で finding が出た lens (表示形 → kebab key に逆引き、例 "Security / Abuse" → security)
- (b) fix commit が触れたファイル (`git diff --name-only <prev_head>..<new_head>`) の domain に対応する lens
  (src-tauri / file IO / IPC → security、tests → test-regression、frontend / *.vue → workflow-ux、migrations / config 構造 →
  compatibility、release / installer / updater → release、PR 本文 / scope → spec、命名 / 構造 / 配置 → refactor-maintainability)
- (c) core lens (security / spec / test-regression) を常に加える

`lens_bundles` は Round 1 と同じ許可ペアを、両 lens が active のときだけ適用する。
最終ゲートの backstop gap-check は Round 1 からの累積 diff (`origin/$BASE_REF...HEAD`) を対象にする。
`op-config.yaml` の `review.proportional_lens.enabled: false` なら差分化せず全 7 lens。

**carryover**: 再 spawn しない lens の前 round 未解決 high/critical を `carryover_findings` に渡し、floor / verdict の母集合に残す
(再 verify はしない)。

```bash
RESPAWNED_LENS_JSON=$(printf '%s\n' "${RESPAWNED_LENS_KEYS[@]}" | jq -R . | jq -s .)
CARRYOVER_FINDINGS_JSON=$(printf '%s' "$REVIEW_FINDINGS" | jq -c --argjson respawned "$RESPAWNED_LENS_JSON" '
  [.[] | select(.severity | ascii_downcase | . == "high" or . == "critical")
   | select((.lens_kebab // .lens) as $l | ($respawned | index($l) | not))
   | {lens: (.lens_kebab // .lens), severity, result, summary, file, evidence}]')
```

#### sensitive doc-only refactor の round2+ 差分化判定

sensitive PR は既定で毎 round 7-lens フル。例外として、Round 2+ ∩ 全 Issue が refactor ∩ 累積 diff が doc のみ
(.md / docs/ のみ、判定式は `global-review-spawn.md` §4-1-b と同じ) のときだけ `SENSITIVE_DOC_DIFFERENTIAL=1` とし、
§4-2-a-pre2 の sensitive 分岐をバイパスして上記の和集合を使う。Round 1 は必ず full 7-lens (REVIEW_ROUND を先に確定させる)。
判定に失敗したら 0 (full) に倒す。

```bash
: "${REVIEW_ROUND:?}" "${OP_RUN_BASE_REF:?}" "${WORKTREE_PATH:?}"
PR_HEAD_SHA_DIFF=$(git -C "$WORKTREE_PATH" rev-parse HEAD 2>/dev/null || true)   # CO が push した PR head
git -C "$WORKTREE_PATH" fetch origin "$OP_RUN_BASE_REF:refs/remotes/origin/$OP_RUN_BASE_REF" 2>/dev/null || true

# domain は Issue の op-fingerprint 第 1 segment。1 件でも refactor 以外 / 取得失敗なら full
NONREFACTOR=0
[ -n "${ISSUE_NUMBERS:-}" ] || NONREFACTOR=1
for N in ${ISSUE_NUMBERS:-}; do
  D=$(op issue view "$N" --plain 2>/dev/null | grep -oE '<!-- op-fingerprint:[[:space:]]*[a-z-]+' | head -1 | sed -E 's/.*op-fingerprint:[[:space:]]*//')
  [ "$D" = "refactor" ] || NONREFACTOR=1
done

# 解決できなければ full に倒す
CUMULATIVE_NONDOC=1
if [ -n "$PR_HEAD_SHA_DIFF" ] && git -C "$WORKTREE_PATH" cat-file -e "${PR_HEAD_SHA_DIFF}^{commit}" 2>/dev/null; then
  CUMULATIVE_NONDOC=$(git -C "$WORKTREE_PATH" diff --name-only "origin/${OP_RUN_BASE_REF}...${PR_HEAD_SHA_DIFF}" \
    | grep -Ev '(\.md$|(^|/)docs/)' | wc -l | tr -d ' ')
  printf '%s' "$CUMULATIVE_NONDOC" | grep -Eq '^[0-9]+$' || CUMULATIVE_NONDOC=1
fi

if [ "$REVIEW_ROUND" -ge 2 ] && [ "$NONREFACTOR" -eq 0 ] && [ "$CUMULATIVE_NONDOC" -eq 0 ]; then
  export SENSITIVE_DOC_DIFFERENTIAL=1
else
  export SENSITIVE_DOC_DIFFERENTIAL=0
fi
```

`=1` でも core 3 lens・累積 diff の backstop・carryover は毎 round 有効。
