# PR / Issue 本文テンプレ

op-* スキル群が GitHub に投稿する Issue / PR / コメントの本文テンプレと、Issue に付ける marker・ラベルの正本。
label / marker の名前・semantics は `markers/labels-and-markers.md`、spawn 可否は `runtime-contract.md`。

---

## 共通ルール

- すべての本文は日本語
- 本文は一時ファイルに書き、`op issue create` / `op pr create` / `op pr comment` に `--body-file` で渡す
- `\n` リテラル禁止 (GitHub で改行されない)
- 末尾に自動生成タグ: `🤖 <skill-name> による自動投稿`
- 投稿済みのコメントを書き換えない。誤りは削除して、値が確定した状態で新規投稿する
- 見出し `概要` / `触ってよいファイル` / `成功条件` は `op run issue-health` が、`残存リスク / follow-up` は op-scan `--from-merged-pr` が
  パースする。見出し名を変えない

---

## op-scan: Issue 起票テンプレ (指示書化された context handoff)

Issue は検出報告ではなく、apply agent への指示書として書く (scan の推論・除外仮説・触ってよい範囲を渡す)。
op-scan / op-patrol / op-plan / op-architect / op-report / op-spec 派生 Issue の共通骨格。

### Issue タイトル

```
[<expert>] <短い要約>
```

例: `[debug-expert] 認証ミドルウェアでセッション破棄が漏れる`

### Issue 本文 (指示書フル版)

```bash
op issue create --title "[<expert>] <要約>" \
  --label "auto-report,<domain 別の pro-*-expert ラベル群>,severity:<critical|high>" \
  --body-file body.md
```

`body.md`:

```markdown
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-run-expert: <apply 担当 expert (recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | env-expert | null> -->

## 概要
<1〜2文で問題を説明>

デザインモック: <artifact URL>

## 検出根拠
- 対象ファイル: `path/to/file.ext:LINE`
- 検出スキル: <expert>
- 深刻度: <Critical / High>

## 観測された挙動 / Evidence
<該当コード 5〜10 行 + 静的に観測した問題点>

---

## 🤖 apply agent への指示書

### scan が立てた仮説
<根本原因として最有力と判断したもの>

### 除外した仮説 (scan が検証して否定した)
- <仮説 X: 否定の根拠>

### 触ってよいファイル
- `path/to/file.ext`

### 触ってはいけないファイル / 領域
<別 Issue で扱う範囲、影響範囲外、リファクタ禁止領域など>

### 必須検証項目
- [ ] <修正後にテストで確認すべき項目>
- [ ] <リグレッション確認項目>

### 成功条件
<どうなれば修正完了と判定できるか>

### 既知の落とし穴 / 注意点
<scan が遭遇した罠、apply で踏みやすいミス>

## 🧱 Refactor Execution Control (domain=refactor 専用)

- finding_type: <immediate_refactor | staged_refactor | architecture_debt | needs_spec_decision>
- execution_mode: <direct_apply | staged_refactor | needs_human_decision>
- direct_apply_safe: <true | false>
- safe_first_step: <この Issue で実行してよい最初の一手 (1〜2 文)>
- proposed_stages:
  1. <stage 1>
  2. <stage 2>
- forbidden_stage_actions:
  - safe_first_step 以外の stage を本 PR 内で実行しない
  - public API / serialized format / DB schema / migration / IPC contract を変更しない
  - Tauri command name / event name / permission name / 実値 (path / key / status / error code / env var) を変更しない
  - file location を移動しない (移動が必要な stage は別 PR)
  - bug fix / performance optimization / feature 実装を混ぜない
- blocking: <true | false>
- blocking_reason: <blocking=true の場合のみ、false なら null>
- recommended_followup_experts:
  - <follow-up が必要な expert がある場合のみ>
- affected_paths (architecture_debt / staged_refactor / needs_spec_decision で必須):
  - <path glob 1>
- architecture_debt メタ (finding_type=architecture_debt の場合のみ):
  - first_detected_at: <YYYY-MM-DD>
  - last_seen_at: <YYYY-MM-DD>
  - seen_count: <整数>
  - risk_trend: <stable | worsening | spreading>
- needs_human_decision: <`required: true` の場合のみ `_shared/invocation-mode.md` の schema で block 全体を埋める。不要なら省略>
- human_decision_points:
  - <判断が必要な決定点 1>

---

## 関連
<関連 Issue / PR / 既知の議論があれば>

---
🤖 op-scan による自動起票
```

省略規則:

- `デザインモック:` 行は UI を含み、かつモック (`_shared/design-mock.md`) がある Issue のみ。無ければ行ごと省略する。
- `🧱 Refactor Execution Control` 節は domain=refactor の Issue でのみ書く。実行ルールは expert-refactor skill の「実行ルール」。
- 依存がある工程 Issue (op-plan / op-architect) は `<!-- op-depends-on: #N, #M -->` と prose `## 依存` を書く。依存が無ければ行ごと省略する。

### Issue 本文 hidden marker

Issue 本文に書く marker は次だけ。それ以外の情報 (検出 expert・元 Issue・巡回 area 等) は本文の自然文で書く。

- `op-fingerprint` (通常 Issue) / `op-fingerprint-bulk` (バッチ Issue、`<domain>:<bulk_group>:<primary_dir>`)。
  生成は `op core fingerprint` / `op core fingerprint-bulk` (手書き禁止)。domain は fingerprint の第 1 segment で表す。
- refactor の debt 系 finding (`finding_type` ∈ architecture_debt / staged_refactor / needs_spec_decision) は `op-fingerprint` に加えて
  debt 追跡キー `op-fingerprint-bulk` (`op core fingerprint-bulk --domain refactor --bulk-group <g> --primary-dir <affected_paths の LCA>`) も埋める。
- `op-run-expert` / `op-post-check-expert`: canonical schema の `recommended_runner` / `post_check_expert` を転写する。欠けていれば下表で補完する。
  `op-post-check-expert` は不要でも省略せず `null` を書く。runtime spawn される post-check は `ux-ui-audit-expert` / `security-expert` のみ
  (`env-expert` は planned で metadata only)。
- `op-depends-on` / `op-spec-ref`: 該当する場合のみ (`markers/labels-and-markers.md`)。

### domain → marker / ラベル表

op-scan / op-patrol / op-plan / op-architect / op-report / op-spec 派生 Issue 共通の正本。

| domain | op-run-expert | op-post-check-expert | pro-*-expert ラベル |
|---|---|---|---|
| `debug` | debug-expert | `null` | `pro-debug-expert` |
| `refactor` | refactor-expert | `null` / security-expert / ux-ui-audit-expert (file IO・path・capability・shell・secret 系は security、UI state・flow・a11y・visual 系は ux-ui。`expert-refactor/references/post-check-policy.md`) | `pro-refactor-expert` |
| `optimize` | optimize-expert | `null` | `pro-optimize-expert` |
| `security` | security-expert | security-expert | `pro-security-expert` (op-run が apply を debug-expert に回す場合は `pro-debug-expert` + `pro-security-expert`) |
| `ux-ui` | designer-expert | ux-ui-audit-expert | `pro-designer-expert` + `pro-ux-ui-audit-expert` |
| `design` (UI files に触る) | designer-expert | ux-ui-audit-expert | `pro-designer-expert` + `pro-ux-ui-audit-expert` |
| `design` (token・config のみ) | designer-expert | `null` | `pro-designer-expert` |
| `test` | test-expert | `null` | `pro-test-expert` |
| `feature` (UI 影響なし) | feature-expert | `null` | `pro-feature-expert` |
| `feature` (UI 影響あり) | feature-expert | ux-ui-audit-expert | `pro-feature-expert` + `pro-ux-ui-audit-expert` |
| `env` (planned) | env-expert | env-expert | `pro-env-expert` (routing metadata only) |

finding Issue のラベルは上表の `pro-*-expert` (完全形。`pro-review-expert` は付与禁止) + `auto-report` + `severity:<critical|high>`。バッチ Issue は `batch` を足す。op-plan / op-architect の計画 Issue は `severity:*` と `auto-report` を付けない。op-report 等 severity で絞らない経路 (`filing-gate.md` §1) は Critical / High のときだけ `severity:*` を付ける。
`op issue create --label "auto-report,severity:high,..."` とカンマ区切りで渡す。refactor 固有の追加ラベルは op-scan の
「domain=refactor 固有のラベル付与ルール」。

---

## op-scan: バッチ Issue 起票テンプレ (一括削除・命名統一など)

同質な検出が大量に出る場合は、カテゴリ単位で 1 Issue 1 PR にまとめる。適用条件 (すべて満たす):

- `op scan bulk-group` が batch 適格と判定した (同一 expert + 同一カテゴリ)
- 各検出の修正方針が均質 (削除のみ / 命名置換のみ等)
- ファイル間に強い依存がない (順序実行不要)

### Issue タイトル

```
[<expert>] <カテゴリ> 一括対応 (N 件)
```

例: `[test-expert] ゴミテスト一括削除 (放置 .skip 系 8 件)`

### Issue 本文 (バッチ版)

ラベルは個別 Issue と同じ domain 別パターン + `batch`。

```bash
op issue create --title "[<expert>] <カテゴリ> 一括対応 (<N> 件)" \
  --label "auto-report,<domain 別の pro-*-expert ラベル群>,severity:<critical|high>,batch" \
  --body-file body.md
```

`body.md`:

```markdown
<!-- op-fingerprint-bulk: <domain>:<bulk_group>:<primary_dir> -->
<!-- op-run-expert: <apply 担当 expert (recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | env-expert | null> -->

## 概要
<カテゴリ全体の問題説明 + なぜ一括処理が妥当か>

## 検出根拠
- 検出スキル: <expert>
- カテゴリ: <カテゴリ名>
- 件数: <N>
- 深刻度: <Critical / High>

## 対象一覧

| # | ファイル:行 | 個別の指摘 | 修正方針 |
|---|------------|-----------|---------|
| 1 | `path/a.ext:12` | <個別指摘> | 削除 / 置換 / 修正 |

---

## 🤖 apply agent への指示書

### scan が立てた仮説 (カテゴリ全体)
<このカテゴリの本質的な問題>

### 除外した仮説
- <検討したが該当しなかったもの>

### 触ってよいファイル
上記対象一覧のファイルのみ。

### 触ってはいけないファイル / 領域
- 対象一覧に含まれないテスト / 実装ファイル

### 必須検証項目
- [ ] 全件処理後にスイート全 pass
- [ ] カバレッジ低下が許容範囲内 (削除系の場合)
- [ ] 一括処理対象外の機能に影響なし

### 成功条件
全 N 件を 1 PR で処理し、検証項目すべて pass。

### 既知の落とし穴
<削除候補の中に実は価値あるものが混じる可能性、その判定基準>

### バッチ処理の進め方
1. 対象一覧を 5〜10 件ずつのバッチに分け、バッチごとに commit と検証 (テスト実行) を行う
2. 失敗したバッチは隔離 (別 Issue 化検討)、残りは続行

---

## 関連
<関連 Issue / PR があれば>

---
🤖 op-scan による自動起票 (batch)
```

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

## op-run: review 結果コメント (review-expert)

Direct Mode で review-expert がユーザー許可後に投稿する場合の骨組み。OP-managed (op-run / op-codev) では review-expert は投稿せず、
controller が記録する (`op review publish-approval` / `op review state push`、書式は op-run skill の `references/global-review-spawn.md` 4-2-b)。
Direct Mode の投稿は op-review-state に書かない。

```markdown
## <🔧 修正必要 (needs-fix) | 🧐 専門判断が必要 (needs-specialist-review) | ⛔ blocked (自動継続不能)>

review round: <N> / reviewed head: <sha>

<判定理由。needs-fix は 3 条件 AND (same-pr 内で修正可能 / 単一 expert で完結 / 既知パターン) を明記、
 1 つでも欠けるなら needs-specialist-review。blocked は scope_out 違反 / 人間判断必要 / loop 上限超過 / Issue 再設計必要 のいずれか>

### Findings

#### RVW-001 (<critical | high | medium | low>, <Security / Abuse | Workflow / UX | Test | Compatibility | Release | Spec | Refactor>)
- 推奨修正担当: <expert 名 | なし>
- 修正後に必要な post-check: <ux-ui-audit-expert | security-expert | なし>

<問題説明と推奨方針>

---
🤖 review-expert による独立 global review
```

---

## op-run: Security Post-check Result (security-expert 出力)

apply 後の PR diff を security-expert が独立に issue 固有再監査した結果の人間向けコメント。機械記録は state 文書の
`post_checks["security-expert"]`、8 観点の semantics は expert-security skill の `post-check-policy.md`、判定後の分岐は
op-run skill の `references/post-check-dispatcher.md` 3.5-B-2。

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
- フェーズ4 review-expert に伝えたい軽微な観点を箇条書き

### Required Changes (BLOCK 時)
- 実装で追加すべきコード / 修正すべき差分を具体的に記述
- 例: `src-tauri/src/commands/export.rs:export_report` の path canonicalization に `..` rejection を追加

### Needs Human Decision (NEEDS_HUMAN_DECISION 時)
- security risk と usable workflow のトレードオフが高く自動判断不能な場合
- needs_human_decision YAML block を本文に埋め込む (`_shared/invocation-mode.md` の正規 schema)
```
