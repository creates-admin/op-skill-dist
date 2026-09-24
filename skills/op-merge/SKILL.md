---
name: op-merge
description: open PR を監査し、依存と変更ファイルの重なりからマージ順を決め、人間の 1 回の承認後に 1 本ずつ直列でマージするスキル。コンフリクトは expert に merge commit で解消させ、CI green を確認してからマージし、紐づく Issue の close と worktree の片付けまで行う。「マージ」「op-merge」「取り込み」「PR 整理」等のキーワードで起動。
effort: high
---

# op-merge: PR 監査 → 順序決定 → 直列マージ

## 不変則

- **Direct Mode 固定** (`_shared/invocation-mode.md`)。spawn した expert は OP-managed。
- **承認なしにマージしない**。人間 gate はフェーズ3 の 1 回で、承認された PR・順序だけを実行する。
- **司令官はコードを編集しない**。コンフリクト解消は expert に委譲する (`_shared/expert-spawn.md`)。
- **履歴を書き換えない**。rebase / force-push / reset はしない。base の取り込みは merge commit で行う。
- **CI red のままマージしない**。
- **保留を黙って飛ばさない**。保留した PR は理由と人間がやることを完了報告に必ず載せる。
- 監査の判定は gate 表ではなく司令官の判断。判定には必ず根拠を添える。
- spawn の `subagent_type` は `op-skill:<name>` (`_shared/expert-spawn.md`「Plugin scoped-name 規約」)。
- remote branch は削除しない (op-sweep の担当)。

## 起動

```
/op-skill:op-merge                   # open PR のうち head が auto/* または pro-reviewed ラベル付き
/op-skill:op-merge #210 #212         # 指定 PR のみ
/op-skill:op-merge --label <name>    # ラベルで絞る
/op-skill:op-merge --all             # 人間の PR を含む open PR すべて
/op-skill:op-merge --strategy merge  # マージ方式 (squash | merge | rebase)。既定は repo の慣習、不明なら squash
```

## フェーズ0: 環境確認

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」に従う。GitHub I/O は `_shared/github-channel.md`。

- gh channel: 下記の `op` / `gh` をそのまま使う。
- mcp channel: `op` の read 系 (`pr view` / `pr list` / `issue view` / `issue dep-graph`) は fail-closed する。
  PR 素材は `mcp__github__search_pull_requests` (`repo:<owner>/<repo> is:pr is:open`、labels と raw body を含む) と
  `mcp__github__pull_request_read` (get / get_files / get_check_runs)、review state は
  `op review state pull --pr <N> --input-json <search item>` で読む。write (`op pr merge` / `op issue close`) は
  call-spec を同ファイル §4 どおり完遂する。marker は search 素材の raw body からだけ読む (§6)。

## フェーズ1: 対象 PR の収集

```bash
gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,isDraft,labels,author  # 既定 / --all
op pr list --label <name>                                                                               # --label
```

既定は `headRefName` が `auto/` で始まるか `pro-reviewed` ラベル付きの PR に絞る。番号指定時はその PR のみ。
対象 0 件なら「マージ対象の PR はありません」で終了する。

## フェーズ2: 監査 (PR ごと、read-only、並列可)

```bash
git fetch origin
git fetch origin "+refs/pull/<N>/head:refs/remotes/origin/pr/<N>"
op pr view <N> --include meta        # isDraft / mergeable / headRefName / headRefOid / baseRefName / headRepositoryOwner
op pr view <N> --include files       # 変更ファイル
op pr view <N> --include body-comments-commits   # 本文 (Fixes #M) / コメント
gh pr checks <N> --json name,state,bucket        # CI
op review state pull --pr <N>        # details.found / state.attempts[] 最新の review_result・reviewed_head_sha
op issue view <M> --include meta     # 紐づく Issue の成功条件・labels
git merge-tree --write-tree origin/<base> origin/pr/<N> >/dev/null   # exit 1 = conflict
git diff --stat origin/<base>...origin/pr/<N>
```

観点:

| 観点 | 見るもの |
|---|---|
| CI | 全 check の bucket。fail / pending / CI なし を区別する |
| conflict | `merge-tree` の結果と `mergeable`。conflict 自体は保留理由にならない (フェーズ4 で解消する) |
| draft | draft は保留 (ready 化は人間が行う) |
| review | `pro-reviewed` / `pro-review-blocked` / `pro-review-needs-fix` / `needs:human-decision` ラベル、state の最新 `review_result` と `reviewed_head_sha == headRefOid` か。op-run 由来でない PR は `found: false` になるので「review 記録なし」と明示する |
| Issue 妥当性 | `Fixes #M` の Issue の成功条件を diff が満たすか。司令官が diff を読んで判断する |
| 重複ファイル | 他の対象 PR と変更ファイルが重なるか (PR 番号とファイル数) |
| fork | `headRepositoryOwner` が origin と違う PR は branch に push できないため、conflict があれば保留 |

diff が大きい・意図が読み切れない PR は、判断材料として review-expert を read-only で spawn してよい:

```
Agent({
  subagent_type: "op-skill:review-expert",
  model: "opus",
  isolation: "worktree",
  description: "merge-audit PR #<N>",
  prompt: """
    invocation_mode: op_managed
    <`_shared/spawn-prompt-common.md` §2 (exploration-only) / §4 を全文>

    あなたはこの PR を書いていない独立 reviewer です。op-merge から呼ばれました。
    PR #<N> (branch origin/pr/<N>、base origin/<base>) が Issue #<M> の成功条件を満たし、マージしてよい状態かを read-only で判定してください。
    コード修正・commit・push・PR コメント・label 操作・`op review state push` はしない。
    返却: verdict (approve | needs-fix | blocked) / 根拠 3 行以内 / 主要 finding (severity・file・1 行要約)
  """
})
```

各 PR を `merge 可` / `要修正` / `保留` に分け、理由を 1 行で書く。例: CI fail・review needs-fix・成功条件の未達は
`要修正`、draft・`needs:human-decision`・判断材料不足・fork で conflict は `保留`。

## フェーズ3: 順序決定 + 人間 gate

`merge 可` の PR を次の優先順で並べる。

1. `op:blocking-finding` ラベルの Issue を直す PR を最優先
2. 紐づく Issue の依存 (`op issue dep-graph --numbers <M...>` の層順、`op-depends-on`)。依存先の PR を先
3. 他の PR が依存する基盤変更・共有ファイルを触る PR を先
4. 変更ファイルの重なりが多い PR 同士は差分の小さい方を先 (後続のコンフリクトを減らす)

監査表とマージ順を提示し、AskUserQuestion で計画全体の承認を 1 回だけ取る。

```
## op-merge 計画 (base: main)

| 順 | PR | タイトル | 由来 | CI | conflict | review | Issue | 重複 | 判定 | 理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | #210 | ... | op-run | pass | なし | approve (最新 head) | #42 成功条件充足 | #212: 2 files | merge 可 | 基盤変更で #212 が依存 |
| 2 | #212 | ... | op-run | pass | あり | approve | #43 充足 | #210: 2 files | merge 可 | #210 後に conflict 解消 |
| - | #215 | ... | 人間 | fail | なし | 記録なし | なし | - | 要修正 | test_x が fail |

方式: squash
```

選択肢: 「この計画で実行」/「一部を除外して実行 (除外する PR 番号を指定)」/「中止」。
除外指定があれば順序を組み直して表示し、除外 PR に依存する PR も除外する。承認後はフェーズ4 で追加の確認をしない。

## フェーズ4: 実行 (承認順に 1 本ずつ直列)

各 PR の開始時に `git fetch origin` と `git fetch origin "+refs/pull/<N>/head:refs/remotes/origin/pr/<N>"` で最新化する。
PR を保留にしたら、その PR に依存する後続 PR (Issue 依存・順序根拠が依存だったもの) も保留にして次へ進む。

### 4-1. base との整合

- `git merge-tree --write-tree origin/<base> origin/pr/<N>` が conflict → 4-2。
- conflict は無いが、この run で直前にマージした PR と変更ファイルが重なる → `gh pr update-branch <N>`
  (mcp: `mcp__github__update_pull_request_branch`、merge 方式。`--rebase` は使わない) で base を取り込み 4-3 へ。
- どちらでもなければ 4-3 へ。

### 4-2. コンフリクト解消 (expert に委譲)

fork PR なら保留。それ以外は PR head から worktree を作る (`_shared/worktree-ops.md`):

```bash
op run worktree create --task-prefix merge-pr<N> --base-ref <headRefName> --base-sha <headRefOid>
# → details の worktree_path / task_id を控える (local branch は auto/merge-pr<N>-<ts>)
```

expert は紐づく Issue を `op run expert-resolve` で解決した apply expert (marker の値を直接 `subagent_type` にしない。
`needs_human_decision` / 解決不能 / Issue が無い場合は `feature-expert`):

```bash
# BODY / LABELS_JSON はフェーズ2 の `op issue view <M> --include meta` で得た本文とラベル名配列
jq -n --argjson n <M> --arg body "$BODY" --argjson labels "$LABELS_JSON" \
  '{issue_number:$n, body:$body, labels:$labels}' | op run expert-resolve --stdin \
  | jq -r '.payload.apply_expert // "feature-expert"'
```

```
Agent({
  subagent_type: "op-skill:<expert>",
  model: "opus",
  description: "merge-conflict: PR #<N>",
  prompt: """
    invocation_mode: op_managed
    <`_shared/spawn-prompt-common.md` §2 (apply) / §4 を全文>

    あなたは <expert> です。op-merge から呼ばれました。PR #<N> に base を取り込み、コンフリクトを解消してください。
    - 作業ディレクトリ: <worktree_path> (PR head <headRefOid> から作成済み)
    - 取り込む base: origin/<base> (<base sha>)。`git merge --no-ff origin/<base>` で取り込む
    - PR の意図: <PR 本文の要約 / Issue #<M> の成功条件>
    - base 側で入った変更: <この run でマージした PR 番号と要約>
    - 両側の意図を保って解消する。一方の変更を捨てる・仕様判断が要る衝突は解消せず needs_human_decision で返す
    - 解消後に検証コマンド (対象 repo の CLAUDE.md、無ければ `_shared/project-profile.md`) を実行し、pass したら merge commit を作る
    - rebase / reset / force-push / push はしない。衝突の解消に必要な箇所以外は編集しない
    返却: 修正完了報告 schema (`_shared/expert-spawn.md`) + resolved_files[] + 衝突ごとの解消方針 1 行
  """
})
```

- `status: completed` かつ検証 pass → 4-2-r (軽量レビュー) → pass なら司令官が
  `git -C <worktree_path> push origin HEAD:<headRefName>` (fast-forward のみ。拒否されたら PR が更新されているので保留) → 4-3。
- `needs_human_decision` / 検証 fail / `blocked` → 保留。`op run worktree cleanup --task-id <task_id> --failure` で隔離し、
  隔離先と expert の報告を完了報告に載せる。

#### 4-2-r. 解消 commit の軽量レビュー (別 context)

解消した expert とは別 context の review-expert に、**解消 commit だけ**を read-only でレビューさせる
(PR 全体の再レビューはしない。PR 本体は op-run の review 済みという前提)。

```
Agent({
  subagent_type: "op-skill:review-expert",
  model: "opus",
  description: "merge-resolution review: PR #<N>",
  prompt: """
    invocation_mode: op_managed
    <`_shared/spawn-prompt-common.md` §2 (exploration-only) / §4 を全文>

    op-merge のコンフリクト解消 commit を軽くレビューしてください。read-only (編集・commit・push 禁止)。
    - 作業ディレクトリ: <worktree_path>、対象: merge commit <sha> (`git show --cc <sha>` と `git diff <headRefOid> <sha>`)
    - PR の意図: <PR 本文の要約 / Issue #<M> の成功条件>、base 側の変更: <この run でマージした PR と要約>
    - 確認するのは次の 3 点だけ:
      1. 両側の変更が失われていない (片側の hunk の取りこぼし・巻き戻しがない)
      2. 解消に不要な変更が混ざっていない
      3. expert の検証結果が妥当 (該当テストが実行されている)
    返却: { verdict: "pass" | "fail", findings: [ { file, line, problem } ] }  (fail は具体的な根拠がある場合のみ)
  """
})
```

- `pass` → push して 4-3。
- `fail` → push せず保留。worktree を `--failure` で隔離し、findings を完了報告に載せる。

### 4-3. CI 待ち

```bash
timeout 900 gh pr checks <N> --watch --interval 60 --fail-fast   # run_in_background で起動し完了通知を待つ
```

mcp channel は `pull_request_read` (get_check_runs) を 60 秒間隔・上限 15 分で確認する。
exit 0 (全 green) → 4-4。fail → 保留。15 分で終わらない → 保留 (pending のまま)。CI が無い repo はフェーズ3 で
「CI なし」と承認済みならそのまま 4-4。

### 4-4. マージ

```bash
op pr merge --pr <N> --strategy <squash|merge|rebase>
op pr view <N> --include meta    # state が MERGED になったことを確認
```

`--delete-branch` は付けない。GitHub がマージを拒否した (branch protection・必須 review 等) ら保留にして理由を記録する。

### 4-5. 後片付け

- 紐づく Issue を `op issue view <M> --include meta` で確認し、OPEN のままなら
  `op issue close --issue <M> --comment "PR #<N> のマージで解決"`。
- `op run worktree cleanup --task-id <id> --success` を、4-2 の worktree と、head が `auto/<task-id>` で
  `~/cwork/worktrees/<repo>/<task-id>/` が残っている op-run の worktree に対して行う。

次の PR は新しい base に対して 4-1 から行う。

## フェーズ5: 完了報告

```
## op-merge 完了 (base: main)

### マージした PR
- #210 <タイトル> (squash) — close: #42
- #212 <タイトル> (squash) — conflict 解消あり、close: #43

### 解消したコンフリクト
- #212: src/foo.rs — #210 の API 変更に合わせて呼び出し側を更新 (feature-expert、検証 pass、解消レビュー pass)

### 保留した PR
- #214: CI fail (test_y) → 修正して再実行
- #216: 解消に仕様判断が必要 (<needs_human_decision.reason>) → 方針を決めて /op-skill:op-merge #216。隔離 worktree: <path>
- #217: #216 に依存するため保留

### 計画から外した PR (フェーズ2 で要修正 / 保留)
- #215: CI fail → PR 作成者が修正
```
