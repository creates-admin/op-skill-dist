---
name: op-cleanup
description: >
  失敗 worktree / 失敗 run 残骸 / stale PR / stale auto-report Issue の後始末を行う独立 OP skill。
  two-tier 設計 (Tier1=機械判定 auto / Tier2=人間 gate) で stale 資産を集約する。
  branch は扱わない (op-sweep に委譲)。dry-run デフォルト、--apply で Tier1 を実行。
  「op-cleanup」「stale 資産掃除」「worktree 掃除」「放置 PR」「陳腐化 Issue」等のキーワードで起動。
---

# op-cleanup: stale 資産の two-tier 後始末

## 不変則 7 例外宣言

- **Tier1 (失敗 worktree / 失敗 run 残骸 / orphaned worktree dir) のみ**、機械判定 housekeeping mutation として
  削除の責務を持つ (mtime + grace の決定論。人間判断は介在しない)。
- **Tier2 (stale PR / stale auto-report Issue の close) は例外に含まない**。候補列挙のみで、close は per-item の人間承認を経る。
  grace period は候補に挙げる閾値であって close の根拠ではない。PR / Issue を機械 close してはならない。

## op-sweep との責務境界

| 処理 | 担当 |
|------|------|
| `auto/*` の squash-merge 済 branch の grace 後削除 | op-sweep |
| 失敗 worktree / 残骸の grace 後削除 | op-cleanup Tier1 |
| stale PR / stale auto-report Issue の close | op-cleanup Tier2 (人間 gate) |

本 skill は branch を触らない。`auto/*` branch の掃除が必要なら `/op-sweep` を案内する。
worktree のパス規則・失敗隔離 path は `skills/_shared/worktree-ops.md` が正本。

## 起動

```
/op-cleanup                          # dry-run: Tier1/Tier2 の候補を表示するだけ
/op-cleanup --apply                  # Tier1 は一括承認後に削除、Tier2 は per-item 承認後に close
/op-cleanup --older-than 14          # grace period (日、デフォルト 7)
/op-cleanup --tier tier1|tier2|all   # 対象 tier を絞る (デフォルト all)
```

## フェーズ0: 環境確認

`skills/_shared/common-setup.md` の git/gh check に従う。**gh auth / origin がなくても Tier1 は続行**し、Tier2 のみスキップする。
Tier2 の GitHub 操作は `skills/_shared/github-channel.md` の channel 判定に従う (`op` 経由なら mcp channel でも call-spec が出る)。

## フェーズ1: 候補列挙 (read-only)

```bash
# Tier1: ~/cwork/worktrees/ と ~/cwork/worktrees-failed/ 配下を走査し、保護理由付きで返す
op cleanup worktree-candidates --older-than "$N" --json

# Tier2: label で open PR / Issue を列挙する (close はしない)
op cleanup pr-candidates --label auto-fix --json        # op-run が作成した PR
op cleanup issue-candidates --label auto-report --json  # op-scan / op-patrol 等が起票した Issue
```

Tier1 の保護理由 (`protection_reasons`、いずれか 1 つで削除しない):

| 理由 | 意味 |
|------|------|
| `in_use` | `git worktree list` に登録されている (op-run 進行中等) |
| `within_grace` | 最終更新から `--older-than` 日未満 |

Tier2 の CLI は age を採点しない (`--stale-days` は理由ラベル表示のみ)。候補は指定 label の open 全件なので、
最終更新日を確認して stale と判断したものだけを人間に提示する。

## フェーズ2: 候補表示

次の 1 書式で表示する (dry-run でも `--apply` でも同じ)。

```
=== Tier1: 失敗 worktree / 残骸 ===
削除候補: ~/cwork/worktrees-failed/<repo>/<task-id>-<ts>/ (12 日経過)
保護中:   ~/cwork/worktrees-failed/<repo>/<task-id>-<ts>/ [within_grace]
=== Tier2: stale PR / Issue (候補のみ) ===
PR #701    feat: xxx (8 日間更新なし) <url>
Issue #631 zzz の問題 (10 日間更新なし) <url>
```

- dry-run: 「実行するには `/op-cleanup --apply`」「`auto/*` branch は `/op-sweep`」を併記して終了。
- 候補 0 件: 「掃除候補はありませんでした。」で終了。

## フェーズ3a: Tier1 apply

「上記 N 件を削除します。よろしいですか？ [y/N]」で確認する (デフォルト N → Tier1 をキャンセルして Tier2 へ)。y なら:

```bash
op cleanup worktree --older-than "$N" --apply --json
```

CLI は保護条件を再評価し、未保護の候補だけを `git worktree remove --force` する (`rm -rf` はしない)。
`details.failed` (例: `is not a working tree` = git 未登録の dir) は削除されずに残るので、そのまま報告する。
手動で消すかどうかは人間が判断する。

## フェーズ3b: Tier2 apply (per-item 人間承認)

候補ごとに番号・タイトル・最終更新・URL を示して `[y/N/s(kip)]` を聞く。一括 close はしない。

```bash
# y のとき
op pr comment <N> --body "長期放置のため op-cleanup でクローズ。再開時は reopen してください。"
op pr close --pr <N>
op issue close --issue <N> --comment "陳腐化のため op-cleanup でクローズ。再発時は reopen してください。"
```

N = 保留、s = 残りをすべてスキップして終了。

## フェーズ4: 結果報告

Tier1 の `deleted` / `failed` / `skipped_protected`、Tier2 の close 済 / 保留を列挙し、`auto/*` branch が残っていれば `/op-sweep` を案内する。

## 復元方法

| 対象 | 復元 |
|------|------|
| 削除した worktree | branch `auto/<task-id>` が残っていれば `git worktree add` で再生成 (push 済なら GitHub の "Restore branch" も可) |
| close した PR | `gh pr reopen <N>` または GitHub UI |
| close した Issue | `gh issue reopen <N>` または GitHub UI |
