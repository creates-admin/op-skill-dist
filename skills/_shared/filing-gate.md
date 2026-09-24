# 起票前ゲート (Issue filing gate)

Issue を起票する全 OP skill (op-plan / op-architect / op-scan / op-patrol / op-report / op-spec 派生 Issue) の共通契約。
**起票してからレビューする経路は存在しない。**

## 1. 起票前レビュー

| 経路 | レビュー |
|---|---|
| 対話 (op-plan / op-architect / op-scan・op-patrol 対話モード) | 人間が起票内容を承認する (ExitPlanMode / AskUserQuestion)。承認前に起票しない |
| `--auto` (op-scan / op-patrol) | refute (`refute-contract.md`) を通過し、かつ `auto-policy.md` の 8 条件をすべて満たすもののみ。満たさないものは manual_review_bucket |
| `--auto` (op-doctor) | `auto-policy.md` の 8 条件をすべて満たすもののみ |
| op-report | scout の実在確認 (confirmed) のみ |

## 2. 重複・衝突チェック (省略不可)

```bash
op scan dedup --findings-json drafts.json --json   # mcp channel では --input-json で既存 Issue 素材を注入
```

- fingerprint は `op core fingerprint` / `op core fingerprint-bulk` で生成する (手書き禁止、`dedup-policy.md`)。
- 既存 Issue と重複 → 起票しない (必要なら既存 Issue にコメント)。
- 類似 (warn) → 対話経路は人間に提示して判断を仰ぐ。`--auto` は manual_review_bucket。
- 同一 run の draft 同士で fingerprint が一致したら 1 件に統合する。

## 3. 起票

- 本文を `op core marker-lint --strict` で検証してから起票する。
- `op issue create` は **1 件ずつ直列**に実行する (並列化・background 化禁止)。失敗を `||` で握り潰さない。
- 本文テンプレは `pr-templates.md`「Issue 本文 (指示書フル版)」/「バッチ版」。

## 4. UI を含む Issue

- Issue 本文に見た目の仕様 (レイアウト・配色・コンポーネント仕様) を文章で書かない。
- 見た目はデザインモック (`design-mock.md`) で合意し、本文には `デザインモック: <artifact URL>` の 1 行だけを書く。
- モックが無い UI Issue も起票してよい (軽微な修正など)。その場合 apply 担当は既存の design system / component に従う。
