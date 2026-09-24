# worktree ライフサイクル運用

op-run は各クラスタを独立した git worktree に隔離して並列実装する。本ファイルはパス規則・作成・cleanup・滞留数 gate の正本。

## ディレクトリ規約

| 状態 | パス |
|------|------|
| 作業中 | `~/cwork/worktrees/<repo-name>/<task-id>/` |
| 失敗・隔離 | `~/cwork/worktrees-failed/<repo-name>/<task-id>-<timestamp>/` |
| メイン作業 | `<repo-path>/` (司令官専用、編集禁止) |

- パス・task-id (`<verb>-<short>-<YYYYMMDD-HHMMSS>[-<cluster-id>]`)・branch `auto/<task-id>` は `op run worktree create` が決める。worktree を main リポジトリ配下に作らない。
- OP skill が自動生成する branch の一般形: `auto/<source>-<verb>-<short>-YYYYMMDD-HHMMSS[-<cluster-id>]` (`<source>` = `run` / `architect` / `plan` 等。op-run の source 省略形も有効)。手動 branch (`fix/*` / `feat/*`) は `auto/` を持たず op-sweep の対象外

## 作成手順

起点は op-run controller がフェーズ0-base で確定した `OP_RUN_BASE_REF` / `OP_RUN_BASE_SHA` (`op run base-sha`)。全 cluster が同じ SHA から分岐する。`origin/main` 直参照は禁止。

```bash
: "${OP_RUN_BASE_REF:?}" "${OP_RUN_BASE_SHA:?}"
op run worktree create --task-prefix <verb>-<short> --cluster-id c1 \
  --base-ref "$OP_RUN_BASE_REF" --base-sha "$OP_RUN_BASE_SHA"
# 確定済 task-id から冪等に作る (既存なら再利用) 場合:
op run worktree-provision --task-id <task-id> --base-sha "$OP_RUN_BASE_SHA" --cluster-id c1
```

### 外部 base 注入 (op-loop 等の上位 orchestrator による層ごとの base 前進)

op-run フェーズ0-base の fence 冒頭で `OP_RUN_BASE_SHA` / `OP_RUN_BASE_REF` が設定済みなら、0-base はその値を尊重して SHA 再計算を skip する (op-loop が層 N+1 の base を層 N のマージ後 HEAD へ前進させる用途)。
値は fence 間で引き継がれないので、呼出側が env ファイル (`declare -p` で保存) を用意し、0-base の fence 冒頭で `source` するかリテラルで書く (`bash-fence-convention.md`)。

- SHA と REF の整合は呼出側の責務。不整合時の動作は未定義。
- 注入時も 1 回の op-run 起動内では全 cluster が同じ SHA を使う。

## subagent への受け渡しと push

apply subagent に渡す値 (worktree path / branch / base SHA / scope_in / scope_out) の正本は op-run の
`cluster-orchestrator-directives.md`。subagent は worktree で作業し commit までで止まる。push は controller 側 (op-run では ClusterOrchestrator のフェーズ4) が行い、例外はない (review subagent を含む。review-expert の禁止事項は `agents/review-expert.md`、no-apply expert は `runtime-contract.md` §8)。

## ファイル競合の回避 (op-run の責務)

cluster 間で触るファイルが重なる場合は並列化せず、op-run の serial_chains (起動順による直列実行) に回す
(`op-run/SKILL.md` 2-B-partition)。判定不能なら直列化する。

## cleanup タイミング

| イベント | アクション |
|---------|----------|
| op-run apply 成功 → PR open | 保持 (review subagent が再 checkout する可能性) |
| op-run review 完了 (pro-reviewed 付与) | 保持 (マージ後に削除) |
| op-merge でマージ成功 | op-merge が完全削除 (worktree remove + branch -D)。GitHub で手動マージした場合は op-cleanup |
| op-merge で保留 / PR クローズ | 保持 (ユーザーが再開する可能性) |
| apply 失敗 (テスト落ち等) | `~/cwork/worktrees-failed/` へ隔離し、ユーザーに報告 (自動削除しない。1 週間以上滞留したら報告して判断を仰ぐ) |
| subagent タイムアウト | 隔離 (失敗と同じ) |

## cleanup コマンド

```bash
# 正常 cleanup (マージ後)
op run worktree cleanup --task-id <task-id> --success
# 失敗時の隔離 (worktrees-failed/ へ mv。隔離先をユーザーに報告する)
op run worktree cleanup --task-id <task-id> --failure
```

## 並列度 hard cap / soft warning gate

op-run controller は並列実装の開始直前に `git worktree list | wc -l` のスナップショットで滞留数を確認する (snapshot 判定のみ)。

| 状態 | 閾値 | 挙動 |
|------|------|------|
| 正常 | `≤ 16` | そのまま次フェーズへ |
| soft warning | `> 16` | 警告のみで続行 (auto モードでも続行)、`git worktree prune` / op-sweep を推奨 |
| hard cap | `> 32` | `exit 1` で fail-fast、`git worktree prune` / op-sweep での整理を促す |

```bash
WT_COUNT=$(git worktree list | wc -l)
if [ "$WT_COUNT" -gt 32 ]; then
  echo "worktree が hard cap (32) を超過: ${WT_COUNT} 件。git worktree prune / op-sweep で整理してから再実行" >&2
  exit 1
elif [ "$WT_COUNT" -gt 16 ]; then
  echo "[worktree-ops] soft warning: ${WT_COUNT} 件滞留中 (>16)。整理を検討 (続行)" >&2
fi
```
