# 積み重ね PR

依存のある Issue を、下の段から順に 1 段 1 PR で積む。GitHub の呼び出しは `github-rest.md` の書き方に従う。

## 積むか待つか

- 依存の Issue の PR が開いていて、その形 (使う関数・ファイルの形) がもう決まっている: その head ブランチの上に積む。
- 形がまだ決まっていない: 待つ。待つ間は依存しない部分だけ進める。
- 依存先の変更を使わない: 積まずに default branch から切る。
- 同じ段を 2 つのセッションで触らない。

## 作る

1. 段ごとに、下の段の head ブランチから切ったブランチで実装し、下の段の head ブランチを base にした draft PR を作る。
2. 2 段以上そろったら stack にする (下から順の番号、2 件以上、base は書かない):

```bash
gh api -X POST 'repos/{owner}/{repo}/stacks' -F 'pull_requests[]=<下の PR>' -F 'pull_requests[]=<上の PR>'
```

## 下の段が変わったとき

上の段のブランチに下の段の head ブランチを merge して push する (rebase しない)。上から順にではなく下から順に行う。

```bash
git fetch origin '<下の段の head ブランチ>' && git merge --no-edit FETCH_HEAD
```

## まとめてマージ

一番上の PR の番号で名指しの「マージして」をもらってから、一番上の PR に対して行う。

- 呼び出しの直前に各段の今の head で `watch-pass.md`「Ready の判定」を確かめる。Ready と伝えた後に動いた段があれば、マージせずにその段を見直す。

```bash
gh api -X PUT 'repos/{owner}/{repo}/pulls/<一番上の PR>/merge-async' -f merge_method=merge -f sha='<一番上の PR の head-sha>'
```

- 途中の段の番号で名指しされたら、どこまでマージするかを人に確かめてから行う。
- マージ後に各段の Issue が閉じたかを確かめ、開いていれば閉じる。
