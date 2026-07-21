<!--
schema_version: 3
last_breaking_change: 2026-05-21
notes: v3 (2026-05-21) — 並列度撤廃モード対応 (ADR-0007 v3 §4.1-v3)。
       `司令官のクリーンアップポリシー` 節の「>10 で警告」soft warning を撤廃し、
       新規 `並列度 hard cap / soft warning gate` 節を追加:
         - soft warning >16 (警告のみ続行) — op-run controller が fence 起点で観察
         - hard cap >32 (fail-fast) — op-run controller 起動直後の worktree snapshot で gate
       hard cap 32 の根拠は ADR-0007 v3 §4.1 の `MAX_PARALLEL_HARD_CEIL` と整合。
       本変更で「>10 で警告」 旧ルールを撤廃したため schema_version を bump (Fixes #341)。
       v2 — worktree base を origin/main 固定から OP_RUN_BASE_REF / OP_RUN_BASE_SHA 契約へ変更。
       op-run controller がフェーズ0-base で唯一の base ref / SHA を確定させ、worktree 作成・apply prompt・
       post-run diff・PR base・post-check diff・global review baseRefName 検証で同じ値を共有する。
       v1: 初版。schema_version 導入時点でのスナップショット (~/cwork/worktrees パス規則・隔離フォルダ運用)。
       ADR-0002 (2026-05-18) で auto/ prefix 統一規約を追記。
       OP skill 自動生成 branch はすべて auto/ prefix を持つ命名規則に統一 (op-sweep スコープ前提)。
       (2026-06-21) 外部 base 注入節を追記 (op-loop 層前進対応、additive・非破壊、#807)。
-->

# worktree ライフサイクル運用

/**
 * 機能概要: op-run の並列実装・op-merge の cleanup で使う worktree のライフサイクルを定義する
 * 作成意図: 並列タスクのファイル競合をディスクレベルで防ぎ、main リポジトリを汚さずに作業を分離する
 * 注意点: 失敗時の worktree は自動削除しない。ユーザー判断に委ねるため隔離フォルダに残す
 */

op-run は複数のクラスタを並列実装するため、各クラスタを独立した git worktree に隔離する。
本ドキュメントは worktree のパス規則・ライフサイクル・cleanup タイミングを集約する。

---

## ディレクトリ規約

| 状態 | パス |
|------|------|
| 作業中 | `~/cwork/worktrees/<repo-name>/<task-id>/` |
| 失敗・隔離 | `~/cwork/worktrees-failed/<repo-name>/<task-id>-<timestamp>/` |
| メイン作業 | `<repo-path>/` (司令官専用、編集禁止) |

- `<repo-name>`: `basename $(git rev-parse --show-toplevel)`
- `<task-id>`: `<verb>-<short>-<YYYYMMDD-HHMMSS>-<cluster-id>` (例: `fix-auth-20260502-143052-c1`)
  - 秒粒度 + cluster id を含めることで、同一分内に複数クラスタを並列起動した場合の worktree / branch 名衝突を防ぐ
  - `<cluster-id>` は op-run のクラスタリング結果 (`cluster-1` / `cluster-2` 等) を短縮した識別子 (例: `c1` / `c2`)
  - cluster が 1 つしかない場合 (op-merge の単独 worktree 等) は `<cluster-id>` 部を省略してよい
- ブランチ名: `auto/<task-id>` (PR 作成時にこの名前で push)

**branch 命名の一般形 (ADR-0002)**:
OP skill が自動生成する branch はすべて `auto/` prefix を持つ。

```
一般形: auto/<source>-<verb>-<short>-YYYYMMDD-HHMMSS[-<cluster-id>]
```

- `<source>`: OP skill 識別子 (`run` / `architect` / `plan` 等)
- 後方互換: 既存 op-run 短縮形 `auto/<verb>-<short>-YYYYMMDD-HHMMSS-<cluster-id>` は保持 (source を省略した形式)
- 手動 branch (`fix/*` / `feat/*` 等) は `auto/` prefix を持たず、op-sweep の対象外

worktree を main リポジトリ配下に作らないこと (gitignore の事故を避ける)。

---

## 作成手順

```bash
REPO_PATH=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "${REPO_PATH}")
RUN_TS=$(date +%Y%m%d-%H%M%S)        # 秒粒度。同分内に複数 worktree を作っても衝突しない
CLUSTER_ID="c1"                       # op-run のクラスタID (c1 / c2 / ...)。単独 worktree なら省略可
TASK_ID="<verb>-<short>-${RUN_TS}${CLUSTER_ID:+-${CLUSTER_ID}}"
WT_PATH="${HOME}/cwork/worktrees/${REPO_NAME}/${TASK_ID}"
BRANCH="auto/${TASK_ID}"

# v2 契約: 起点 ref / SHA は op-run controller がフェーズ0-base で確定させた
# OP_RUN_BASE_REF / OP_RUN_BASE_SHA を使う (origin/main 直接参照は禁止)
: "${OP_RUN_BASE_REF:?OP_RUN_BASE_REF must be set by op-run controller (phase 0-base)}"
: "${OP_RUN_BASE_SHA:?OP_RUN_BASE_SHA must be set by op-run controller (phase 0-base)}"

# 並列タスク全員が同じ origin/${OP_RUN_BASE_REF} の OP_RUN_BASE_SHA から分岐する (rebase 地獄回避)
git fetch origin "${OP_RUN_BASE_REF}:refs/remotes/origin/${OP_RUN_BASE_REF}"
mkdir -p "$(dirname "${WT_PATH}")"
git worktree add "${WT_PATH}" -b "${BRANCH}" "origin/${OP_RUN_BASE_REF}"
```

---

### 外部 base 注入 (op-loop 等の上位 orchestrator による層ごとの base 前進)

通常、`OP_RUN_BASE_SHA` は op-run controller がフェーズ0-base で唯一確定する。
op-loop 等の上位 orchestrator が DAG の層 N+1 の base を層 N のマージ後 HEAD に前進させたい場合、
op-run 起動前に `OP_RUN_BASE_SHA` を `export` しておくと op-run のフェーズ0-base がその値を尊重する。

```bash
# 呼出側 (op-loop) が層ごとに前進させた SHA を注入する例 (ADR-0019 D6)
export OP_RUN_BASE_SHA="<layer-N-merged-head-sha>"
export OP_RUN_BASE_REF="main"  # base_sha が指すブランチ名と整合させること
# この状態で op-run を起動すると、フェーズ0-base の guard が注入値を尊重して SHA 再計算をスキップする
```

**整合性の責務**: `OP_RUN_BASE_SHA` と `OP_RUN_BASE_REF` の整合は呼出側 (op-loop) の責務。
op-run は両者が整合しているとみなして動作する。不整合時の動作は未定義。

既存の契約「**全 cluster 同一 base 共有 (rebase 地獄回避)**」は引き続き有効。
外部注入時も 1 回の op-run 起動内では全 cluster が同じ注入 SHA を使う。

---

## subagent 起動時の prompt に渡す情報

司令官は worktree を作成した後、subagent に以下を必ず明示する:

```
- 作業ディレクトリ: <WT_PATH>
- ブランチ: <BRANCH>          ← この値を prompt 内のすべての参照箇所で使う (apply / review / post-check 共通)
- base ref: ${OP_RUN_BASE_REF}     ← v2: op-run controller がフェーズ0-base で確定済の唯一値
- 起点 commit: ${OP_RUN_BASE_SHA}  ← v2: 同上 (origin/main の直接参照は禁止)
- 触ってよいファイル: <マニフェスト>
- 並列タスクが触るファイル: <マニフェスト> ← 触らない
- push は司令官が実施する: subagent は push しない (commit までで停止)
```

subagent は cd して作業し、**commit まで**実施する。
**push は司令官が op-run のフェーズ2-D (Post-run conflict check) で実 diff の重複検証を通したあとに実施する**。
これにより、並列実装中に競合する diff が remote へ流出する事故を構造的に防ぐ。

例外として、**review subagent の直接 push 許可範囲** (`expert-spawn.md` の「review agent の直接 push 許可範囲」節) のみ、
review subagent が PR ブランチへ push してよい (typo / コメント修正 / 軽微な振る舞いを変えない修正)。
それ以外の subagent (apply / post-check / scan) は一切 push しない。

---

## ファイル競合検出 (op-run の責務)

並列実行前に司令官が必ず実施する:

1. 各クラスタの「触る予定ファイル」をマニフェスト化
2. クラスタ間でマニフェストを突き合わせ、重複ファイルを検出
3. 重複あり → そのクラスタペアは並列化せず **直列化** (一方を先に完了 → main にマージ → もう一方を rebase)
4. 直列化困難 (両方 Critical 等) → ユーザーに相談、片方を遅延させる

**コンフリクトは絶対に起こさない方針。** 推測で並列化せず、競合の疑いがあれば直列化。

---

## cleanup タイミング

| イベント | アクション |
|---------|----------|
| op-run apply 成功 → PR open | worktree は保持 (review subagent が再 checkout する可能性) |
| op-run review 完了 (pro-reviewed 付与) | worktree は保持 (op-merge 後に削除) |
| op-merge 成功 | `git worktree remove` + `git branch -D` で完全削除 |
| op-merge 中断 / クローズ | worktree は保持 (ユーザーが再開する可能性) |
| apply 失敗 (テスト落ち等) | `~/cwork/worktrees-failed/` に mv して隔離、ユーザーに報告 |
| 30 分タイムアウト | 隔離扱い (失敗と同じ) |

---

## cleanup コマンド

```bash
# 正常 cleanup (op-merge 成功後)
git worktree remove "${WT_PATH}"
git branch -D "${BRANCH}" 2>/dev/null || true
git worktree prune

# 失敗時の隔離
FAIL_DIR="${HOME}/cwork/worktrees-failed/${REPO_NAME}/${TASK_ID}-$(date +%s)"
mkdir -p "$(dirname "${FAIL_DIR}")"
mv "${WT_PATH}" "${FAIL_DIR}"
git worktree prune
echo "失敗 worktree を ${FAIL_DIR} に隔離。手動確認してください。"
```

---

## 司令官のクリーンアップポリシー

- **削除は merge 後のみ**。レビュー済みでもマージされていない PR の worktree は残す
- 1 週間以上滞留している隔離 worktree はユーザーに報告して判断を仰ぐ (自動削除しない)
- worktree 滞留数の物理ガード閾値は次節「並列度 hard cap / soft warning gate」を参照

---

## 並列度 hard cap / soft warning gate (ADR-0007 v3 §4.1-v3)

/**
 * 機能概要: op-run controller が並列実装を開始する直前に worktree 物理滞留数を確認し、
 *           hard cap (>32) なら fail-fast、soft warning (>16) なら警告のみで続行する。
 * 作成意図: op-run の並列上限を撤廃可能にしつつ (ADR-0007 v3 §4.1-v3 で hard ceil 32 に拡張)、
 *           disk inode / git worktree race / controller 1 turn token (≤250K target) の
 *           物理的安全柵を別レイヤから確保する。op cluster max-parallel の論理的上限
 *           (32) と本ファイルの物理的 gate (32) を二重に張る多層防御。
 * 注意点: 本 gate は op-run controller 起動直後 (フェーズ 0 環境確認 / フェーズ 1-2-f の
 *         EFFECTIVE_MAX_PARALLEL 算出と同フェーズ周辺) で実行する。後から増える worktree
 *         (op-merge cleanup 遅延等) は本 gate の対象外 (snapshot 判定)。
 *         op-sweep が auto/ prefix の squash-merge 済み worktree を grace 後に剥がす運用が
 *         前提 (ADR-0003)。本 gate は housekeeping を強制するシグナル発火ポイント。
 */

op-run controller は並列実装を開始する直前に `git worktree list | wc -l` のスナップショットで
物理滞留数を確認し、以下の gate を適用する。

| 状態 | 閾値 | 挙動 |
|------|------|------|
| 正常 | `≤ 16` | 黙って次フェーズへ |
| soft warning | `> 16` | 警告表示のみで続行 (auto モードでも続行)、`git worktree prune` 推奨 |
| hard cap | `> 32` | op-run controller が `exit 1` で fail-fast、`git worktree prune` / `op-sweep` を促す |

### 想定スニペット (op-run controller フェーズ 0 周辺)

```bash
WT_COUNT=$(git worktree list | wc -l)
WT_SOFT_WARN=16
WT_HARD_CAP=32

if [ "$WT_COUNT" -gt "$WT_HARD_CAP" ]; then
  echo "❌ worktree が hard cap (${WT_HARD_CAP}) を超過: ${WT_COUNT} 件滞留中" >&2
  echo "   → git worktree prune / op-sweep で整理してから op-run を再実行してください" >&2
  exit 1
fi

if [ "$WT_COUNT" -gt "$WT_SOFT_WARN" ]; then
  echo "[worktree-ops] soft warning: ${WT_COUNT} 件滞留中 (>${WT_SOFT_WARN})" >&2
  echo "  → git worktree prune または op-sweep で整理を検討してください (続行します)" >&2
fi
```

### 根拠 / 不変則

- hard cap = 32 は ADR-0007 v3 §4.1-v3 の `MAX_PARALLEL_HARD_CEIL` と一致する物理ガード。
  論理 (`op cluster max-parallel`) と物理 (本 gate) の二重防御として独立に保持する。
- soft warning = 16 は `CONTROLLER_CHUNK_BUDGET` と一致 (op-run/SKILL.md フェーズ 1-2-f)。
  controller 1 turn payload (≤250K token 目安) の自然な区切り。
- snapshot 判定のみ。後から増える worktree (op-merge cleanup 遅延 / 並列 instance race 等) は対象外。
- hard cap hit が頻発する場合は ADR-0007 v3 §例外条件に従って閾値 16 / 32 を縮小再評価する。

---

## 司令官の責務まとめ

| フェーズ | 司令官 | subagent |
|---------|-------|---------|
| 作成 | worktree add + ブランチ作成 | — |
| 実行 | 進捗監視 | worktree 内で apply + commit (push しない) |
| Post-run conflict check | 実 diff の重複検証後に push | — |
| PR open | gh pr create (push 後) | (apply subagent は閉じる) |
| review | 別 worktree で review-expert spawn (global review 専任、修正・push しない) | review subagent は別 worktree で動き、finding を残すのみ。修正は op-run が specialist に再委任 |
| マージ | gh pr merge | — |
| cleanup | worktree remove + branch -D | — |
