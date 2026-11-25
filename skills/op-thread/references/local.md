# ローカル (手元の Claude Code) で使う

手順は SKILL.md と同じ。違うところだけを書く。

## 起動

op-skill の plugin を読み込んだ Claude Code で `/op-skill:op-thread <Issue 番号>` を打つ。

## GitHub

- REST の `gh api` は gh auth の資格でそのまま動く (`gh auth status` で確かめる)。
- draft / ready の切り替えとスレッドの解決は `github-rest.md` の「ローカル」の行を使う (`CLAUDE_CODE_REMOTE` が `true` でなければローカル)。

## worktree

- 見張りは独立した checkout が要る。見張る PR のブランチを checkout したままにし、次の作業は別の worktree で行う (`_shared/worktree-ops.md`)。
- Agent で並列にするときは Agent ごとに worktree を分ける。

## 見張り

`watch.md`「起こし方」の手元の行。公式の `/steward` を使うときの注意:

- 見張り中は base を merge してテストを走らせるので、信頼できる人だけが書ける repo でだけ使う。
- 公式の `/ship` は `CLAUDE.md`・`REVIEW.md`・`.claude/`・`.github/` をコミットしない。
  それらを変えたときは `git status` を見て自分でコミットしてから `/steward <PR>` を打つ。
- 公式の見張りも、同じ原因への push は 3 回まで・再設計や範囲の拡大は作者に上げる、で動く。この skill の決まりと同じ。
- `/steward` が読む repo の決まりは `.claude/skills/steward/SKILL.md` (`steward-template.md`)。

## 確かめること (人の作業)

Issue の必須検証項目の「ローカルで 1 回通す」は、手元で Issue 1 件を draft PR まで進め、見張りが `watch.md` の選び方どおりに動くかを見る。
