# op-scan `--from-merged-pr` モード (follow-up Issue 半自動起票)

merged PR の完了報告・review 結果・post-check Notes から follow-up を抽出し、op-intake の手順で承認を得て Issue を起票する。

```
/op-skill:op-scan --from-merged-pr <PR>
/op-skill:op-scan --from-merged-pr <PR1> <PR2> ...
/op-skill:op-scan --from-merged-pr --since <ISO8601>
/op-skill:op-scan --from-merged-pr <PR> --dry-run       # 起票せずコマンド表示
/op-skill:op-scan --from-merged-pr <PR> --no-trace      # 親 PR への trace コメントを省略
```

## Phase -1: 場所と環境

op-intake skill の手順 0 (場所の見分け・作業ディレクトリ) を通す。ローカルで `EnterPlanMode` があれば起動直後に呼ぶ。
Phase 0〜2 は read-only (Read / Grep / Glob と read-only な `op` CLI のみ)。`op issue create` / `op issue comment` / `op pr comment` などの write は
op-intake 手順 4 の承認まで行わない。

## Phase 0: PR 状態確認

```bash
PR_STATE=$(op pr view "$PR_NUM" --include meta --json | jq -r '.state')
[ "$PR_STATE" = "MERGED" ] || { echo "PR #${PR_NUM} は ${PR_STATE}。--from-merged-pr は MERGED PR のみ対象" >&2; exit 1; }
```

open / draft PR は明示エラーで中断する。`--since` 指定時は `op pr list-merged --since "$SINCE" --limit 30 --plain` で対象 PR を列挙する。

## Phase 1-2: follow-up source 抽出

```bash
op pr view "$PR_NUM" --include body-comments-commits --json \
  | jq '{pr_body: .body, pr_comment_bodies: .comments, commit_message_bodies: .commit_message_bodies}' \
  | op core extract-pr-markers --input-json - > hits.json
op review state pull --pr "$PR_NUM" > review-state.json
```

- `hits.json` の `source_kind` ごとに draft を作る。review 由来の follow-up は `review-state.json` の
  最新 `attempts[].findings[]` のうち `scope == "new-issue"` を使う (review 結果の正本は op-review-state)。
- 抽出は決定論 (LLM 解釈なし)。hit が無い source は draft を作らない。

| source | severity 既定 | domain |
|---|---|---|
| `recommended_followup_experts` | medium | 当該 expert の domain |
| `needs_human_decision` (boundary) | high | apply expert の domain |
| `needs_human_decision` (scope / behavior) | medium | 同上 |
| `proposed_stages` (Stage 2 以降) | medium | refactor |
| review finding (`scope: new-issue`) | finding の severity | lens → expert |
| `post_check_notes` (PASS_WITH_NOTES) | low (本文に「LLM 推定」と明記) | post-check expert の domain |
| `assumptions` (未解消) / `blocked_actions` | low | apply expert の domain |
| `followup_section` (`残存リスク / follow-up` 節の bullet) | low | 親 PR の fingerprint 第 1 segment (取れなければ `unknown`) |

## Phase 3: 起票 (op-intake に渡す)

draft が 0 件なら Phase 4 へ進む。draft を op-intake skill の `--drafts` の入口で受け (fingerprint は同手順 2 のコマンドで作る)、手順 3〜6 (dedup・一覧の確認・承認・直列の起票) で起票する。

- marker: `issue-templates.md`「Issue 本文 hidden marker」。本文に「親 PR: #<N>」を自然文で書く。Medium / Low も起票する (`filing-gate.md` §1 の例外)。
- ラベル: `auto-report`、`derived-from-pr`、`severity:<critical|high|medium|low>`、apply 担当の `pro-<expert>-expert`。
- 一覧の表に `domain / severity / fingerprint` の列を足す。
- `--dry-run` は op-intake の `--dry-run` として扱い、Phase 4 の親 PR への trace コメントもしない。

## Phase 4: 完了報告 + 親 PR trace コメント

```
## op-scan --from-merged-pr 完了

- 対象 PR: #<N> "<タイトル>"
- 抽出: recommended_followup_experts N / needs_human_decision N / proposed_stages N /
  review finding N / post-check Notes N / assumptions・blocked_actions N / followup_section N
- 起票: #<M> "<タイトル>" (medium, <fingerprint>) ...
- スキップ (既存 Issue と重複): <fingerprint> → 既存 #<matched_existing.issue_number>
- スキップ (run 内重複): <fingerprint> → run 内 draft <matched_draft.draft_index> (<matched_draft.draft_title>)
```

`--no-trace` でなければ、起票した Issue 一覧とスキップ件数 (既存 Issue と重複 / run 内重複 を分けて数える) を一時ファイルに書き
`op pr comment "$PR_NUM" --body-file <tmp>` で親 PR に投稿する。
