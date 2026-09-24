# op-run: Post-check Dispatcher (Phase 3.5)

ClusterOrchestrator (CO、`cluster-orchestrator-directives.md` フェーズ5.5) が global review の**前に**実行する、
Issue 固有の domain-specific 再監査。global review (review-expert) とは別工程:

- **post-check**: 元 Issue の success_criteria を満たしたか / 元 finding が解消したか / 修正が新たな露出面を生んでいないか
- **global review**: PR 全体の副作用・PR 本文整合・検証記録・横断的観点 (7 lens)

review-expert は post-check expert にしない。

## フェーズ3.5: Post-check Dispatcher (post_check 解決済みクラスタのみ)

post_check_expert (フェーズ1-2-c で解決済み) で分岐する。spawn するのは 3.5-A / 3.5-B (+ 3.5-B-4) だけ。

| post_check_expert | 動作 |
|---|---|
| `null` | 3.5-C: 何もせず review へ (警告なし) |
| `ux-ui-audit-expert` | 3.5-A |
| `security-expert` | 3.5-B |
| `env-expert` (planned) | 3.5-D: spawn せず review へ |
| `release-expert` / `compatibility-expert` (planned)、`spec-expert` (Utility Worker、post-check 不可) | 3.5-E: `needs_human_decision` |
| registry / planned-experts のどちらにも無い | 3.5-E: contract error で停止 |

## 3.5-W. Active Post-check の spawn 機構 (ClusterOrchestrator / 共通)

CO が Agent tool で spawn する (`subagent_type`: `"op-skill:ux-ui-audit-expert"` / `"op-skill:security-expert"`)。

| 渡す値 | 内容 |
|---|---|
| model | `opus`。read-only 監査のため `fable` は使わない (cluster が Fable 承認済みでも波及させない) |
| worktree_path | apply worktree を再利用 (read-only。新規 worktree を作らない) |
| issues | 元 Issue 番号 |
| prompt_text | `post-check-prompts.md` の該当節 (3.5-A / 3.5-B-1 / 3.5-B-4) の本文 |
| base_ref | `OP_RUN_BASE_REF` |
| design_mock_url | Issue の `デザインモック:` 行の URL (ux-ui のみ、あれば) |

- post-check expert は監査専任 (`commits_added: []`)。label 操作は CO だけが行い、expert は `gh pr edit` / label 操作をしない。
- 判定確定後、CO は **label 遷移 → state push** の順に行う (下記テンプレ)。

### 判定後処理テンプレ (3.5-A-2 / 3.5-B-2 / 3.5-B-4 共通)

```bash
: "${PR_NUMBER:?}" "${WORKTREE_PATH:?}" "${OP_RUN_SESSION_ID:?}" "${RESULT:?pass|pass_with_notes|block|needs_human_decision|skipped}"
POST_CHECKED_HEAD_SHA=$(git -C "$WORKTREE_PATH" rev-parse HEAD)   # 監査した (push 済み) head
: "${POST_CHECK_ROUND:?その expert の post-check 実行回数 (1 始まり)}"

case "$RESULT" in                       # label-transition の result 名へ変換
  block) LABEL_RESULT=needs-fix-post-check ;;
  pass_with_notes) LABEL_RESULT=pass-with-notes ;;
  needs_human_decision) LABEL_RESULT=needs-human-decision ;;
  *) LABEL_RESULT="$RESULT" ;;
esac
op pr label-transition --pr "$PR_NUMBER" --target "$LABEL_TARGET" --result "$LABEL_RESULT" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}

jq -n --arg key "$STATE_KEY" --arg expert "$EXPERT" --arg r "$RESULT" --arg sha "$POST_CHECKED_HEAD_SHA" \
  --argjson round "$POST_CHECK_ROUND" --argjson extra "${EXTRA_JSON:-{\}}" \
  '{kind:"post_check", expert:$key, post_check_result:$r, audit_result:($r|ascii_upcase),
    post_checked_head_sha:$sha, post_check_round:$round, post_check_expert:$expert} + $extra' \
  | op review state push --pr "$PR_NUMBER" --apply-json - \
      --write-id "${OP_RUN_SESSION_ID}-postcheck-${STATE_KEY}-r${POST_CHECK_ROUND}" --session "$OP_RUN_SESSION_ID" \
      ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
```

| 節 | `LABEL_TARGET` | `STATE_KEY` | `EXPERT` | `EXTRA_JSON` |
|---|---|---|---|---|
| 3.5-A (ux-ui primary) | `ux-post-check` | `ux-ui-audit-expert` | `ux-ui-audit-expert` | なし |
| 3.5-B (security) | `security-post-check` | `security-expert` | `security-expert` | `{"requires_aux_post_check": <bool>}` |
| 3.5-B-4 (aux ux-ui) | `ux-post-check` | `ux-ui-audit-expert@aux` | `ux-ui-audit-expert` | `{"triggered_by": "security-expert"}` |

payload は flatten 形式 (entry の各 field を top-level に置く。`entry:{}` / `value:{}` で包まない)。
aux は primary と同じ map に入るため key に `@aux` を付ける。

### 失敗時の扱い (3.5-A-3 / 3.5-B-3 / aux 共通)

spawn timeout / agent error / 判定欠落で結果が得られない場合は `RESULT=skipped` で上記テンプレを実行し、
review は `full` モードで進め、完了報告に warning を出す。

| 対象 | 追加の扱い |
|---|---|
| UI 影響あり PR (apply 担当が designer-expert / UI path を変更 / post-check が ux-ui) | `pro-ux-ui-audit-skipped` が残る。PR コメント (自然文) で ux-ui-audit-expert の再実行を人間に促す |
| security 影響あり PR (post-check が security / `pro-security-expert` label / fingerprint domain が security) | `pro-security-post-check-skipped` が残る。同様に security-expert の再実行を促す |
| それ以外 | warning のみ |

UI 影響の path 判定は `_shared/project-profile.md`「UI 影響判定 path パターン」(`src` / `lib` / `app` 単体マッチは不可)。

---

## 3.5-A. UX/UI Post-check (post_check_expert == "ux-ui-audit-expert")

ux-ui-audit-expert を post-check モードで spawn する。

### 3.5-A-2. 判定に応じた処理 (controller 主語)

| 判定 | 動作 |
|---|---|
| PASS / PASS_WITH_NOTES | review へ進む |
| BLOCK | review を呼ばず、designer-expert (または feature-expert) を再 spawn して Required Changes を実装させる (当該クラスタのみフェーズ2 から再実行)。再実装は 2 回まで、3 回目は `blocked` として human escalation report (PR / クラスタ / Required Changes / 履歴) を返す |

再 audit で PASS / PASS_WITH_NOTES になるまで review に進まない。

## 3.5-B. Security Post-check (post_check_expert == "security-expert")

security-expert を post-check モードで spawn し、Issue 固有の深掘り再監査 (元 finding の解消 / 別の露出面 /
IO・IPC・shell・path・capability) をさせる。脅威アクター視点・不正利用は review-expert の Security/Abuse Lens が扱う。
security-expert が spawn 不能 (agent 不在) なら `RESULT=skipped` の失敗時扱いにする。

### 3.5-B-2. 判定に応じた処理 (controller 主語)

| 判定 | 動作 |
|---|---|
| PASS / PASS_WITH_NOTES | `requires_aux_post_check: true` なら 3.5-B-4 を先に実行。そうでなければ review へ (light モード) |
| BLOCK | review を呼ばず、判定優先順位に従い apply expert (security-expert / debug-expert) を再 spawn して Required Changes を実装させる。再実装は 2 回まで、3 回目は `blocked` + `needs_human_decision` を返す |
| NEEDS_HUMAN_DECISION | review を呼ばず停止。`needs_human_decision` (decision_type / options / safest_default / blocked_actions) を ClusterSummary の blocker_reason に要約し、PR コメントに全文を残す |

`needs:human-decision` label は他 domain と共有のため、security PASS だけで自動 remove しない。
典型的な NEEDS_HUMAN_DECISION は `expert-security/references/post-check-policy.md` を参照。

## 3.5-B-4. UX/UI Auxiliary Post-check (security mitigation が UI / workflow に影響する場合)

security post-check が PASS / PASS_WITH_NOTES かつ `requires_aux_post_check: true` かつ `aux_post_check_experts` に
`ux-ui-audit-expert` を含む場合、security の結果確定後に ux-ui-audit-expert を aux として spawn する
(`trigger_reason` = security の `aux_post_check_reason`)。

- result enum は pass / pass_with_notes / block の 3 値のみ。`needs_human_decision` は返させない (情報不足は BLOCK)。
- PASS / PASS_WITH_NOTES → review へ (light モード)。BLOCK → review を呼ばず designer-expert / feature-expert を再 spawn。
- aux 完了後に再実装で head が進んだら aux を再実行する。

## 3.5-C. Skip (post_check_expert == null)

何もせず review へ進む。spawn しない。

## 3.5-D. Planned Env Post-check Skip (post_check_expert == "env-expert")

env-expert は planned のため spawn しない。

1. apply expert が 1-2-d で security / debug / refactor-expert に正規化済み、または `needs_human_decision` であることを確認する。
2. release / installer / updater / distribution 方針判断が主題 (`needs_human_decision`) なら人間レビューに回す。
3. それ以外は PR に「env-expert は未実装のため post-check を実施していない」旨を自然文で 1 コメント残し、review へ進む。

post_check_expert 解決の最後に、`env-expert` かつ (apply expert が security-expert、または Issue 本文 / label に
OSV / 依存脆弱性 / supply-chain / secret / credential / permission の signal がある) なら post_check_expert を
`security-expert` に付け替えて 3.5-B を動かす。

## 3.5-E. Default Branch (unknown / unregistered / 他 planned post-check)

- `release-expert` / `compatibility-expert` / `spec-expert`: spawn しない。`needs_human_decision` を返し、review を呼ばず
  `op pr label-transition --target review --result blocked`。PR コメントに「post_check_expert の dispatch が未解決」と書く。
- unregistered: contract error で停止し、registry / agent frontmatter の整合を人間に確認させる (自動補正しない)。
