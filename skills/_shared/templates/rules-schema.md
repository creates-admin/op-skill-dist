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
paths: ["src/billing/**"]   # この正本を構成するファイルの glob。同じ kind の正本間で重複させない
feature: billing            # 一意 id (constitution 索引のキー)
status: draft               # cultivated (3 者照合済み) | draft | unverified (code 由来の抽出のみ)
kind: feature               # 任意。layer | feature
budget_override: <理由>     # 任意。大きさの上限を超えてよい理由
---
```

- `kind: layer` はその層の共通の作り方だけを書く。`kind: feature` は業務機能の全層の決まりを書き、paths はその機能のファイルだけにする。
- layer と feature の paths の重なりは意図したものとして許す。kind 未指定の正本は他の正本と paths を重ねない。
- 日付フィールドは持たない (古さは git log で判定する)。

## 本文 6 節 (上ほど強く縛る)

1. `## 不変則 (MUST)` — 破れば実害が出るもの。hook で強制済みなら `[MUST:enforced]`
2. `## 決定 (Decisions)` — `- <要約> — <1 行 rationale> [provenance] ([[feature/section]], realizes #NN)`
3. `## 用語 (Glossary)` — `<term> → <意味>`
4. `## 落とし穴 (Gotchas)`
5. `## ドメイン (なぜ/背景)` — 人間のドメイン知識の本体
6. `## 関連 (Links)` — `[[feature/section]]`

## 書くもの・書かないもの

| 区分 | 扱い |
|---|---|
| A. 業務のドメイン知識 (業務ルール・業務用語・業務上の理由・例外の扱い) | 最優先で残す。削るときは必ず人に確認する。上限を超えても自動では削らない |
| B. 不変則・設計の決定と理由 | 残す。決定は 1 行の要約 + 1 行の理由 + `realizes #NN`。長い設計は doc/ へのリンクにする |
| C. 業務ルールを実装している箇所の手がかり | 最小限にする。実装箇所を 1 か所だけ示す |
| D. 実装の詳細 (ファイル名・関数名・testid・コマンド・API の網羅一覧、ディレクトリの木、シグネチャ) | 書かない。コードが正 |
| E. 手順 (配備・検証・計測のコマンド) | 書かない。skill か doc/ へ移す |
| F. 経緯 (PR の経過・マージの手順メモ・ベンチのログ) | 書かない。残す価値がある判断は決定の行か DECISIONS / ADR へ移す |

A か D か迷うものは削らず人に聞く。

## 大きさ

字数 (frontmatter を含むファイル全体の文字数) で測る。上限は `op-config.yaml` の `spec_budget` (op-config-schema.md §15)。
超えたら次の順で分ける。A は削らない。

1. 機能を分けて paths を狭める
2. 長い業務の説明は `doc/design/` に置き、正本からリンクで指す
3. それでも超えるなら frontmatter の `budget_override` に理由を書く

## provenance タグ

| タグ | 意味 | 縛るか |
|---|---|---|
| `[code]` | code で確かめた業務ルール。実装箇所は 1 か所だけ示す (C) | 縛る |
| `[human]` | 人間が read-back で確定した事実。出典 (日付・根拠) 必須。出典の無い `[human]` は `[?]` に降格される | 縛る |
| `[?]` | 未確認。`TODO: needs-human` を併記 | 縛らない |
| `[MUST:enforced]` | hook / permission で強制済みの不変則 | 縛る |

**捏造禁止**: code から証明できることだけを `[code]` で書く。意図・理由・code に無い業務ルールは推測で書かず `[?] TODO: needs-human`。

## 索引から除外するファイル

`_` prefix (本ファイル) と `00-` prefix (`00-constitution.md`) は feature 索引に載せない。

## skeleton

```markdown
---
paths: ["<glob>"]
feature: <id>
status: draft
kind: <layer | feature>
# budget_override: <理由>   (上限を超えるときだけ)
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
