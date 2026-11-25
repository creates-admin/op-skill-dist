# op-prune の spawn prompt と提示の形

## 検出

フェーズ1。`spawn-prompt-common.md` §1〜§5 (§2 は exploration-only) に続けて渡す。

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
                 "action": "<SKILL.md フェーズ1 の action の表>", "reason": "<1 文>",
                 "bug_prevented": "<tests のみ。書けなければ null>",
                 "recommendation": "<tests のみ。何をどう変えるか>",
                 "evidence": "<tests のみ。grep / coverage / git log の根拠>",
                 "risk_if_changed": "<tests のみ>", "protected_behavior": "<tests のみ>", "confidence": "<tests のみ high|medium|low>" } ] }
```

## 提示

フェーズ2。

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

## apply

フェーズ3。`spawn-prompt-common.md` §1〜§5 (§2 は apply、フェーズ名 = prune-apply) に続けて渡す。

```
作業ディレクトリ: <worktree_path> (branch <branch>、base <BASE_SHA>)。push はしない。
指示書: 下の承認済み items が Issue 指示書に当たる。触ってよいファイル = items の file、変更は items の action と recommendation に閉じる。
完了報告は expert-report-schemas.md「修正完了報告 schema」(issue: null / cluster_id: "<area>")。
comments: finding_type: immediate_refactor / execution_mode: direct_apply / direct_apply_safe: true。
          refactor-expert「Mechanical Refactor Guard」を守る。diff はコメント行と空行だけ。
tests:    本体コードは commit しない。strengthen / add は対象コードに一時的に故障を入れ (add は fix commit の逆適用でよい) テストが落ちることを確かめ、
          戻してから `git diff --quiet -- <本体パス>` で戻ったことを確認する。注入できないものは verification_not_run に書く。
          merge は前後でケース数が同じことを確認する。quarantine / delete の削除根拠は expert-test の削除根拠テンプレで完了報告に含める。
承認済み items:
<items の JSON>
```
