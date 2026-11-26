---
name: op-thread
description: Issue 番号から、実装 → 検証 → /code-review → draft PR → 見張り → 名指しの「マージして」でマージ → Issue を閉じる、までを 1 つのセッションで進める。積み重ね PR を含む。Project のスレッド・Project の外のクラウド・手元の Claude Code のどこでも同じ手順で動く。「op-thread」「Issue #N を進めて」「この Issue を PR まで」等で起動。
---

# op-thread: Issue から PR のマージまでを 1 つのセッションで進める

このセッションは実装側として動く (CLAUDE.md 不変則 1 の司令官ではない)。手順は Step 0〜7。決まりは references に分けてあり、その Step で要るときだけ読む。

## 不変則

- マージは人が PR を名指しして「マージして」と言ったときだけ。積み重ねは一番上の PR の番号で名指しをもらう。
- GitHub は REST の `gh api` だけで扱う (`references/github-rest.md`)。`gh pr …`・`gh issue …` は使わない。
  例外はローカルの draft / ready の切り替え (`gh pr ready`) だけ。
- rebase・force-push・ブランチの削除・テストを外して緑にすること・空のコミットで CI を起こすことはしない。
- 再設計・範囲の拡大・直せないセキュリティの指摘は人に上げる。同じ原因への push は 3 回まで。
- CI のランナーの不調は直さず、人の作業として報告する。
- Project の道具 (スレッドへの返事・チェックリスト・判断のカード・コーディネーターへの連絡・PR の購読) は、あるときだけ使う。無ければ端末への出力で同じことを伝える。

## 文脈を節約する

- テスト・ビルド・lint の出力は repo の外のファイルに書き出し (`<コマンド> > "${TMPDIR:-/tmp}/<Issue 番号>-<名前>.log" 2>&1; echo "exit=$?"`)、`tail -n 60` で終わりだけ読む。落ちたら `grep -n` で失敗の行とその前後だけ読む。
- 大きなファイルは grep で場所を探してから、要る範囲だけ読む (Read の offset / limit)。
- Agent には、報告を「変えたファイル・テストの結果・残ったこと」の要点だけで返すよう頼む。
- CI のログは `references/github-rest.md` の読み方に従う。

## Step 0. 準備

1. Issue を読む: `gh api 'repos/{owner}/{repo}/issues/<N>' --jq '{title, state, body}'`。
2. 本文の「概要」「触ってよいファイル」「触ってはいけないファイル / 領域」「必須検証項目」「成功条件」と `op-depends-on` を拾う。
3. repo の `CLAUDE.md` と `.claude/skills/steward/SKILL.md` (あれば) を読む。steward のファイルは検証のコマンドと PR の扱いの決まりとして従う。この skill の不変則は変えない。
4. 依存の Issue が開いていれば `references/stack.md` で積むか待つかを決める。
5. 前のセッションの続きなら、知らされたブランチ (人・コーディネーター・チェックリスト。無ければ `auto/issue-<N>`) を `git fetch origin '<前のブランチ>'` で取る。どこまで済んだかは `git log FETCH_HEAD` とチェックリストで確かめる。
   前のブランチに PR が開いていれば `git checkout -B '<前のブランチ>' FETCH_HEAD` でそのブランチを続ける (push できなければ人に上げる)。PR が無ければ、自分のブランチに `git merge --no-edit FETCH_HEAD` で取り込んで続ける。

## Step 1. 分け方 (Issue や段が 2 つ以上のとき)

`references/parallel.md` に従って波に分ける。1 件だけなら飛ばす。

## Step 2. 実装

- ブランチ: 実行環境が決めたブランチがあればそれ、無ければ `auto/issue-<N>`。base は default branch の最新 (積み重ねは下の段の head ブランチ)。
- 実装は Issue の `op-run-expert` の expert に Agent で渡す (`subagent_type: op-skill:<expert>`)。
  渡し方は `_shared/expert-spawn.md`「パターン2: apply 用」で、Issue 本文と読むべき正本のパスを添える。
  Agent は自分の worktree のブランチにコミットするまで。終わったら PR のブランチに `git merge --no-edit <Agent のブランチ>` で取り込む。
- 小さい Issue とコンフリクトの解消は自分で直してよい。
- 触ってよいファイルの外に出る必要があれば、作業を止めて人に上げる。
- 区切りごとにコミットして `git push -u origin <branch>` する。区切りは「1 件の実装とそのテストが通った」「積み重ねの 1 段ができた」「Agent のブランチを取り込んだ」「長い検証 (repo の `CLAUDE.md`「検証」の全体) を流す前」。
  コミットは Step 5 の 1 と同じ形で、`Fixes #<N>` は最初のコミットにだけ付ける (`references/watch-pass.md`「書くもの」)。PR は作らない (Step 5)。PR を出した後の push は `references/watch-pass.md`「6. push」に従う。
- push したら、ブランチ名と最後のコミットの短い SHA をチェックリスト (無ければ端末) に書く。

## Step 3. 検証

- 全体を流す前に、Step 2 の区切りの push をする。
- repo の `CLAUDE.md`「検証」のコマンドを走らせる。落ちたら落ちたものだけを直しながら再実行する。
- Issue の必須検証項目を 1 つずつ確かめる。この場でできないもの (人の作業を含む) は PR 本文に未確認として書く。

## Step 4. 自己レビュー

1. draft PR を作る前に `/code-review` を差分に回す (effort は既定 `medium`、大きい差分・危ない場所は `high`)。`/code-review` は別の context で走る (不変則 9)。
   `/code-review` が skill の一覧に無いか、呼んで失敗したときだけ、built-in の `general-purpose` の Agent (別の context) に差分の correctness レビューを頼む。prompt に「編集・コミット・push をしない」と書き、`op-skill:*` の expert は使わない。それもできなければ PR 本文に書いて人に上げる。
2. 指摘は `references/watch-pass.md`「レビューの指摘」と同じ扱いで直す。
3. 直したら Step 3 のうち関係するものを再実行し、コミットして push する。
4. Issue に `op-post-check-expert` があれば `references/post-check.md` を行う。

## Step 5. push と draft PR

1. まだコミットしていない変更があればコミットする。形は `_shared/commit-convention.md` で、自分が変えたファイルだけを名前で add する。
2. push していないコミットがあれば (`git status -sb` に ahead と出る) `git push -u origin <branch>`。
3. draft PR を REST で作る (`references/github-rest.md`「PR を作る」)。
   本文は `_shared/pr-templates.md`「op-run: PR open テンプレ」で、`Fixes #<N>` を入れる。
4. repo の決まりで人が決めること (plugin の version を上げて配る等) は、やらずに PR 本文に書いて指示を待つ。
5. 積み重ねは stack を作る (`references/stack.md`)。

## Step 6. 見張り

1. 起こし方を `references/watch.md`「起こし方」で選ぶ。
2. 起きるたびに `references/watch-pass.md` の 1 回分を行う。
3. 報告は状態が変わったときだけにする (PR を出した・CI が緑・Ready・詰まった・マージした)。

## Step 7. マージと Issue を閉じる

1. 名指しの「マージして」が来たら、`references/watch-pass.md`「Ready の判定」を今の head で確かめる。満たさなければ足りないものを返して止まる。
2. マージする (`references/github-rest.md`「マージ」)。積み重ねは一番上の番号でまとめてマージする。
3. Issue が開いたままなら閉じる (`references/github-rest.md`「Issue を閉じる」)。積み重ねの各段の Issue も確かめる。
4. ブランチは repo の「マージ後に head ブランチを消す」設定に任せる。設定が無い repo では人に消してもらう。

## 終わり

マージして Issue を閉じた、人が止めた、PR が閉じられた、のどれかで終わる。終わるときは見張り (購読・/steward・予定した起こし) を止める。

## ローカルで使うとき

`references/local.md`。

## 各 repo の steward のひな形

`references/steward-template.md`。
