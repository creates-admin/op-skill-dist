<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 で SKILL.md フェーズ4-1-fallback / 5-5 / 5-6 本文から
       移動 (内容変更なし、verbatim 転記)。3 節とも「稀な側の分岐」または「エラー・リカバリ経路」で
       主経路 (feature-expert 委譲 → `op issue create` 起票成功) では読まれないため references/ へ集約。
-->

<!--
機能概要: op-architect の fallback / エラー・リカバリ経路 3 種をまとめた参照ファイル。
          (1) フェーズ4-1: feature-expert が利用できない場合の司令官直接分解、
          (2) フェーズ5-5: `--issue-md` モード (gh 不使用環境向け Markdown 書き出し)、
          (3) フェーズ5-6: Pass 1/Pass 2 部分成功時の集約レポート。
作成意図: 3 節はいずれも「起動したら必ず通る主経路」ではなく、feature-expert 不在 / gh 不使用 /
          起票一部失敗という**稀な側の分岐**であるため、本文から分離してまとめて 1 ファイルに
          集約した (単体では小粒だが同じ性質 = fallback/recovery のためグルーピング)。
注意点: 内容は SKILL.md からの verbatim 移動 (見出しレベルのみ `###` → `##` に統一、
        本ファイル単体としての階層を成立させるための調整でテキスト内容は変更していない)。
        フェーズ番号 (4-1-fallback / 5-5 / 5-6) は SKILL.md 側との対応を保つため見出し文言に残す。
-->

# op-architect fallback / リカバリ経路 集約

## 4-1-fallback. feature-expert が利用できない場合

**いつ読むか**: フェーズ4-1 で `feature-expert` agent の spawn に失敗した、または未配置/出力不完全だった場合のみ。

`feature-expert` agent が未配置 / spawn 失敗 / 出力が不完全の場合は、司令官が**直接**以下の基準で分解する:

- 1 マイルストーン = 1 Issue = 1 PR = 1〜3 日分の作業
- 1 番目は必ず**スケルトン Issue** (デフォルトモード時)
- 2 番目以降は **DB / API / UI / 検証 / 配布 / ドキュメント** の領域別に分離
- ADR と対応しない Issue は原則作らない (作る場合は理由を Issue 本文に明記)
- 並列実行のため、`depends_on` 連鎖は最大 2 段まで (3 段以上は粒度分割を再検討)
- 司令官分解の場合も、出力フォーマットは feature-expert 依頼時と同じ JSON 構造に揃える

## 5-5. `--issue-md` モード (gh が使えない環境向け)

**いつ読むか**: `/op-architect --issue-md` 指定時、または gh 認証 / 権限 / ネットワークが原因で
`op issue create` が失敗した場合のみ。

`--issue-md` 指定時、または gh 認証 / 権限 / ネットワークが原因で `op issue create` が失敗した場合は、起票せずに **Markdown ファイルとして書き出す** モードに切り替える (ユーザー確認後):

```
docs/issues/initial/
├── 001-skeleton-tauri-vue.md
├── 002-db-sqlite-schema.md
├── 003-ui-login.md
└── ...
```

各ファイルは「5-4 の Issue 本文テンプレ」と同じ構造で、先頭に YAML フロントマターでラベルとタイトルを保持:

```markdown
---
title: "スケルトン: Tauri + Vue プロジェクト雛形作成 (initial)"
labels: [auto-report, op-architect, pro-feature-expert, milestone:initial, module:bootstrap]
depends_on: []   # ファイル名で参照 (例: ["001-skeleton-tauri-vue"])
---

## 概要
...
```

利用者は後から手動で GitHub Issue に貼るか、別エージェントに起票させる。`--issue-md` でも 5-3-b の起票プレビューと同等の表をユーザーに提示する。

## 5-6. 部分成功時の集約レポート

**いつ読むか**: フェーズ5-4 Pass 1 / Pass 2 で 1 件でも作成失敗 / body 更新失敗があった場合のみ。
全件成功時はこのファイルを読まずフェーズ5-7 の完了レポートへ進む。

Pass 1 / Pass 2 で失敗があった場合、必ず**作成済み / 未作成 / body 更新失敗**を分けて報告する:

```
## op-architect 起票結果

### 作成成功 (3 件)
- M1 → #42 https://github.com/owner/repo/issues/42
- M2 → #43 https://github.com/owner/repo/issues/43
- M3 → #44 https://github.com/owner/repo/issues/44

### 作成失敗 (1 件)
- M4: HTTP 422 (body too long) — トリミングして再実行が必要

### body 更新失敗 (depends_on 解決) (0 件)
- なし

### 推奨アクション
- M4 の body を短縮し、`op issue create --body-file <new> --ensure-labels` で再実行
- 残 Issue の depends_on は Pass 2 で正常に解決済み
```

`op issue create` の失敗で部分成功となった場合、**rollback (作成済み Issue の close) は自動では行わない**。ユーザー判断に委ねる (Issue close は op-merge / 手動の責務)。

依存関係 (`depends_on`) は Issue 番号確定後 (Pass 2) に各 Issue の `## 依存` セクションへ反映する。
