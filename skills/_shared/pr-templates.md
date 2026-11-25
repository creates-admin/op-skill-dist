# PR 本文テンプレ

op-* スキル群が GitHub に投稿する PR・レビュー結果・post-check の本文テンプレの正本。Issue の本文テンプレと marker・ラベルは `issue-templates.md`。

---

## 共通ルール

- 本文の書き方 (日本語・`--body-file`・改行・footer・投稿済みコメントの扱い) は `issue-templates.md`「共通ルール」
- 見出し `残存リスク / follow-up` は op-scan `--from-merged-pr` がパースする。見出し名を変えない

---

## op-run: PR open テンプレ

PR 本文は二層構造で書く。上半分は非エンジニア (現場・運用・QA) 向けの業務視点、下半分はエンジニア向けの技術詳細。
「自動検証」(`cargo test` 等の機械的確認) と「回帰テスト」(業務シナリオが壊れていないか) を分ける。

### PR タイトル

```
<業務領域>: <利用者から見える変更> [#<issues>]
```

- 業務領域: 利用者が認識する機能名 (例: `帳票出力` / `検版` / `ジョブ発行` / `ログイン`)
- 利用者から見える変更: ファイル名・関数名ではなく利用者視点で 1 行

例: `帳票出力: 保存先エラー時にアプリが落ちないよう修正 [#42]`

利用者影響がない変更 (純粋なリファクタ・依存更新等) のみ `<type>(<scope>): <summary> [#<issues>]` を許容する。
その場合も「ひとことで言うと」は省略しない。

### PR 本文

`op pr create --base <base> --head <branch> --title "<タイトル>" --body-file body.md` (draft にしない。ラベル `auto-fix` は
`op pr edit-labels` で付ける)。

`body.md`:

```markdown
## ひとことで言うと

<非エンジニアにも伝わる 1〜2 文。技術用語を避ける。
例: 帳票出力時に、保存先フォルダが見つからない場合でもアプリが落ちず、
わかりやすいエラーを表示するようにしました。>

## なぜ変更したか

<発生していた困りごと・業務上の不便・事故リスクを業務視点で>

## 何が変わったか

| 観点 | 内容 |
|------|------|
| 利用者から見える変更 | <画面・操作・表示・出力結果の変化> |
| 裏側の変更 | <非エンジニア向けに短く> |
| 変わらないこと | <既存操作・既存データ・既存設定への影響なし等> |

## 影響範囲

| 対象 | 影響 |
|------|------|
| 画面 | <あり/なし + 内容> |
| データ | <あり/なし + 内容> |
| ファイル出力 | <あり/なし + 内容> |
| 既存ユーザー操作 | <あり/なし + 内容> |
| 権限・セキュリティ | <あり/なし + 内容> |

## 回帰テストで確認してほしいこと

### 必ず確認

- [ ] <通常操作がこれまで通り成功すること>
- [ ] <今回直した不具合が再発しないこと>
- [ ] <エラー時にアプリが落ちず、理解できる表示になること>

### できれば確認

- [ ] <周辺機能・同じ部品を使う別画面>
- [ ] <古いデータ / 既存ファイル / 空欄 / キャンセル操作など>

### 確認不要または対象外

- <今回の変更では触っていない範囲>
- <別 Issue で扱う範囲>

---

## 対象 Issue
Fixes #42
Fixes #43

## 変更内容 (技術詳細)
| ファイル | 変更内容 |
|---------|---------|
| src/auth/login.ts | ... |

## 安全性チェック

| 観点 | 結果 |
|------|------|
| 変更範囲は Issue の scope 内か | yes / no |
| 既存データを変更するか | yes / no |
| ファイル I/O に影響するか | yes / no |
| 権限・認証に影響するか | yes / no |
| 依存関係を追加・削除したか | yes / no |
| 既存 API シグネチャ変更があるか | yes / no (ありの場合は影響先を明記) |

## 自動検証

| レベル | 結果 | 実行コマンド or skipped 理由 |
|--------|------|----------------------------|
| Static | pass / fail / skipped | <例: cargo fmt --check / cargo clippy> |
| Unit | pass / fail / skipped | <例: cargo test / pnpm test> |
| Build | pass / fail / skipped | <例: pnpm build / cargo build> |
| Integration | pass / fail / skipped | <例: pnpm test:e2e / 環境依存で skipped> |
| Manual required | yes / no | <必要な手動確認の概要> |

## 残存リスク / follow-up

<apply 完了報告の follow-up 項目を転記。空なら本節ごと省略>

## レビュー観点

- <レビュアーに特に見てほしい点>
- <トレードオフや迷った判断>
- <環境依存で未確認の点>

---
🤖 op-run による自動 PR
```

- 自動検証の分類は `_shared/project-profile.md` に従う。環境依存 (InDesign COM / Tauri full build / 実機 等) は
  skipped + 理由記載でよい。Manual required = yes は失格ではない。
- 「残存リスク / follow-up」に転記する項目 (Issue 自動起票はしない):

| apply 完了報告の source | 転記内容 |
|--------|---------|
| `recommended_followup_experts[]` | 各要素 `{expert, reason, scope}` を箇条書き |
| `needs_human_decision` (opt-out で `safe_first_step` のみ実行した PR) | block 全体 (decision_type / options / safest_default / blocked_actions / next_safe_action) |
| 未解消 `assumptions[]` | 推定で進めた前提と、検証が必要なポイント |
| safe_first_step 中に検出された `blocked_actions[]` 抵触候補 | 次 stage で扱うべき範囲 |

ラベル: `auto-fix` (作成時) / `pro-reviewed` (review 通過後。人間がマージ判断する際の参考シグナル) /
`pro-review-needs-fix` (修正必要時)。

### body 末尾の op-review-state block (位置規約)

footer (`🤖 op-run による自動 PR`) の後に `<!-- op-review-state -->` marker + JSON fence の state block が置かれる。
review / post-check の結果の唯一の機械記録であり、機械管理領域:

- 人間 / agent とも手編集しない。書き換えは `op pr edit-body` / `op review state push` 経由のみ。
- `<!-- op-review-state -->` marker 行を PR 本文 (説明・コード例・引用) に独立行として書かない
  (parse は body 内で最初に出現する marker 行を state block とみなす)。
- field schema の正本は `skills/_shared/markers/review-markers.md` の「`<!-- op-review-state -->` body block」節。

### PR 本文の品質要件 (apply agent / reviewer 共通)

判断基準: 「コードを読まない現場担当者が何を確認すればよいか自力で分かるか?」。上記テンプレの節を埋めたうえで、次を禁止する:

- 「バリデーションを修正」「state を更新」「型を整理」だけで終わる説明
- 変更ファイル一覧だけで業務視点の説明がない PR 本文
- 自動検証コマンドだけで、業務上の確認観点 (回帰テスト) がない PR 本文
- ファイル名・関数名・クラス名のみで何が起きるかを説明する
- 専門用語を業務上の意味に言い換えずそのまま使う
- apply 完了報告に follow-up 項目 (上表) があるのに「残存リスク / follow-up」節に転記しない

---

## op-run: Security Post-check Result (security-expert 出力)

apply 後の PR diff を security-expert が独立に issue 固有再監査した結果の人間向けコメント。機械記録は state 文書の
`post_checks["security-expert"]`、8 観点の semantics は expert-security skill の `post-check-policy.md`。

```markdown
## Security Post-check Result

### 判定
PASS | PASS_WITH_NOTES | BLOCK | NEEDS_HUMAN_DECISION (post-check head: <sha> / round: <N>)

### 評価サマリ
<2〜4 文で全体評価>

### 観点別チェック (8 観点)
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | 元 finding の解消 (Issue success_criteria 達成) | OK / NG | <NG なら未解消の挙動 + 該当ファイル> |
| 2 | 修正で別の露出面が増えていないか | OK / NG | <NG なら新規露出面 + 該当行> |
| 3 | 入力検証 (path / encoding / canonicalization / size limit) | OK / NG | <NG なら検証漏れ + 該当箇所> |
| 4 | 認可 / capability の境界 (IPC / shell / file IO) | OK / NG | <NG なら境界違反 + 該当箇所> |
| 5 | エラーパスでの情報漏洩 / 失敗時挙動 (TOCTOU / privilege drop) | OK / NG | <NG なら漏洩経路 + 該当箇所> |
| 6 | Issue scope_out 違反 (redesign の混入) | OK / NG | <NG なら scope_out 違反箇所> |
| 7 | 正当なユーザー操作維持 | OK / NG | <NG なら capability 削除 / 出力先固定 / UI 削除> |
| 8 | UX/UI auxiliary post-check 必要性 | NO / YES | <YES なら理由。ux-ui-audit-expert post-check が追加実行される> |

### Notes (PASS_WITH_NOTES 時)
- 後のレビューに伝えたい軽微な観点を箇条書き

### Required Changes (BLOCK 時)
- 実装で追加すべきコード / 修正すべき差分を具体的に記述
- 例: `src-tauri/src/commands/export.rs:export_report` の path canonicalization に `..` rejection を追加

### Needs Human Decision (NEEDS_HUMAN_DECISION 時)
- security risk と usable workflow のトレードオフが高く自動判断不能な場合
- needs_human_decision YAML block を本文に埋め込む (`_shared/invocation-mode.md` の正規 schema)
```
