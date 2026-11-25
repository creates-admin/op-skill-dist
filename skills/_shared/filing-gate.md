# 起票前ゲート (Issue filing gate)

Issue を起票する全 OP skill (op-intake / op-plan / op-architect / op-scan / op-patrol / op-report / op-doctor / op-spec 派生 Issue) の共通契約。
起票してからレビューする経路は存在しない。

apply 中の expert は起票しない。起票要求は完了報告で返し、controller が本ゲートを通して起票する。

## 1. 起票前レビュー

| 経路 | レビュー |
|---|---|
| 対話 (op-spec 派生 Issue) | 人間が起票内容を承認する (ExitPlanMode / AskUserQuestion)。承認前に起票しない |
| `--auto` (op-scan / op-patrol) | refute (`refute-contract.md`) を通過し、かつ `auto-policy.md` の 8 条件をすべて満たすもののみ。満たさないものは manual_review_bucket |
| `--auto` (op-doctor) | `auto-policy.md` の 8 条件をすべて満たすもののみ |
| op-intake (op-plan / op-architect / op-report と op-scan・op-patrol の対話モードの起票を含む) | どの入口でも、人間が一覧と本文を 1 回で承認する。scout の報告は confirmed のみで、scout は起票しない。`--auto` は持たない |

起票を Critical / High に限る規則 (CLAUDE.md 不変則5) は finding の起票に適用する。op-plan / op-architect の計画 Issue は人間承認済みの作業指示で severity を持たない。finding の例外は次の 4 経路だけ。いずれも §2 以降は省略しない。

- op-report: scout が `confirmed` なら severity で絞らない
- op-scan `--from-issue`: 元 Issue が人間判断を経ているため severity フィルタを無効化する (`auto-policy.md`「例外」)
- op-scan `--from-merged-pr`: merged PR 由来の follow-up を人間承認後に起票する (Medium / Low も可)
- op-spec derived issue: 人間 align 済みの正本から派生する Issue

op-intake が scout の報告・人の Issue の正規化から起票するときは、それぞれ op-report・op-scan `--from-issue` の例外に従う。

## 2. 重複・衝突チェック (省略不可)

```bash
op scan dedup --findings-json drafts.json --json
```

- fingerprint と `drafts.json` の形は `dedup-policy.md` のとおり (fingerprint は CLI で生成する)。
- 既存 Issue と重複 → 起票しない (必要なら既存 Issue にコメント)。
- 類似 (warn) → 対話経路は人間に提示して判断を仰ぐ。`--auto` は manual_review_bucket。
- 同一 run の draft 同士の重複判定は `op scan dedup --findings-json` (配列モード) 自体が行う。`results[].matched_draft` (先行 draft の index) を見て、重複した draft は起票しない。draft 同士の判定は fingerprint 完全一致のみ。file/symbol や行が近い・title が似ているだけの draft (domain を跨ぐ意図した別 Issue 等) は run 内重複扱いにしない。既存 Issue との重複判定は 4 段優先順位のまま変わらない。

## 3. 起票

- 本文を `op core marker-lint --strict` で検証してから起票する。
- `op issue create` は 1 件ずつ直列に実行する (並列化・background 化禁止)。失敗を `||` で握り潰さない。
- 本文テンプレは `issue-templates.md`「Issue 本文 (指示書フル版)」/「Issue 本文 (バッチ版)」。
- marker とラベルは `issue-templates.md`「Issue 本文 hidden marker」/「domain → marker / ラベル表」に従う。

## 4. UI を含む Issue

見た目の仕様を本文に文章で書かず、`design-mock.md` のモックで合意して `デザインモック: <artifact URL>` の 1 行だけを書く。
モックが無い UI Issue も起票してよい (軽微な修正など)。その場合 apply 担当は既存の design system / component に従う。

## 5. 振り分けの材料

本文の振り分けの材料節は `issue-templates.md`「振り分けの材料」。コーディネーターとスレッドはこの節と `op-depends-on` で振り分けを決める。
