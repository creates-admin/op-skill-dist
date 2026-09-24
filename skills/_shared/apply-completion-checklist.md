# apply 完了手順 (apply-completion-checklist)

apply Run Mode の expert (debug / feature / refactor / test / optimize / security / design / ux-ui-audit) が
実装完了後に踏む手順の正本。controller 側の検証は `apply-completion-verify.md`。

## 1. 適用範囲

| モード | 適用 |
|--------|------|
| apply Run Mode (`op-run` / `op-codev` 経由 または Direct apply) | 適用する (`op-run` / `op-codev` 経由は Section 2-A の commit 先行順序) |
| scan / detect / review / post-check / gate 判定 / patrol 巡回 | 適用しない |

非適用モードでは `code_review_invoked: false`、`code_review_skip_reason: "<mode名>, no apply performed"` を完了報告に記載する。

## 2. 5 段階順序 (Direct apply)

```
1. 実装完了 (スコープ内ファイルの変更 + 単体確認)
2. Static 検証 pass 確認 (project-profile.md「検証コマンド (スタック別)」)
3. unit test pass 確認 (該当する Level のみ)
4. code-review skill invoke
5. commit (code-review による変更も含める)
```

- Static 検証は unit test より前。`cargo fmt --check` は clippy とは独立に必ず実行する。
- `op-run` / `op-codev` 経由は Section 2-A を使う。

### code-review skill 名と effort-level

- invoke 先は `Skill({skill: "op-skill:op-code-review"})` (直配置 repo では `"op-code-review"`)。
  手順・出力形式の正本は op-code-review skill。built-in `/code-review` は model から invoke できない。
- controller が `code_review_effort` を渡した場合は `args: "effort: <effort>"` を付ける。`auto` / 未指定なら引数なし (既定 high)。
  派生ルールは `model-selection.md` §5.5。
- skill 解決に失敗した場合の fallback は、`op-code-review/SKILL.md` の Angle A〜E + 3 値 verify を同一 context で手動一巡すること。
  発動は下記条件を満たす場合のみ。

### 手動 fallback の発動条件

以下を**両方**満たす場合のみ手動 fallback してよい。

1. `Skill({skill: "op-skill:op-code-review", ...})` を**実際に呼んだ** (呼ばずに「解決できないはず」と判断するのは禁止)
2. 返ってきた**エラー文言を verbatim で** `code_review_skip_reason` に含めた (要約・言い換え不可)

エラー文言を伴わない fallback 申告は contract violation であり、`code_review_invoked: true` を名乗ってはならない。

自己検証は best-effort であり、merge 可否の判定権は controller が spawn する独立レビュー
(op-run フェーズ4 global review / op-codev Step B-2) にある。

## 2-A. commit 先行経路 (op-run / op-codev)

以下の経路の apply-expert は commit を先に打ってから自己検証する。

| 経路 | spawn 元 | controller 側 verify gate |
|---|---|---|
| `op-run` | ClusterOrchestrator (`cluster-orchestrator-directives.md` フェーズ2-3 / `op-run/references/apply-prompt-directives.md`) | フェーズ4 の push 直前 (`--base-ref`) |
| `op-codev` | Step B (op-codev skill) | Step B-1 (`--base-sha`) |

```
1. 実装完了
2. Static 検証 pass 確認
3. unit test pass 確認
4. commit
5. Skill(op-skill:op-code-review) 自己検証 (effort は controller 由来の code_review_effort)
6. Critical / High が出た場合のみ: 自己修正 → 追加 commit → 自己検証を 1 回だけ再実行
   (2 回目も Critical/High が残れば self_check_blocked: true で返す)
   Medium / Low は自己修正せず formal review に委ねる
```

- 自己修正したら**追加 commit は必須**。
- 完了報告の直前に `git status --porcelain` が空であることを確認する (未 commit 変更は push されず失われる)。
- `commits_added` には初回 commit と自己修正 commit の両方の SHA を含める。
- 完了報告は canonical completion_report の形式で返す。op-code-review の findings JSON 配列をそのまま完了報告として返してはならない
  (findings は `code_review_result` / `self_review_result` 等に要約して載せる)。
- 順序を Section 2 (自己検証 → commit) に戻してはならない。

## 3. 完了前チェックリスト

完了報告を返す前に全項目 yes にする。

```
- [ ] Static 検証 (project-profile.md のスタック別コマンド) を全て pass
- [ ] code-review invoke 完了、code_review_result 取得済 (skip 時は code_review_skip_reason 確定済)
- [ ] code-review / 自己検証による修正を含めて git add -A + git commit 済
      (Section 2-A では自己修正を追加 commit として打ち済)
- [ ] git status --porcelain が空 (untracked な新規ファイルも含めて残置なし)
- [ ] 完了報告を canonical completion_report の形式で組み立て済 (findings JSON をそのまま返していない)
- [ ] git log --format='%H' "${OP_RUN_BASE_SHA}..HEAD" の SHA を commits_added に記入済 (1 件以上)
```

`commits_added` は SHA 文字列の配列 (例: `["abc1234","def5678"]`)。object でラップしない。

```bash
: "${OP_RUN_BASE_SHA:?OP_RUN_BASE_SHA must be set by controller}"
git log --format='%H' "${OP_RUN_BASE_SHA}..HEAD"   # 件数 == commits_added 要素数 (1 以上)
git status --porcelain                             # 空であること
```

## 4. 強警告

以下はすべて contract violation。

- commit を打たずに完了報告を返す。code-review 完了 ≠ 実装完了。
- apply spawn で `commits_added: []` を返す (exploration-only spawn = investigation / post-check / review では `[]` が正解)。
- 自己修正後の追加 commit を打たない / uncommitted 変更を残したまま完了報告する。
  controller の `op apply verify-commit` が `UNCOMMITTED_CHANGES` で block する。完了条件は「`git status --porcelain` が空」。
- 自己検証 skill の出力 (findings JSON 配列) を完了報告として返す。
- PR 本文に `Static: pass` と書きながら `cargo fmt --check` を実行していない。

## 5. expert 固有 skip 条件

詳細は各 expert SKILL.md が正本。

| expert | skip 条件 |
|--------|----------|
| debug / feature / refactor / test | なし (apply 後は必ず invoke) |
| optimize-expert | benchmark 前は invoke 禁止、revert/deferred 時は skip |
| security-expert | finding 残置時 / scan / review モードは invoke なし |
| designer-expert | Summary / Scan / Patrol モードは invoke なし |
| ux-ui-audit-expert | apply 派生で修正コミットがある場合のみ invoke |

## 6. 完了報告 schema との対応

schema の正本は `expert-spawn.md` の「修正完了報告 フィールドの必須性」表。本節は対応マップのみ。

| チェックリスト項目 | schema フィールド |
|------------------|------------------|
| code-review invoke 完了 | `code_review_invoked: true` |
| skip 時の理由 | `code_review_skip_reason` (`code_review_result: "skip"` 時、および apply Run Mode で `code_review_invoked: false` 時) |
| code-review 結果 | `code_review_result: "pass" \| "warning" \| "skip"` |
| controller から渡された effort | `code_review_effort` |
| commit SHA | `commits_added: ["<SHA>", ...]` |
| 自己検証 (2-A) の結果 | `self_review_result: "pass" \| "needs_fix" \| "skip"` (op-run 経路かつ `status: completed` 時必須) |
| 解消できない Critical/High の残置 | `self_check_blocked: true \| false` (op-run 経路かつ `status: completed` 時必須、`false` でも省略しない) |

## 7. Marker Publish が発生する場合の追加契約

apply 中に hidden marker / completion report block を publish する場合は、publish 前に
`expert-spawn.md` の marker publish 前 validate 節
(`op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict`) を実行する。
これは Section 2 の「1. 実装完了」に含まれる。
