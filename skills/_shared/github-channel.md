# GitHub I/O Channel

## 1. 正本宣言

本ファイルは op と skill が GitHub とやりとりする経路の正本。

## 2. 経路

- op の GitHub の読み書きはすべて REST の `gh api` で、ローカル (gh auth の資格) でもクラウド (セッションに付いたリポジトリ) でも同じ経路で通る。環境変数の設定は要らない。
- 実行場所は `CLAUDE_CODE_REMOTE=true` ならクラウド、それ以外はローカル。違いは REST に無い操作 (draft / ready の切り替え・レビューのスレッドの解決) だけで、op がクラウドは `/pulls/{n}/ccr/...`、ローカルは `gh pr ready`・GraphQL に切り替える。
- skill から op に無い操作をするときは `gh api 'repos/{owner}/{repo}/...'` を使う。`gh pr …`・`gh issue …` などの porcelain は中で GraphQL を使うので、クラウドでは 403 になる。
- クラウドからはブランチの削除・CI の再実行・GraphQL・セッションに付いていないリポジトリができない。要るときは人に頼む。

## 3. MCP の read 系 tool

`mcp__github__issue_read` / `list_issues` / `pull_request_read` は body の HTML コメント (hidden marker) を落として返す。marker に依存する照合 (dedup・marker 検証・review state) にはこれらの返り値を使わず、op か `gh api` で読む。
