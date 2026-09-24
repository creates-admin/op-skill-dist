# op-codev: Review 選択 2 — review-expert (7-lens)

SKILL.md「Review 選択 2」を選んだ場合のみ実行する。前提: `PR_NUMBER` / `BRANCH_NAME` (Step D で確定)。各 fence で値をリテラルで設定する。

## 1. active lens tier / model の決定

op-run skill の `references/global-review-spawn.md` §4-1-b (`REVIEW_MODEL` / `REVIEW_SENSITIVE_TOUCHED`) と
§4-2-a-pre2 (`REVIEW_ACTIVE_LENS_JSON`) の fence をそのまま流用する (不変則もそちらが正本)。

## 2. review_round の導出 (spawn 前必須)

正本は op-run skill の `global-review-spawn.md` §4-2-pre。

```bash
PR_NUMBER=<PR番号>
REVIEW_STATE_JSON=$(op review state pull --pr "$PR_NUMBER" ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"})
PREV_ROUND=$(printf '%s' "$REVIEW_STATE_JSON" | jq '[.details.state.attempts[]?.review_round] | max // 0')
echo "REVIEW_ROUND=$((PREV_ROUND + 1))"
```

初回 review のときだけ session id を生成し、以降の round でも同じ値を使う:
`SESSION_ID="opcodev-$(date -u +%Y%m%dT%H%M%SZ)-pr${PR_NUMBER}-$(git rev-parse --short HEAD)"`。

`REVIEW_ROUND` が 3 を超える場合は spawn せず、人間に判断を仰ぐ。

## 3. review-expert spawn

`<§rules>` / `<§4>` は SKILL.md フェーズ 3「spawn prompt 共通」のとおり展開する。

```javascript
Agent({
  subagent_type: "op-skill:review-expert",
  description: "op-codev review: <PR番号>",
  prompt: `
    invocation_mode: op_managed

    以下の PR をレビューしてください:
    PR: <URL>

    active_lens_keys: <REVIEW_ACTIVE_LENS_JSON>   // []= 全 7 lens。honor 契約は expert-review/SKILL.md「op-codev 単一 spawn モードでの active_lens_keys honor 契約」節
    models: { investigate: "<REVIEW_MODEL>", verify: "opus", gate: "opus" }
    review_round: <REVIEW_ROUND>

    <§rules>

    修正・commit・push は行わないでください。PR へのコメント投稿もしないでください。
    結果は review-finding payload (\`op help payload review-finding\`: meta + findings) で返してください。

    <§4>
  `
})
```

## 4. 結果提示

review_result と finding 一覧 (severity / lens / file:line / summary) を提示し、選ばせる:
- 修正する → 対象 IU の Step B に戻る (§6)
- 承認する (approve / approve_with_followup のとき) → §5

## 5. approve / approve_with_followup: publish

1. expert は commit-only のため、fix round があった場合は controller が push してから publish する。
   `git rev-parse HEAD` と `op pr view <PR> --include meta` の head SHA が一致するまで push する。
2. publish (review state への attempt push + `pro-reviewed` 付与を atomic に行う):

```bash
op review publish-approval \
  --pr "<PR_NUMBER>" \
  --session "<SESSION_ID>" \
  --reviewer review-expert \
  --verdict approve \
  --review-round "<REVIEW_ROUND>"
```

3. `/op-skill:op-merge` または人間が GitHub で PR をマージする (`pro-reviewed` はマージ判断の参考シグナル)。

## 6. needs-fix 等 (non-approve)

non-approve の attempt は自動で記録されないため、Step B に戻る前に controller が `op review state push` で記録する
(未記録だと次回の round が進まない):

```bash
jq -n --argjson round <REVIEW_ROUND> --arg sha "$(git rev-parse HEAD)" --arg at "$(date -Iseconds)" \
  --arg result "<review_result>" \
  --argjson findings '<review-expert の findings[] (id/result/severity/lens/scope/recommended_fix_expert/requires_post_check/summary/file/evidence)>' \
  '{kind:"attempt", review_round:$round, review_result:$result, reviewed_head_sha:$sha, reviewed_at:$at,
    reviewer:"review-expert", review_worktree_head_sha:$sha, findings:$findings}' \
| op review state push --pr "<PR_NUMBER>" --apply-json - \
    --write-id "<SESSION_ID>-r<REVIEW_ROUND>-attempt" --session "<SESSION_ID>"
```

その後、該当 IU の Step B (fix round) → B-1 → B-2 → push を経て §2 から再実行する。
