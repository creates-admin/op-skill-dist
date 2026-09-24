# op-scan `--from-merged-pr` モード (follow-up Issue 半自動起票)

merged PR の完了報告・review 結果・post-check Notes から follow-up を抽出し、plan モード承認後に Issue を起票する。
Cloud (mcp channel) 非対応 — ローカル (gh channel) で実行する (fence は fail-closed で停止する)。

```
/op-scan --from-merged-pr <PR>
/op-scan --from-merged-pr <PR1> <PR2> ...
/op-scan --from-merged-pr --since <ISO8601>
/op-scan --from-merged-pr <PR> --dry-run       # 起票せずコマンド表示
/op-scan --from-merged-pr <PR> --no-trace      # 親 PR への trace コメントを省略
```

## Phase -1: プランモード遷移

起動直後に `EnterPlanMode` を呼ぶ (op-plan のプランモード運用と同じ)。Phase 0〜5 は read-only
(Read / Grep / Glob と read-only な `op` CLI のみ)。`op issue create` / `op issue comment` / `op pr comment` などの write は
Phase 6 の承認まで行わない。ユーザーが plan mode を拒否しても同じ規律で続行する。

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

## Phase 3: fingerprint + 重複・衝突チェック

draft ごとに `op core fingerprint` で fingerprint を生成し、全 draft を 1 回で判定する:

```bash
op scan dedup --findings-json drafts.json --json
```

`.details.results[i].decision` が `pass` の draft だけ次へ進める。`block` は「既存 Issue と重複」、
それ以外・取得失敗は fail-closed で block 扱いにする。類似 (warn) は plan file に併記して Phase 6 で人間が判断する
(`_shared/filing-gate.md` §2)。draft が 0 件なら Phase 3 以降を skip する。

## Phase 4: plan file 書き出し

`~/.claude/plans/op-scan-followup-PR<N>-<YYYYMMDD-HHMMSS>.md` に書く:

1. 対象 PR (番号 / タイトル / 実行日時)
2. サマリ表: `# / タイトル / domain / severity / fingerprint / 類似 Issue`
3. 起票予定 Issue 詳細 (各 draft を `<details>` で折りたたみ、Labels / Body 全文)
4. スキップ (重複) 表: `fingerprint / 既存 Issue`

## Phase 5: ExitPlanMode 承認

`ExitPlanMode` を呼ぶ。推奨は「Approve and accept edits」。「Keep planning with feedback」なら plan file を直して再度呼ぶ。
承認されるまで起票しない。

## Phase 6: 起票

承認された draft を 1 件ずつ直列に起票する (`filing-gate.md` §3: marker-lint → `op issue create --title <t> --label <csv> --body-file <tmp>`)。

- marker: `op-fingerprint` / `op-run-expert` / `op-post-check-expert` (SKILL.md フェーズ4 と同じ)。本文に「親 PR: #<N>」を自然文で書く。
- ラベル: `auto-report`、`derived-from-pr`、`severity:<critical|high|medium|low>`、apply 担当の `pro-<expert>-expert`。

## Phase 7: 完了報告 + 親 PR trace コメント

```
## op-scan --from-merged-pr 完了

- 対象 PR: #<N> "<タイトル>"
- 抽出: recommended_followup_experts N / needs_human_decision N / proposed_stages N /
  review finding N / post-check Notes N / assumptions・blocked_actions N / followup_section N
- 起票: #<M> "<タイトル>" (medium, <fingerprint>) ...
- スキップ (重複): <fingerprint> → 既存 #<K>

次は `/op-run` で起票した Issue を実装できます。
```

`--no-trace` でなければ、起票した Issue 一覧とスキップ件数を一時ファイルに書き `op pr comment "$PR_NUM" --body-file <tmp>` で親 PR に投稿する。
