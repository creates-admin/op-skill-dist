# op-verify の完了報告

```
## op-verify <init | 実機検証 | grow> (provision-windows の報告は references/provision-windows.md)
- 対象: <repo / PR #N / branch / checkout>
- 結果: <PR URL と conformance の結果 | pass / pass_with_notes / block / needs_human_decision / skipped (skip_reason)>
- シナリオ: <name: pass / fail (expected / actual / repro_steps)>
- 証跡: <実在を確かめたパス>
- 未検証の範囲: <requires_runtime の scope と reason> (`windows not provisioned` なら `/op-skill:op-verify --provision-windows` を案内)
- gap: <step / manual_workaround / suggestion> (あれば `/op-skill:op-verify --grow` を案内)
- stop / 後片付け: <stop の exit と stderr 末尾、Windows を借りたときは release の exit と `RV_LEASE_ABORT`、残した worktree のパス>
```
