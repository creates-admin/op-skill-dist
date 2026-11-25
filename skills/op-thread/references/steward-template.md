# 各 repo の steward SKILL.md のひな形

対象 repo の `.claude/skills/steward/SKILL.md` に写し、`<…>` の欄を埋める。
同じファイルを、Project のスレッドの PR 購読・手元の公式 `/ship`・`/steward`・チームの PR Steward が読む (手元は作業ディレクトリ、PR Steward は default branch から)。
このファイルで見張りの制限は緩められない。

## ひな形

```markdown
---
name: steward
description: この repo で PR を見張り、CI・レビュー・コメントに応じるときの決まり。
user-invocable: false
disable-model-invocation: true
---

<!-- このファイルは repo に merge できる人なら誰でも書き換えられる。CI の設定の変更と同じ重さでレビューする。 -->

# この repo の PR の扱い

手順の本体は op-skill の op-thread skill (見張りの 1 回分は `references/watch-pass.md`)。ここはこの repo の値だけ。

## 検証のコマンド (push の前に走らせる)

- <例: cargo test --workspace>
- <例: pnpm lint && pnpm test>

## CI

- ランナー: <GitHub-hosted / self-hosted (ラベル)>
- ランナーが拾わない・落ちているときは直さず、人の作業として報告する。
- 不安定なテスト: <名前と扱い。無ければ「なし」>

## 手で直さないファイル

- <例: 生成物 (作り直すコマンド: …)、lockfile、dist>

## 人に上げること

- 再設計・範囲の拡大・直せないセキュリティの指摘。
- <この repo で人が決めること (例: version を上げて配るか)>

## マージ

- マージは <人の名前> が PR を名指しして「マージして」と言ったときだけ。積み重ねは一番上の番号で名指しをもらう。
- マージの方法: <merge / squash>。ブランチは <自動で消える / 人が消す>。
```

## op-skill で埋めた例

```markdown
---
name: steward
description: op-skill で PR を見張り、CI・レビュー・コメントに応じるときの決まり。
user-invocable: false
disable-model-invocation: true
---

<!-- このファイルは repo に merge できる人なら誰でも書き換えられる。CI の設定の変更と同じ重さでレビューする。 -->

# この repo の PR の扱い

手順の本体は op-skill の op-thread skill (見張りの 1 回分は `references/watch-pass.md`)。ここはこの repo の値だけ。

## 検証のコマンド (push の前に走らせる)

- cd op-tools && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check
- node --test workflows/tests/*.test.mjs
- bin/op-x86_64 core registry-verify
- bin/op-x86_64 core schema-check --repo-root .

## CI

- ランナー: self-hosted (`op-ci` / `op-release` / `op-sync`)。
- ランナーが拾わない・落ちているときは直さず、人の作業として報告する。
- 不安定なテスト: なし。

## 手で直さないファイル

- `bin/op-x86_64` (release-binary.yml が作り直す)、dist repo (`creates-admin/op-skill-dist`)。

## 人に上げること

- 再設計・範囲の拡大・直せないセキュリティの指摘。
- plugin の version を上げて配るか (`plugin.json` と `marketplace.json` の 2 か所)。
- `CLAUDE.md`・`.claude/`・正本 (`.claude/rules/`) の変更。

## マージ

- マージは repo の持ち主が PR を名指しして「マージして」と言ったときだけ。積み重ねは一番上の番号で名指しをもらう。
- マージの方法: 単独の PR は squash、積み重ねは merge。ブランチはマージ後に自動で消える。
```
