---
name: op-component
description: UI 部品を 1 つずつ作り込み、人間が OK したものだけをコンポーネントカタログに登録 (確定) するスキル。部品単体のモックで見た目を合意 → designer-expert が実装しカタログに下書き掲載 → カタログ上の実物を人間が確認 → 確定して PR。`--init` で repo にデザインシステムを導入する。「op-component」「部品」「コンポーネント」「カタログ登録」「部品を作る」等のキーワードで起動。
---

# op-component: 部品の作り込み → カタログ登録

カタログ登録制の規則は `_shared/design-system.md`。1 回の起動で部品 1 つ (新規 or 変更) を登録まで運ぶ。

## 不変則

- Direct Mode 固定 (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。人間の OK は 2 回 (①モックの見た目、②カタログ上の実物)。どちらも無しに先へ進まない。
- 実装は designer-expert (worktree)。登録 (`status: 確定`) は ② の OK 後に司令官が指示する。
- アプリ側 (画面) は触らない。部品・契約・トークン・カタログ掲載だけを変える。

## 起動

```
/op-skill:op-component <部品名> [--issue <N>]   # 新規 or 既存部品の変更。Issue から起動するとその要件を使う
/op-skill:op-component --init                   # repo にデザインシステム (カタログ・トークン 3 層・契約・設定) を導入する
```

`op-config.yaml` に `design_system` が無く、フェーズ0 の Summary でもカタログが見つからない repo では、先に `--init` を提案する。

## `--init`: デザインシステムの導入 (新規・既存 repo 共通)

新規プロジェクト (op-architect の基盤マイルストーン) も既存プロジェクトもこの手順で導入する。既存 UI の見た目は変えない。

1. designer-expert を Summary Mode で spawn し、既存のトークン (定義ファイル・直書きされている値の頻出)、部品、
   カタログ相当 (Storybook / preview ページ等) の有無を洗い出す。
2. 導入計画を人間に提示して承認を得る: カタログの形 (既存の Storybook 等があればそれを使う、無ければ実描画ページを新設)、
   トークン 3 層の置き場、契約の置き場、既存部品の扱い (見た目を変えずにカタログへ掲載し、人間の確認後に `status: 確定`、
   未確認のものは `status: draft`)。
3. designer-expert が worktree で骨組みを作る: カタログページ (置き場所の既定は `_shared/design-system.md`)、トークン 3 層のファイル (既存値の集約。新しい値は作らない)、
   契約の置き場、既存部品のカタログ掲載、`op-config.yaml` の `design_system` (`_shared/op-config-schema.md` §12)、
   `.claude/rules/design-system.md` (雛形 `~/.claude/skills/_shared/templates/rules-design-system.md`。`[code]` の決定と部品一覧を埋める。
   `.claude/rules/` が無い repo では先に `/op-skill:op-adopt` で正本の土台を作る)。
4. カタログ上の実物を人間が確認し、確定してよい部品を指示 → `status: 確定` に更新 → PR (フェーズ4 と同じ)。
5. 直書き値のトークン化や部品の統合など見た目・構造を変える整理は、この PR に含めず Issue として列挙する
   (op-plan / op-scan の通常の経路で扱う)。

## フェーズ0: 準備

- `_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」。
- `op-config.yaml` の `design_system` (`_shared/op-config-schema.md` §12) からカタログ・トークン・契約の所在を読む。
  無ければ次の Summary で探す。
- designer-expert を Summary Mode (read-only) で spawn し、既存トークンの実値・類似部品・カタログの構成を要約させる。
  類似の登録済み部品があれば、新規ではなく variant 追加をまず提案する。

## フェーズ1: 要件と部品単体のモック → OK ①

1. 要件を短く確認する: 用途、必要な variant / size / 状態 (通常・hover・focus・disabled・loading・empty・error のうち必要なもの)、
   配置される文脈。
2. `_shared/design-mock.md` の手順で **部品単体** のモックを作る。artboard は「variant × 状態」の格子にし、
   Summary で得たトークンの実値だけを使う。作り直しは同じ Artifact を更新する。
3. 提示 → OK ① (見た目の合意)。

## フェーズ2: 実装 + カタログ下書き掲載

`_shared/worktree-ops.md` の規約で worktree を作り、designer-expert を Apply Mode で spawn する
(spawn prompt は `_shared/spawn-prompt-common.md` §1〜§5、§2 は apply)。渡すもの: worktree path / branch、部品名と要件
(variant / size / 状態)、モック URL、`design_system` の所在 (カタログ・トークン・契約)。部品冒頭には `status: draft` と用途・使用例を書かせ、
カタログにはモックの artboard と同じ「variant × 状態」を並べさせる。カタログ掲載を強制するテストがあればそれも通させる。

## フェーズ3: カタログ上の実物を確認 → OK ②

- 人間にカタログの該当セクションを確認してもらう (ローカル起動手順は repo の README / CLAUDE.md。起動できない環境なら
  スクリーンショット取得を designer-expert に依頼する)。
- 修正指示があれば designer-expert に戻す (フェーズ2 の worktree を継続)。
- OK ② が出たら、designer-expert に `status: 確定` への変更と CHANGELOG 等 repo の記録規約への追記を指示する。
  あわせて `.claude/rules/design-system.md` の「部品一覧」の該当行を追加・更新する (登録に伴う機械的な更新。規則の変更は op-spec)。

## フェーズ4: PR

- 司令官が push し `op pr create` (本文: 部品名、variant × 状態の一覧、モック URL、確定日)。
- 部品の Issue から起動した場合は `Fixes #N`。この部品を待っている画面 Issue (`op-depends-on`) があれば完了報告に列挙する。
- マージは `/op-skill:op-merge` または人間が GitHub で行う。

## 完了報告

```
## op-component 完了: <部品名>
- 状態: 確定 (PR #<N>) / 保留 (<理由>)
- variant × 状態: <一覧>
- モック: <artifact URL>
- 待っている画面 Issue: #<M>, ...
```
