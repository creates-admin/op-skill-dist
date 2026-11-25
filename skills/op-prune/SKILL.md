---
name: op-prune
description: 区画単位でコードベースの衛生を戻すスキル。モード省略時は両方を順に回す。--comments は増えすぎたコメントを必要最小限に削り、--tests は形骸化したテストを実バグを防ぐものだけに整理する。検出 → 人間承認 → expert が worktree で apply → PR。起票はしない。「op-prune」「コメント削除」「コメント掃除」「テスト整理」「ゴミテスト」等のキーワードで起動。
---

# op-prune: コメント / テストの衛生

1 件ずつは Low でも積もると読み手と保守を蝕むもの (過剰なコメント、何も守らないテスト) を区画ごとに削って PR にする。
op-scan / op-patrol は Critical / High だけを起票するので、この種の衛生は op-prune が担う。

- 判断基準: コメントは `~/.claude/skills/_shared/project-profile.md`「コメント作法」、テストは「このテストが落ちたとき防げる実バグを 1 文で言えるか」。
- Issue は起票しない。検出中に見つけた Critical / High 級の問題や `delegated_test_issue_request` は報告に載せ、`/op-skill:op-report` を案内する。
- マージは人間 (op-merge 可)。Direct Mode 固定 (`~/.claude/skills/_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。

## 起動

```
/op-skill:op-prune [--area <path>]...              # 両方 (comments → tests の順)
/op-skill:op-prune --comments [--area <path>]...   # コメントだけ
/op-skill:op-prune --tests    [--area <path>]...   # テストだけ
/op-skill:op-prune ... --dry-run                   # 検出結果の提示で止める
```

- 1 PR = 1 区画 × 1 モード。区画ごとに、指定モード (省略時は comments → tests) の順で フェーズ1〜4 を逐次回す。
- 両方回すときは comments の PR を作ってから tests の検出に進む。tests の worktree も base から作る (comments の PR には積まない)。
  両 PR が同じファイルを触って衝突したら、マージ時に op-merge が解消する。
- `--area` 省略時の候補出し: op-patrol フェーズ1 の find で `areas.txt` を作り、`op patrol score --areas-file areas.txt --random-seed-auto --json --out-file scored.json`
  → `op patrol area-select --input-file scored.json --budget small --max-experts-per-area 1 --json`。Ledger flags と run-id は付けない。
  score はリスク重みなので並べ替えにだけ使い、区画は人間が選ぶ。

## フェーズ0: 環境確認

`~/.claude/skills/_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」。GitHub I/O は `~/.claude/skills/_shared/github-channel.md` に従う。

base を確定し、以降の fence ではリテラルで書く (`~/.claude/skills/_shared/bash-fence-convention.md`):

```bash
BASE_REF="$(op run base-sha | jq -r '.payload.base_ref | sub("^origin/"; "")')"
git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"
op run base-sha --base-ref "origin/$BASE_REF" | jq -r '.payload.base_sha'   # → BASE_SHA
```

対象 repo の CLAUDE.md がコメント様式やテスト方針を定めていれば、それが優先する (project-profile「優先順位」)。
CLAUDE.md の規約 (例: 全関数に概要ヘッダ) が求めるコメントは削除候補にせず、規約そのものが発生源であることを検出結果の冒頭で人間に伝える。

## フェーズ1: 検出 (read-only)

区画ごとに expert を 1 体 spawn する (exploration-only、model は `~/.claude/skills/_shared/model-selection.md` §5.2)。

| モード | subagent_type | フェーズ名 |
|---|---|---|
| `--comments` | `op-skill:refactor-expert` | prune-comments-detect |
| `--tests` | `op-skill:test-expert` | prune-tests-detect |

spawn prompt には `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 (§2 は exploration-only)、「あなたはこのコードを書いていません」、
区画に対応する `.claude/rules/<feature>.md` があれば Read してから着手する旨の 1 行と、`references/spawn-prompts.md`「検出」の本文 (判断基準・返却の JSON) を含める。

| モード | action |
|---|---|
| comments | `delete` / `shorten` (理由だけ残す) / `keep` |
| tests | `keep` / `strengthen` (assert・mock の書き直し) / `merge` (parametrize 等) / `quarantine` / `delete` / `add` (回帰テスト欠落) / `needs_decision` |

- tests の削除は expert-test「テスト削除の 3 段階モデル」に従う。`quarantine` が段階 2、`delete` は段階 3 (観察期間経過・CI green 継続) か collect 不能な dead test だけ。
- 価値も根拠も判断できないもの (追加意図が復元できない古いテスト、UI 仕様かもしれない snapshot、business rule に見えるもの) は `needs_decision`。

## フェーズ2: 提示と承認

提示の形は `references/spawn-prompts.md`「提示」。

- 1 回で確認しきれない量 (目安: comments 80 件 / tests 20 件超) はファイル単位に分けて提示する。
- `--dry-run`・キャンセル・候補 0 件はここで終了する。

## フェーズ3: apply (worktree)

```bash
op run worktree create --task-prefix "prune-<comments|tests>" --base-ref "<BASE_REF>" --base-sha "<BASE_SHA>"
# → payload の task_id / worktree_path / branch を控える
```

同種の expert を新規に spawn する (isolation は付けない。作業場所は上の worktree)。spawn prompt は `spawn-prompt-common.md` §1〜§5
(§2 は apply、フェーズ名 = prune-apply) と `references/spawn-prompts.md`「apply」の本文を含める。

検証は `project-profile.md`「Verification Ladder」Level 1〜2 (comments で公開 API の doc を触ったら Level 3)。

完了後は `~/.claude/skills/_shared/apply-completion-verify.md` に従う
(`op apply verify-commit --worktree <worktree_path> --base-ref <BASE_REF> --reported-json '<commits_added>'`、分岐は同ファイル §2-3 / §2-4)。
隔離に至ったら `op run worktree cleanup --task-id <task_id> --failure` して報告する。

## フェーズ4: PR

```bash
git -C "<worktree_path>" push origin "<branch>"
cat > "<worktree_path>.pr-body.md" <<'EOF'
<PR 本文>
EOF
op pr create --base "<BASE_REF>" --head "<branch>" --title "prune(<comments|tests>): <area>" --body-file "<worktree_path>.pr-body.md"
```

- 本文: 区画、承認した items の表 (action と reason)、実行した検証 Level。tests は故障注入の結果・quarantine / delete の削除根拠
  (test-expert の完了報告から転記)・次に物理削除できる時期。
- worktree は残す (マージ後に op-merge / op-cleanup が片付ける。`~/.claude/skills/_shared/worktree-ops.md`「cleanup タイミング」)。
  push か PR 作成に失敗したら `--failure` で隔離して報告する。

## フェーズ5: 報告

区画 / モード / action 別の apply 件数 / PR URL / apply しなかった候補と needs_decision / 起票を勧める問題を報告し、
区画が残っていれば次の区画に進むか人間に聞く。
