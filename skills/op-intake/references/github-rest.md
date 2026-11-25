# REST の gh api で起票する

`op issue create` / `edit-body` / `comment` / `edit-labels` が `HTTP 403` と `GraphQL` を含むエラーで失敗したときだけ使う。
ローカルでもクラウドでも同じコマンドで動く。本文は必ずファイルから渡す (`-F body=@<file>`)。

## ラベルの作成

手順 4 で承認された「新しく作るラベル」を起票の前に作る:

```bash
gh api "repos/<owner>/<repo>/labels" -X POST -f name="<label>"
```

## 起票

```bash
gh api "repos/<owner>/<repo>/issues" -X POST \
  -f title="<title>" -F body=@"<INTAKE_DIR>/draft-<key>.md" \
  -f 'labels[]=<label1>' -f 'labels[]=<label2>' \
  --jq '{number, html_url}'
```

- 返ってきた `number` を番号にする。
- 応答に番号が無い・通信が切れたときは再実行せず、新しい順の一覧でタイトルが完全に一致する Issue があるかを確かめてから決める:

```bash
gh api "repos/<owner>/<repo>/issues?state=all&sort=created&direction=desc&per_page=20" --jq '.[] | select(.pull_request == null) | [.number, .title] | @tsv'
```

- 起票後に本文の marker が残っているかを確かめる:

```bash
gh api "repos/<owner>/<repo>/issues/<N>" --jq .body | op core marker-lint --body - --source-hint issue-body --strict
```

## 本文の更新

```bash
gh api "repos/<owner>/<repo>/issues/<N>" -X PATCH -F body=@"<file>" --jq .number
```

## コメント

```bash
gh api "repos/<owner>/<repo>/issues/<N>/comments" -X POST -F body=@"<file>" --jq .html_url
```

## ラベルを足す

足すだけで、今のラベルを置き換えない:

```bash
gh api "repos/<owner>/<repo>/issues/<N>/labels" -X POST -f 'labels[]=<label>' --jq '[.[].name]'
```
