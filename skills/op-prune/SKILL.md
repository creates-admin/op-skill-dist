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

`~/.claude/skills/_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」。GitHub I/O は `~/.claude/skills/_shared/github-channel.md` の channel 判定に従う。

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
区画に対応する `.claude/rules/<feature>.md` があれば Read してから着手する旨の 1 行を含め、加えて:

```
対象区画: <area path>
モード: comments | tests
判断基準:
  comments: project-profile「コメント作法」の NG 表に当たるコメントを列挙する。
            残すもの: 自明でない制約・回避策・安全性の注意・公開 API の契約・Issue 参照付き TODO・対象 repo の CLAUDE.md が求める様式・
            lint / コンパイラ指示 (eslint-disable / @ts-expect-error / # noqa / // ignore: / //go:build / prettier-ignore)・
            doctest を含む doc comment・// SAFETY:・ライセンスヘッダ。
  tests:    各テストについて「落ちたとき防げる実バグ」を 1 文で書く。書けないものは expert-test の garbage-patterns catalog で分類する。
            区画の fix commit のうち回帰テストが無いものと、skip 済みテストで観察期間 (expert-test「テスト削除の 3 段階モデル」) を
            過ぎたものも挙げる。
返却 (JSON のみ):
  { "area": "<path>", "rule_conflict": "<CLAUDE.md の規約が発生源なら説明、無ければ null>",
    "items": [ { "id": "P1", "file": "<path>", "line": <n>, "kind": "<NG 種別 / catalog 分類 / regression-gap>",
                 "action": "<下表>", "reason": "<1 文>",
                 "bug_prevented": "<tests のみ。書けなければ null>",
                 "recommendation": "<tests のみ。何をどう変えるか>",
                 "evidence": "<tests のみ。grep / coverage / git log の根拠>",
                 "risk_if_changed": "<tests のみ>", "protected_behavior": "<tests のみ>", "confidence": "<tests のみ high|medium|low>" } ] }
```

| モード | action |
|---|---|
| comments | `delete` / `shorten` (理由だけ残す) / `keep` |
| tests | `keep` / `strengthen` (assert・mock の書き直し) / `merge` (parametrize 等) / `quarantine` / `delete` / `add` (回帰テスト欠落) / `needs_decision` |

- tests の削除は expert-test「テスト削除の 3 段階モデル」に従う。`quarantine` が段階 2、`delete` は段階 3 (観察期間経過・CI green 継続) か collect 不能な dead test だけ。
- 価値も根拠も判断できないもの (追加意図が復元できない古いテスト、UI 仕様かもしれない snapshot、business rule に見えるもの) は `needs_decision`。

## フェーズ2: 提示と承認

```
## op-prune <comments|tests>: <area>

<rule_conflict があればここに 1 段落>

| id | file:line | kind | action | reason |
|---|---|---|---|---|

判断が要るもの (apply 対象外):
| id | file:line | reason |

合計: delete N / shorten N / ... (keep は件数のみ)

どれを apply しますか?
1. keep / needs_decision 以外すべて  2. id を選択 (例: P1-P12, P20)  3. キャンセル
```

- 1 回で確認しきれない量 (目安: comments 80 件 / tests 20 件超) はファイル単位に分けて提示する。
- `--dry-run`・キャンセル・候補 0 件はここで終了する。

## フェーズ3: apply (worktree)

```bash
op run worktree create --task-prefix "prune-<comments|tests>" --base-ref "<BASE_REF>" --base-sha "<BASE_SHA>"
# → payload の task_id / worktree_path / branch を控える
```

同種の expert を新規に spawn する (isolation は付けない。作業場所は上の worktree)。spawn prompt は `spawn-prompt-common.md` §1〜§5
(§2 は apply、フェーズ名 = prune-apply) と次を含める:

```
作業ディレクトリ: <worktree_path> (branch <branch>、base <BASE_SHA>)。push はしない。
指示書: 下の承認済み items が Issue 指示書に当たる。触ってよいファイル = items の file、変更は items の action と recommendation に閉じる。
完了報告は expert-spawn「修正完了報告 schema」(issue: null / cluster_id: "<area>")。
comments: finding_type: immediate_refactor / execution_mode: direct_apply / direct_apply_safe: true。
          refactor-expert「Mechanical Refactor Guard」を守る。diff はコメント行と空行だけ。
tests:    本体コードは commit しない。strengthen / add は対象コードに一時的に故障を入れ (add は fix commit の逆適用でよい) テストが落ちることを確かめ、
          戻してから `git diff --quiet -- <本体パス>` で戻ったことを確認する。注入できないものは verification_not_run に書く。
          merge は前後でケース数が同じことを確認する。quarantine / delete の削除根拠は expert-test の削除根拠テンプレで完了報告に含める。
承認済み items:
<items の JSON>
```

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
