# 保留した stop の引き取り (controller の責務)

`harness.stop_status: deferred` の返却を受けた controller は、その `harness.checkout` について次を行う。

| 項目 | 内容 |
|---|---|
| いつ | その checkout に spawn した verify-runner がすべて返ったあと。worktree の削除や失敗隔離より前 |
| 何を | checkout を cwd にして `verify_harness.stop` を 1 回実行する。保留した run・`finished` の無い run・残骸をまとめて止める |
| 記録 | exit code と stderr の末尾。非 0 はプロセスや state が残ったことを示すので、controller の報告に載せる |

同じ checkout の verify-runner が 1 本でも動いている間は、この stop を実行しない。
