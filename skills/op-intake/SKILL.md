---
name: op-intake
description: 要望・監査の finding・人の Issue・scout の報告のどれからでも、振り分けの材料と op-depends-on を含む指示書の Issue を、一覧確認と人の承認を経て起票する「起票の管理」スキル。「起票して」「Issue にして」「下書きを起票」「op-intake」等のキーワードで起動。Project のスレッド・Project の外のクラウド・ローカルで同じ手順で動く。
effort: high
---

# op-intake: 起票の管理

下書きを作り、一覧で人に確認してもらい、承認後に 1 件ずつ直列に起票する。

- Direct Mode 固定 (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。`--auto` は持たない。
- 起票前ゲートの芯は `_shared/filing-gate.md`。本文の形は `_shared/pr-templates.md`、marker は `_shared/markers/labels-and-markers.md`、fingerprint と dedup は `_shared/dedup-policy.md`。
- 起票した Issue の実装はしない。実装の振り分けは手順 6 で渡す。

## 実行モード

| 起動 | 入口 |
|---|---|
| `/op-skill:op-intake [要望]` | 要望から |
| `--findings <file>` | 監査の finding から (op-scan / op-patrol の refute 済み finding) |
| `--from-issue #N` | 人の Issue の正規化 |
| `--report` (「これ起票して」「たまったやつ起票して」) | scout の報告から |
| `--drafts <file>` | 書き上がった下書き (op-plan の plan file・Project のファイル等) から。手順 3 から始める |
| `--dry-run` | 承認後も起票せず、起票コマンドを表示して終了する |

入口ごとの下書きの作り方は `references/entries.md`。

## 手順 0: 場所と環境

場所を見分け、以降の「Project の道具」を使うかを決める。

| 場所 | 目印 | 承認と報告 |
|---|---|---|
| Project のスレッド | スレッドへの返事・チェックリストの道具がある | 下書きを Project のファイルに書いて添付し、返事か判断のカードで承認をもらう |
| Project の外のクラウド | `CLAUDE_CODE_REMOTE=true` で Project の道具が無い | 会話で一覧と本文を見せて承認をもらう |
| ローカル | どちらでもない | 会話で見せる。plan mode と ExitPlanMode / AskUserQuestion があれば使う |

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を通す。作業ディレクトリを作り、以降の fence には実パスを直書きする:

```bash
INTAKE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/op-intake-XXXXXX")" || { echo "INTAKE_DIR を作れない"; exit 1; }
REPO="$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
echo "INTAKE_DIR=$INTAKE_DIR REPO=$REPO"
```

以降の `<owner>/<repo>` は `REPO` の値。

## 手順 1: 下書きを作る

`references/entries.md` の入口の手順で下書き (title・domain・apply 担当・触るファイル・依存・本文の素材) を集める。
入口が別の skill の手順を使う場合も、起票 (手順 3 以降) はこの skill に戻って行う。

## 手順 2: 本文を組む

`references/issue-format.md` に従い、1 件ずつ本文ファイル `<INTAKE_DIR>/draft-<key>.md` を書く (`<key>` は A, B… か 1, 2…)。

- `## 振り分けの材料` 節の形は `pr-templates.md`「振り分けの材料」。
- fingerprint は CLI で生成して先頭に置く (手書きしない):

```bash
op core fingerprint --domain <domain> --title "<title から [<expert>] を除いた要約>" --file <触るファイルの先頭> [--symbol <symbol>] --plain
```

- 依存先がこの run の下書きなら `<!-- op-depends-on: #issue[<key>] -->` と `## 依存` の `- depends on #issue[<key>] (先に完了が必要)` を書き、番号は手順 5 で埋める。

## 手順 3: 一覧確認 (重複・鎖・スレッド)

1. 全下書きを `[{domain, title, files, symbols}]` の配列で `<INTAKE_DIR>/drafts.json` に書き (値は手順 2 で fingerprint に渡したものと同じ)、既存 Issue の素材を REST で取って 1 回だけ判定する (どこでもこの形で実行する):

```bash
gh api -X GET search/issues --paginate --slurp \
  -f q='repo:<owner>/<repo> is:issue is:open label:auto-report' -f per_page=100 \
  | jq '{items: [.[].items[]]}' > "<INTAKE_DIR>/existing.json" &&
op scan dedup --findings-json "<INTAKE_DIR>/drafts.json" --input-json "<INTAKE_DIR>/existing.json" --json > "<INTAKE_DIR>/dedup.json"
```

2. `details.results[i]` の扱いは `filing-gate.md` §2 (対話経路)。envelope が取れない・`block` なのに `matched_existing` も `matched_draft` も無いときは中断して人に見せる。
3. dedup の後に、関係しそうな open Issue を言葉でも探す (`gh api -X GET search/issues -f q='repo:<owner>/<repo> is:issue is:open <キーワード>'`)。重なりではないが関係するものは一覧の注記に書く。
4. 下書きのラベルのうちリポジトリに無いものを洗い出す (`gh api "repos/<owner>/<repo>/labels" --paginate --jq '.[].name'` と突き合わせる)。
5. `references/filing-list.md` の形で一覧 (鎖・スレッド・スレッド内で並べる組の列を含む) を作る。

## 手順 4: 人の承認

承認前に起票しない。見せるもの: 一覧・重複の結果・新しく作るラベル・各 Issue の本文全文。

- Project のスレッド: 一覧と本文を 1 つのファイル (`/mnt/project-files/issue-drafts/<YYYY-MM-DD>-<題>.md`) に書いて返事に添付し、「起票する / 直す / やめる」を聞く。
- Project の外: 同じ内容を会話に出して同じことを聞く。plan mode なら plan file に書いて ExitPlanMode を呼ぶ。
- 直しの指示は手順 1〜3 の該当箇所からやり直し、一覧を見せ直す。
- `--dry-run` は承認後に手順 5 のコマンドを表示して終了する。

## 手順 5: 起票 (1 件ずつ直列)

依存先が先になる順に、1 件ずつ次を行う。並列化・background 化しない。
起票の前に、本文の `#issue[<key>]` のうち番号が確定したもの (依存先は必ず確定している) を `#N` に置き換える。

```bash
op core marker-lint --body-file "<INTAKE_DIR>/draft-<key>.md" --source-hint issue-body --strict &&
op issue create --title "<title>" --label "<ラベルを , で連結>" --body-file "<INTAKE_DIR>/draft-<key>.md" --ensure-labels
```

- marker-lint が `pass` 以外なら起票せず失敗に記録して次へ進む。
- `op issue create` が `HTTP 403` と `GraphQL` を含むエラーで失敗したら、同じ本文を `references/github-rest.md`「起票」で起票する。
- 番号は envelope の `details.issue_number` (REST なら応答の `number`) を使い (タイトル検索で逆引きしない)、`<key> → #N` を `<INTAKE_DIR>/numbers.txt` に追記する。
- 依存先が起票に失敗した Issue は起票しない (未作成に記録する)。
- 本文の地の文に後から起票する Issue への参照 (`参照: issue[<key>]` 等) が残った Issue だけ、全件の起票後に置き換えた本文を marker-lint してから `op issue edit-body --number <N> --body-file <file>` (403 なら `references/github-rest.md`「本文の更新」) で直す。参照先が起票に失敗していたら、その参照を外して失敗に記録する。
- 入口ごとの起票後の作業 (元 Issue へのコメント等) は `references/entries.md`。
- 1 件でも失敗したら「作成済み / 未作成 / 本文の更新に失敗」を分けて報告する。作成済みの Issue を自動で閉じない。

## 手順 6: 報告と引き渡し

起票した Issue を `| key | #N | title | 鎖 | スレッド | スレッド内で並べる組 |` の表で報告し、Project では手順 4 のファイルにも番号を書き戻す。

- Project のスレッド: 表を返事に書く (振り分けはコーディネーターが決める)。
- Project の外: 「この場で続ける (鎖の一番下から)」か「表の分け方で人が別のセッションを立てる」かを人に聞く。どちらでも `/op-skill:op-run <N…>` (依存があれば `/op-skill:op-loop --numbers <N…>`) で実装できる。
