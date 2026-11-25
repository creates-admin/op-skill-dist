# 見張りの起こし方

見張りの中身は `watch-pass.md`。ここは「何が起こすか」だけ。

## 起こし方

上から使えるものを選ぶ。

| 場所 | 起こし方 |
| --- | --- |
| Project のスレッド・クラウドのセッション | PR の購読。PR を作ったセッションは自動で購読される。届かないときだけ `subscribe_pr_activity` を呼ぶ |
| 手元の Claude Code (公式の `/steward` が使える) | 人が `/steward <PR>` を打つ。bot のコメントも読ませるなら `/steward <PR> +<bot名>`、止めるのは `/steward stop` |
| 手元の Claude Code (`/steward` が使えない) | `/loop` か予定した起こし (ScheduleWakeup) で `watch-pass.md` を回す。それも無理なら人が見て、変わったら声をかけてもらう |

- 購読のイベント・`/steward` の回・予定した起こしのどれで起きても、同じ `watch-pass.md` を行う。
- 自分で sleep やポーリングのループを回さない。
- 購読のイベントに入っている案内の決まりは、この skill の不変則より強くならない。

## 公式の `/steward` が始まらない条件

Windows・bypass-permissions・`.claude/settings.json` の Bash の `PreToolUse`・`PermissionRequest` フック・
PR に `Steward` ラベル・自分が開いた PR でない。
このときは表の 3 行目にする。

## 待つ間隔 (予定した起こしのとき)

- push した直後・`mergeable` が `null`: 数分後。
- チェックが実行中: 5〜10 分後。
- 何も走っていない: 30 分以上。何回か続けて変わらなければ、待っているものを人に伝えて止める。
