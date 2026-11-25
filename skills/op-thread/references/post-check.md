# post-check (Issue 固有の再監査)

Step 4 の 1〜3 の後に行う。先に変更を commit する (Step 5.1 の形。push はまだ)。Issue 本文の `<!-- op-post-check-expert: <expert> -->` で分ける。

| 値 | 動作 |
|---|---|
| `null` か marker が無い | 何もしない |
| `security-expert` | 下の「spawn」で security-expert を post-check モードで呼ぶ |
| `ux-ui-audit-expert` | 下の「spawn」で ux-ui-audit-expert を post-check モードで呼ぶ |
| それ以外 (planned・registry に無い名前) | spawn しない。PR 本文に「post-check を実施していない (理由)」と書いて人に上げる |

## spawn

`subagent_type: "op-skill:<expert>"`、model `opus` (read-only のため `fable` は使わない)。worktree は作らず、実装したブランチの checkout を読ませる。
`<base>` は Step 2 の base (default branch の最新、積み重ねは下の段の head ブランチ)。`post_check_round` はその expert を呼んだ回数 (1 始まり)。

```
invocation_mode: op_managed
【共通宣言】~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4 を含める (§2 は exploration-only。commits_added: [] が正解)。
作業対象のパスが決まったら、対応する .claude/rules/<feature>.md を Read ツールで開いてから着手すること (cat / grep では正本が読み込まれない)。
あなたはこのコードを書いていません。<expert> (post-check モード) として、Issue #<N> の実装を Issue 固有に再監査してください。
編集・commit・push・ラベル操作・GitHub への書き込みはしない。基準が投稿するという PR コメントは投稿せず、本文を comment_body として返す。

- checkout: <checkout の絶対パス> / head: <HEAD SHA> / post_check_round: <round>
- diff: git -C <checkout> diff "<base>...HEAD"
- Issue 本文: 成功条件・触ってよいファイル・触ってはいけないファイル / 領域・必須検証項目
- apply の完了報告: <apply の Agent の完了報告。自分で直した Issue なら「なし (session が直接実装)」>
- デザインモック: <Issue の `デザインモック:` 行の URL があれば。Artifact({action:"read", url}) で参照>

基準と返却:
- security-expert: expert-security skill の references/post-check-policy.md「8 観点 (post-check の核)」「判定 4 種」。
  PASS / PASS_WITH_NOTES / BLOCK / NEEDS_HUMAN_DECISION と、requires_aux_post_check / aux_post_check_experts / aux_post_check_reason を返す。
- ux-ui-audit-expert: expert-ux-ui-audit skill の references/criteria.md「Post-check」。PASS / PASS_WITH_NOTES / BLOCK を返す。
```

security-expert が PASS / PASS_WITH_NOTES で、`requires_aux_post_check: true` かつ `aux_post_check_experts` に `ux-ui-audit-expert` を含めたら、
ux-ui-audit-expert (aux) を同じ形で呼ぶ。prompt には「security の対策が誘発した UI / workflow の変更だけを criteria.md『security 起点の auxiliary post-check』で見る。
PASS / PASS_WITH_NOTES / BLOCK のどれかで返す (情報不足は BLOCK)」と、security の aux_post_check_reason を足す。

## 判定の扱い

security と aux の両方を呼んだときは、重いほうの判定で扱う (NEEDS_HUMAN_DECISION > BLOCK > PASS_WITH_NOTES > PASS)。

| 判定 | 動作 |
|---|---|
| PASS / PASS_WITH_NOTES | Step 5 へ。Notes は PR 本文の「残存リスク / follow-up」に書く |
| BLOCK | Required Changes を Step 2 と同じ形で直して commit し、Step 3 の関係するものを再実行してから、最初の expert から呼び直す (aux は条件を満たせばまた呼ぶ)。呼び直しは 2 回まで。3 回目の BLOCK は PR 本文に書いて人に上げる |
| NEEDS_HUMAN_DECISION | 直さずに PR 本文に判断の材料 (decision_type / options / safest_default) を書き、人に上げる |
| 結果が返らない (spawn 失敗・応答なし) | PR 本文に「post-check 未実施」と書き、人に再実行を頼む |

## 記録

- PR 本文の「検証」に 1 行 (expert・判定・確かめた head・round)。
- PR を作った後、各 expert の最後の round の comment_body を PR コメントに 1 件ずつ投稿する (`references/github-rest.md`「コメントとレビュー」)。
- op-review-state にも記録する (`<SESSION>` は `opthread-<N>-<YYYYMMDD-HHMMSS>`、aux の key は `ux-ui-audit-expert@aux`)。
  push は PR 本文の末尾に state block を書くので、後で PR 本文を書き直すときは `<!-- op-review-state -->` 以降を残す。

```bash
: "${PR_NUMBER:?}" "${SESSION:?}" "${KEY:?security-expert|ux-ui-audit-expert|ux-ui-audit-expert@aux}" "${EXPERT:?}"
: "${RESULT:?pass|pass_with_notes|block|needs_human_decision|skipped}" "${HEAD_SHA:?post-check した head}" "${ROUND:?}"
jq -n --arg key "$KEY" --arg expert "$EXPERT" --arg r "$RESULT" --arg sha "$HEAD_SHA" --argjson round "$ROUND" \
  '{kind:"post_check", expert:$key, post_check_expert:$expert, post_check_result:$r, audit_result:($r|ascii_upcase),
    post_checked_head_sha:$sha, post_check_round:$round}' \
  | op review state push --pr "$PR_NUMBER" --apply-json - --write-id "${SESSION}-postcheck-${KEY}-r${ROUND}" --session "$SESSION"
```

## 見張りの間

見張りで push して、post-check した head から diff のコード (Issue の触ってよいファイル) が変わったら、その head で post-check をやり直して記録する。
最後の判定が PASS / PASS_WITH_NOTES で、その head から diff のコードが変わっていないときだけ Ready にできる (`watch-pass.md`「Ready の判定」)。
