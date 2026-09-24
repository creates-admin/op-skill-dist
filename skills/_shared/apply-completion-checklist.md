# apply 完了手順 (apply-completion-checklist)

apply Run Mode の expert (debug / feature / refactor / test / optimize / security / design) が実装完了後に踏む手順の正本。
controller 側の検証は `apply-completion-verify.md`。

## 1. 適用範囲

| モード | 適用 |
|--------|------|
| apply Run Mode (`op-run` / `op-codev` 経由 または Direct apply) | 適用する (`op-run` / `op-codev` 経由は §2-A の commit 先行順序) |
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

### code-review skill 名と effort-level

- invoke 先は `Skill({skill: "op-skill:op-code-review"})`。手順・出力形式の正本は op-code-review skill。
  built-in `/code-review` ではなく本 skill を使う (固定 JSON 契約・read-only・single-context で controller が機械的に扱えるため)。
- controller が `code_review_effort` を渡した場合は `args: "effort: <effort>"` を付ける。`auto` / 未指定なら引数なし (既定 high)。
  派生ルールは `model-selection.md` §5.5。
- skill 解決に失敗した場合の fallback は、`op-code-review/SKILL.md` の Angle A〜E + 3 値 verify を同一 context で手動一巡すること。
  発動は下記条件を満たす場合のみ。

### 手動 fallback の発動条件

以下を両方満たす場合のみ手動 fallback してよい。

1. `Skill({skill: "op-skill:op-code-review", ...})` を実際に呼んだ (呼ばずに「解決できないはず」と判断するのは禁止)
2. 返ってきたエラー文言を verbatim で `code_review_skip_reason` に含めた (要約・言い換え不可)

エラー文言を伴わない fallback 申告は contract violation であり、`code_review_invoked: true` を名乗ってはならない。

自己検証は best-effort であり、merge 可否の判定権は controller が spawn する独立レビュー
(op-run フェーズ4 global review / op-codev Step B-2) にある。

## 2-A. commit 先行経路 (op-run / op-codev)

op-run / op-codev 経由の apply-expert は commit を先に打ってから自己検証する。順序を §2 (自己検証 → commit) に戻さない。

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

## 3. 完了前チェックリスト

以下はすべて contract violation の裏返し。完了報告を返す前に全項目 yes にする。

```
- [ ] Static 検証 (project-profile.md のスタック別コマンド) を全て pass
- [ ] code-review invoke 完了、code_review_result 取得済 (skip 時は code_review_skip_reason 確定済)
- [ ] 実装・code-review・自己修正の変更をすべて commit 済 (自己修正は追加 commit)。code-review 完了 ≠ 実装完了
- [ ] git status --porcelain が空 (untracked な新規ファイルも含む。未 commit 分は push されず失われ、
      controller の `op apply verify-commit` が UNCOMMITTED_CHANGES で block する)
- [ ] commits_added に "${OP_RUN_BASE_SHA}..HEAD" の全 SHA を SHA 文字列の配列で記入 (1 件以上。object でラップしない)
- [ ] 完了報告は canonical completion_report の形式。op-code-review の findings JSON 配列をそのまま返さない
      (findings は code_review_result / self_review_result に要約して載せる)
```

```bash
: "${OP_RUN_BASE_SHA:?OP_RUN_BASE_SHA must be set by controller}"
git log --format='%H' "${OP_RUN_BASE_SHA}..HEAD"   # 件数 == commits_added 要素数 (1 以上)
git status --porcelain                             # 空であること
```

exploration-only spawn (investigation / post-check / review) は `commits_added: []` が正解。

## 5. expert 固有 skip 条件

各 expert SKILL.md が正本。§1 の非適用モード以外で invoke しないのは次の 2 つだけ。

- optimize-expert: Before/After 確定前は invoke しない。revert / deferred 時は skip
- security-expert: finding を残置した場合は skip

## 6. 完了報告 schema

schema の正本は `expert-spawn.md`「修正完了報告 フィールドの必須性」表 (`op help payload apply-report` でも確認できる)。

## 7. Marker Publish が発生する場合の追加契約

apply 中に hidden marker / completion report block を publish する場合は、publish 前に
`expert-spawn.md`「Marker Publish Validate」を実行する。
