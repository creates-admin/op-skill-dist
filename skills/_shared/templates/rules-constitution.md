---
feature: constitution
status: draft
---

# constitution — 横断不変則 + feature 正本 索引

常時ロードされる薄い索引。各 feature の WHAT は `.claude/rules/<feature>.md` が正本。
`[[feature/section]]` は Part 2 の feature キーで解決する。

## Part 1: 横断不変則 (repo-wide MUST)

全 feature に効く WHAT 層の不変則だけを書く。開発の進め方 (HOW) は CLAUDE.md に書く。

- (未確定。確定したら op-spec 経由で追記する)

## Part 2: feature 正本 索引 (自動生成)

<!-- 自動生成: `op spec-patrol rebuild-index --apply` が各正本の frontmatter から再生成する。表を手で編集しない (概要 列は保持される)。 -->
<!-- 索引除外: `_` prefix / `00-` prefix の meta ファイルは載せない。 -->

| feature | paths | status | 概要 |
|---|---|---|---|

## Part 3: 機能地図

<!-- 機能地図: op-spec が書く。正本列は feature キー (複数はカンマ区切り) か (未作成)。op spec-patrol coverage が網羅を調べる。 -->

| 機能 | 正本 | 備考 |
|---|---|---|
