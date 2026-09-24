---
paths: [".claude/rules/**"]
feature: _schema
status: draft
---

# 正本 authoring 規約

正本 (canonical spec) = 各 feature の WHAT 層 (不変則・決定・用語・落とし穴・背景) を 1 ファイルに固定したもの。
その feature のファイルを触ったときに context へ読み込まれる。書き換えは op-spec (人間の align 後) だけ。

## frontmatter

```yaml
---
paths: ["src/billing/**"]   # この feature を構成するファイルの glob。正本間で重複させない
feature: billing            # 一意 id (constitution 索引のキー)
status: draft               # cultivated (3 者照合済み) | draft | unverified (code 由来の抽出のみ)
---
```

日付フィールドは持たない (古さは git log で判定する)。

## 本文 6 節 (上ほど強く縛る)

1. `## 不変則 (MUST)` — 破れば実害が出るもの。hook で強制済みなら `[MUST:enforced]`
2. `## 決定 (Decisions)` — `- <要約> — <1 行 rationale> [provenance] ([[feature/section]], realizes #NN)`
3. `## 用語 (Glossary)` — `<term> → <意味>`
4. `## 落とし穴 (Gotchas)`
5. `## ドメイン (なぜ/背景)` — 人間のドメイン知識の本体
6. `## 関連 (Links)` — `[[feature/section]]`

## provenance タグ

| タグ | 意味 | 縛るか |
|---|---|---|
| `[code]` | code を Read して確認した事実 (ファイル + シンボル名で示す) | 縛る |
| `[human]` | 人間が read-back で確定した事実。出典 (日付・根拠) 必須。出典の無い `[human]` は `[?]` に降格される | 縛る |
| `[?]` | 未確認。`TODO: needs-human` を併記 | 縛らない |
| `[MUST:enforced]` | hook / permission で強制済みの不変則 | 縛る |

**捏造禁止**: code から証明できることだけを `[code]` で書く。意図・業務ルール・理由は推測で書かず `[?] TODO: needs-human`。

## 索引から除外するファイル

`_` prefix (本ファイル) と `00-` prefix (`00-constitution.md`) は feature 索引に載せない。

## skeleton

```markdown
---
paths: ["<glob>"]
feature: <id>
status: draft
---

# <feature> 正本

> scope: <この正本が扱う範囲>

## 不変則 (MUST)
## 決定 (Decisions)
## 用語 (Glossary)
## 落とし穴 (Gotchas)
## ドメイン (なぜ/背景)
## 関連 (Links)
```
