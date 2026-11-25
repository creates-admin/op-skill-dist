# GitHub の扱い (REST の gh api)

クラウドでもローカルでも、GitHub とのやりとりは REST の `gh api` で行う。ローカルは gh auth の資格でそのまま動く。

## 実行場所の見分け

`CLAUDE_CODE_REMOTE=true` ならクラウド、それ以外はローカル。違いは draft / ready の切り替えと、レビューのスレッドの解決だけ。

## 通らないもの

- GraphQL。`gh pr …`・`gh issue …`・`gh repo view` などの porcelain は中で GraphQL を使うので、クラウドでは 403 になる。
- クラウドからはブランチの削除・CI の再実行・commit status (`commits/<sha>/status`) の読み取り・セッションに付いていない repo ができない。要るときは人に頼む。
- PR の作者にはレビューを頼めない (422)。

## 書き方

- `{owner}/{repo}` は gh が checkout の remote から埋める。path は単引用符で囲む。
- 書き込みは `-X` を明示する。本文はファイルに書き、`-F body=@<file>` で渡す (argv に本文を載せない)。
- 1 回の呼び出しに `gh api` は 1 つ。一覧は `--paginate` を付ける。

## Issue

読む:

```bash
gh api 'repos/{owner}/{repo}/issues/<N>' --jq '{title, state, body, labels: [.labels[].name]}'
```

### Issue を閉じる

```bash
gh api -X PATCH 'repos/{owner}/{repo}/issues/<N>' -f state=closed -f state_reason=completed --jq '.state'
```

## PR を作る

```bash
gh api -X POST 'repos/{owner}/{repo}/pulls' -f title='<タイトル>' -f head='<branch>' -f base='<base>' -F draft=true -F body=@body.md --jq '{number, html_url}'
```

作ったら担当者を付ける (best-effort):

```bash
gh api -X POST 'repos/{owner}/{repo}/issues/<PR>/assignees' -f 'assignees[]=<login>' --jq '.assignees[].login'
```

本文を直す:

```bash
gh api -X PATCH 'repos/{owner}/{repo}/pulls/<PR>' -F body=@body.md --jq '.number'
```

## PR の状態

```bash
gh api 'repos/{owner}/{repo}/pulls/<PR>' --jq '{state, draft, merged, mergeable, mergeable_state, head: .head.sha, head_ref: .head.ref, base: .base.ref}'
```

- `mergeable` が `null` はまだ計算中。次の回にもう一度見る。
- `mergeable_state`: `clean` (通る)・`dirty` (コンフリクト)・`behind` (base が先に進んだ)・`blocked` (必須のレビューやチェックが足りない)・`unstable` (必須でないチェックが赤)・`draft`・`unknown`。

## チェック

```bash
gh api --paginate 'repos/{owner}/{repo}/commits/<head-sha>/check-runs' --jq '.check_runs[] | {id, name, status, conclusion}'
```

- 緑: `conclusion` が `success`・`skipped`・`neutral`。それ以外の `conclusion` は赤。
  `status` が `completed` でないものは実行中。
- GitHub Actions のログ (check-run の `id` が job の id):

```bash
gh api 'repos/{owner}/{repo}/actions/jobs/<job-id>/logs' | tail -n 200
```

- base が同じように赤いかは、base の head の SHA で同じ check-runs を見る。

## コメントとレビュー

```bash
gh api --paginate 'repos/{owner}/{repo}/issues/<PR>/comments' --jq '.[] | {id, user: .user.login, type: .user.type, assoc: .author_association, created_at, body}'
```

```bash
gh api --paginate 'repos/{owner}/{repo}/pulls/<PR>/comments' --jq '.[] | {id, in_reply_to_id, user: .user.login, type: .user.type, assoc: .author_association, path, line, commit_id, created_at, body}'
```

```bash
gh api --paginate 'repos/{owner}/{repo}/pulls/<PR>/reviews' --jq '.[] | {id, user: .user.login, assoc: .author_association, state, commit_id, submitted_at, body}'
```

- `type` が `Bot` なら bot。`assoc` (`author_association`) が `OWNER`・`COLLABORATOR` なら repo に書ける人。`MEMBER` だけでは書けるとは限らない。
- クラウドでは collaborators の権限の API は通らない。`assoc` で見分ける。

PR への返事 (会話のコメント):

```bash
gh api -X POST 'repos/{owner}/{repo}/issues/<PR>/comments' -F body=@reply.md --jq '.html_url'
```

行へのコメントへの返事 (`<comment-id>` はスレッドの最初のコメント):

```bash
gh api -X POST 'repos/{owner}/{repo}/pulls/<PR>/comments/<comment-id>/replies' -F body=@reply.md --jq '.html_url'
```

## レビューのスレッドの解決 (実行場所で分ける)

クラウド (`<comment-id>` はスレッドの最初のコメント):

```bash
gh api -X POST 'repos/{owner}/{repo}/pulls/<PR>/ccr/comments/<comment-id>/resolve'
```

ローカル: REST に経路が無いので解決しない。返事だけにする。

## draft / ready の切り替え (実行場所で分ける)

クラウド:

```bash
gh api -X POST 'repos/{owner}/{repo}/pulls/<PR>/ccr/ready_for_review'
```

```bash
gh api -X POST 'repos/{owner}/{repo}/pulls/<PR>/ccr/convert_to_draft'
```

ローカル: `gh pr ready <PR>` / `gh pr ready <PR> --undo`。

## base を取り込む

```bash
git fetch origin '<base>' && git merge --no-edit FETCH_HEAD
```

## マージ

名指しの「マージして」の後だけ。draft のままなら先に ready にする (「draft / ready の切り替え」)。
`sha` に Ready と確かめた head を渡し、その後に head が動いていたらマージされずに止まるようにする。

```bash
gh api -X PUT 'repos/{owner}/{repo}/pulls/<PR>/merge-async' -f merge_method='<merge|squash>' -f sha='<head-sha>'
```

`merge_method` は repo の決まり (`.claude/skills/steward/SKILL.md`「マージ」) に従う。無ければ単独の PR は `squash`、積み重ねは `merge`。

積み重ねは `references/stack.md`「まとめてマージ」。
