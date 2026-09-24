---
paths: ["<部品の glob>", "<トークンの glob>", "<契約の glob>", "<カタログページのパス>"]
feature: design-system
status: unverified
---

# design-system 正本

> scope: この repo の UI 部品・トークン・部品の契約・カタログ。見た目の正本はカタログ (実物)、ここはその決まりごと。
> 共通の規則は op-skill の `_shared/design-system.md`。ここにはこの repo 固有のことだけを書く。

## 不変則 (MUST)
- 画面は `status: 確定` の部品だけで組む。生の値 (色・px・フォント) を画面に書かない [human] (出典: <導入を承認した日付と人>)
- 部品の色は部品単位トークン `{component}-{property}-{value}` を経由する [human] (出典: <導入を承認した日付と人>)
- `status: 確定` への変更は、人間がカタログ上の実物を確認した後だけ (op-component) [human] (出典: <導入を承認した日付と人>)

## 決定 (Decisions)
- カタログ: <パス / URL> [code]
- トークン: primitive <パス> / semantic <パス> / 部品単位 <パス> [code]
- 契約: <パス> (<zod / TypeScript 型 など>) [code]
- 登録状態の書き方: 部品冒頭の `status: draft | 確定` [code]

## 用語 (Glossary)

## 落とし穴 (Gotchas)

## 部品一覧
<!-- op-component が登録・変更のたびに更新する。正本は各部品冒頭の status。 -->

| 部品 | 契約 | status | variant × 状態 |
|---|---|---|---|

## ドメイン (なぜ/背景)
[?] TODO: needs-human

## 関連 (Links)
