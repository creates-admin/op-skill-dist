---
name: op-adopt
description: OP 未適用の既存プロジェクトを OP の運用へ移行するスキル。現状を診断し、基盤 (ラベル・op-config.yaml)、正本 (.claude/rules の書式・索引・feature 地図と骨組み)、デザインシステム (op-component --init への引き渡し) を、人間の承認を挟みながら段階的に導入する。何度実行しても未導入の分だけを進める。「op-adopt」「移行」「導入」「OP 化」「既存プロジェクトに適用」等のキーワードで起動。
---

# op-adopt: 既存プロジェクトの OP 移行

Direct Mode 固定 (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。既存のコードと見た目は変えない (導入するのは運用の土台だけ)。各段階は人間の承認後に行い、
何度実行しても安全 (導入済みの項目は診断で「済」と出て飛ばす)。

## 不変則9 例外宣言

op-adopt は人間が承認した feature 地図から、正本の骨組み (frontmatter と空の 6 節。status は `unverified`) だけを
書く。事実・決定・用語は書かない (中身は op-spec が human align 後に書く)。それ以外の書き込みはテンプレートの配置と設定ファイルだけ。

## フェーズ0: 診断 (read-only)

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」の後、次を調べて表で示す。

| 領域 | 確認 | 済の条件 |
|---|---|---|
| 基盤 | `op-config.yaml` の有無 (ラベルは判定しない。フェーズ1 の `op repo init` は冪等) | ファイルあり |
| 正本の土台 | `.claude/rules/_schema.md` と `00-constitution.md` | 両方あり |
| 正本の中身 | `op spec-patrol list-specs`、主要ディレクトリ構成 | 主要 feature に正本がある (status 問わず) |
| デザインシステム | UI の有無 (`package.json` / `pubspec.yaml` 等)、`op-config.yaml` の `design_system` | UI 無し、または設定あり |
| 環境 | test / lint / build コマンドの有無 | (情報のみ。詳細は `/op-skill:op-doctor`) |

未導入の項目を、導入する順 (基盤 → 正本の土台 → 正本の骨組み → デザインシステム) に並べて提示し、
どれを今回やるか人間に選んでもらう。

## フェーズ1: 基盤

- ラベル: 診断の「済」にかかわらず、canonical ラベルの作成を確認して承認後に `op repo init` を実行する (既存ラベルは skip される。
  `--dry-run` は作成済みかを判定せず全件を列挙するだけなので判定に使わない)。
- `op-config.yaml`: 無ければ空に近い最小ファイルを作る (値は推測で埋めない。キーの意味は `_shared/op-config-schema.md`)。

## フェーズ2: 正本の土台

`~/.claude/skills/_shared/templates/rules-schema.md` → `.claude/rules/_schema.md`、`rules-constitution.md` → `.claude/rules/00-constitution.md`
として置く (既にあれば触らない)。
`.claude/rules/` が git の追跡対象になっていることを確認する (`.gitignore` で除外されていないか)。

## フェーズ3: feature 地図と正本の骨組み

1. feature-expert を read-only で spawn し、feature 地図の案を作らせる。
   - 各 feature: `feature` キー (英小文字・ハイフン)、`paths` glob (feature 間で重複させない)、1 行の概要
   - 優先度: 変更頻度 (`git log --since=6.months --name-only` の集計) と影響の大きさ (認証・課金・データ永続化など)
   - 生成物・依存・テスト fixture は feature に含めない
2. 地図を表で提示し、人間が feature の分け方・名前・paths を直して承認する。
3. 承認された feature ごとに `_schema.md` の skeleton で `.claude/rules/<feature>.md` を作る
   (`status: unverified`、各節は空。概要は scope 行だけに書く)。
4. `op spec-patrol list-specs` で paths の重複が無いことを確認し、`op spec-patrol rebuild-index --apply --yes` で索引を作る。
   索引の 概要 列の placeholder を承認された 1 行概要に置き換える。
5. デザインシステム (UI 部品・トークン・カタログ) は feature 地図に含めない (フェーズ4 の `design-system` 正本が持つ)。
6. 優先度の高い feature から `/op-skill:op-spec` (feature-driven) で 1 つずつ育てる、と案内する (本 skill では育てない)。

## フェーズ4: デザインシステム

UI を持つ repo で `design_system` が未設定なら、`/op-skill:op-component --init` を別セッションで行うよう案内する (本 skill では実施しない)。

## フェーズ5: commit と PR

- branch は `auto/adopt-<YYYYMMDD-HHMMSS>` (`_shared/worktree-ops.md`)。フェーズ1〜3 の変更を 1 PR にまとめる。
- `op pr create`。本文に診断表 (前後)、作った正本の一覧と優先度、次にやること (`/op-skill:op-spec` の順番、`--init`、`/op-skill:op-doctor`) を書く。
- マージは `/op-skill:op-merge` または人間が GitHub で行う。

## 完了報告

```
## op-adopt 完了
| 領域 | 前 | 後 |
- PR: #<N>
- 次: /op-skill:op-spec (<feature1> → <feature2> …) / /op-skill:op-component --init / /op-skill:op-doctor
```
