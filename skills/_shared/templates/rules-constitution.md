---
feature: constitution
status: draft
---

# constitution — 横断不変則 + feature 正本 索引

常時ロードされる薄い索引。各 feature の WHAT は `.claude/rules/<feature>.md` が正本。
`[[feature/section]]` は各正本の frontmatter の feature キーで解決する。

## Part 1: 横断不変則 (repo-wide MUST)

全 feature に効く WHAT 層の不変則だけを書く。開発の進め方 (HOW) は CLAUDE.md に書く。

- (未確定。確定したら op-spec 経由で追記する)

## Part 2: feature 正本 索引 (自動生成)

<!-- 自動生成: `op spec-patrol rebuild-index --apply` が正本の frontmatter の kind と feature キーから再生成する。手で編集しない。 -->
<!-- 索引除外: `_` prefix / `00-` prefix の meta ファイルは載せない。 -->

層の正本のキー: (なし)
業務領域の正本のキー: (なし)
機能の正本のキー: (なし)

正本の概要・paths と機能地図は `.claude/rules/_index.md` にある (正本を Read すると一緒に読み込まれる)。
