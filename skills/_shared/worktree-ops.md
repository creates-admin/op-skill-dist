# worktree ライフサイクル運用

op-run は各クラスタを独立した git worktree に隔離して並列実装する。本ファイルはパス規則・作成・cleanup・滞留数 gate の正本。

---

## ディレクトリ規約

| 状態 | パス |
|------|------|
| 作業中 | `~/cwork/worktrees/<repo-name>/<task-id>/` |
| 失敗・隔離 | `~/cwork/worktrees-failed/<repo-name>/<task-id>-<timestamp>/` |
| メイン作業 | `<repo-path>/` (司令官専用、編集禁止) |

- `<repo-name>`: `basename $(git rev-parse --show-toplevel)`
- `<task-id>`: `<verb>-<short>-<YYYYMMDD-HHMMSS>-<cluster-id>` (例: `fix-auth-20260502-143052-c1`)。`<cluster-id>` は `c1` / `c2` 等。cluster が 1 つだけ (op-merge の単独 worktree 等) なら省略可
- ブランチ名: `auto/<task-id>`
- OP skill が自動生成する branch の一般形: `auto/<source>-<verb>-<short>-YYYYMMDD-HHMMSS[-<cluster-id>]` (`<source>` = `run` / `architect` / `plan` 等。op-run の source 省略形も有効)。手動 branch (`fix/*` / `feat/*`) は `auto/` を持たず op-sweep の対象外
- worktree を main リポジトリ配下に作らない。

---

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

op-run 起動前に `OP_RUN_BASE_SHA` / `OP_RUN_BASE_REF` を `export` しておくと、フェーズ0-base はその値を尊重して SHA 再計算を skip する (op-loop が層 N+1 の base を層 N のマージ後 HEAD へ前進させる用途、詳細: ADR-0019)。

```bash
export OP_RUN_BASE_SHA="<layer-N-merged-head-sha>"
export OP_RUN_BASE_REF="main"   # base_sha が指すブランチ名と整合させる
```

- SHA と REF の整合は呼出側の責務。不整合時の動作は未定義。
- 注入時も 1 回の op-run 起動内では全 cluster が同じ SHA を使う。

---

## subagent 起動時の prompt に渡す情報

```
- 作業ディレクトリ: <WT_PATH>
- ブランチ: <BRANCH>          ← prompt 内のすべての参照箇所でこの値を使う (apply / review / post-check 共通)
- base ref: ${OP_RUN_BASE_REF}
- 起点 commit: ${OP_RUN_BASE_SHA}
- 触ってよいファイル: <マニフェスト>
- 並列タスクが触るファイル: <マニフェスト> ← 触らない
- push は司令官が実施する: subagent は push しない (commit までで停止)
```

subagent は worktree で作業し commit まで行う。push は司令官が op-run フェーズ2-D (Post-run conflict check) で実 diff の重複検証を通した後に行う。push の例外はない (review subagent を含む。review-expert の禁止事項は `expert-spawn.md` / `runtime-contract.md` §8)。

---

## ファイル競合検出 (op-run の責務)

並列実行前に司令官が行う:

1. 各クラスタの「触る予定ファイル」をマニフェスト化
2. クラスタ間で突き合わせ、重複ファイルを検出
3. 重複あり → そのペアは **直列化** (一方を完了 → main にマージ → もう一方を rebase)
4. 直列化困難 (両方 Critical 等) → ユーザーに相談し片方を遅延

競合の疑いがあれば並列化せず直列化する。

---

## cleanup タイミング

| イベント | アクション |
|---------|----------|
| op-run apply 成功 → PR open | 保持 (review subagent が再 checkout する可能性) |
| op-run review 完了 (pro-reviewed 付与) | 保持 (マージ後に削除) |
| op-merge でマージ成功 | op-merge が完全削除 (worktree remove + branch -D)。GitHub で手動マージした場合は op-cleanup |
| op-merge で保留 / PR クローズ | 保持 (ユーザーが再開する可能性) |
| apply 失敗 (テスト落ち等) | `~/cwork/worktrees-failed/` へ隔離し、ユーザーに報告 |
| 30 分タイムアウト | 隔離 (失敗と同じ) |

---

## cleanup コマンド

```bash
# 正常 cleanup (マージ後)
op run worktree cleanup --task-id <task-id> --success
# 失敗時の隔離 (worktrees-failed/ へ mv。隔離先をユーザーに報告する)
op run worktree cleanup --task-id <task-id> --failure
```

---

## 司令官のクリーンアップポリシー

- 削除は merge 後のみ。レビュー済みでも未マージの PR の worktree は残す。
- 1 週間以上滞留している隔離 worktree はユーザーに報告して判断を仰ぐ (自動削除しない)。

---

## 並列度 hard cap / soft warning gate

op-run controller は並列実装の開始直前に `git worktree list | wc -l` のスナップショットで滞留数を確認する (snapshot 判定のみ。後から増える worktree は対象外)。`op cluster max-parallel` の論理上限とは独立の物理ガード。

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
