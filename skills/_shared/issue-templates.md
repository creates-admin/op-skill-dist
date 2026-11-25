# Issue 本文テンプレ

op-* スキル群が起票する Issue の本文テンプレと、Issue に付ける marker・ラベルの正本。
label / marker の名前・semantics は `markers/labels-and-markers.md`、spawn 可否は `runtime-contract.md`。

---

## 共通ルール

- すべての本文は日本語
- 本文は一時ファイルに書き、`op issue create` / `op issue edit-body` / `op issue comment` / `op pr create` / `op pr comment` に `--body-file` で渡す
- `\n` リテラル禁止 (GitHub で改行されない)
- 末尾に自動生成タグ: `🤖 <skill-name> による自動投稿`
- 投稿済みのコメントを書き換えない。誤りは削除して、値が確定した状態で新規投稿する
- 見出し `概要` / `触ってよいファイル` / `成功条件` は `op run issue-health` がパースする。見出し名を変えない

PR・レビュー結果・post-check の本文テンプレは `pr-templates.md`。

---

## op-scan: Issue 起票テンプレ (指示書化された context handoff)

Issue は検出報告ではなく、apply agent への指示書として書く (scan の推論・除外仮説・触ってよい範囲を渡す)。
op-intake / op-scan / op-patrol / op-plan / op-architect / op-report / op-spec 派生 Issue の共通骨格。

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

## 観測された挙動 / Evidence
<該当コード 5〜10 行 + 静的に観測した問題点>

## 振り分けの材料
- 触るファイル: <主なファイル・ディレクトリ>
- 画面: <画面名 | なし>
- 依存: <先に要る Issue | なし>
- 大きさ: <小（半日） | 中（1〜2 日） | 大（2〜3 日）>

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

<domain=refactor のときだけ、ここに Refactor Execution Control 節>

---

## 関連
<関連 Issue / PR / 既知の議論があれば>

---
🤖 op-scan による自動起票
```

省略規則:

- `デザインモック:` 行は UI を含み、かつモック (`_shared/design-mock.md`) がある Issue のみ。無ければ行ごと省略する。
- domain=refactor のときだけ、expert-refactor skill の `references/execution-control.md` の節を「既知の落とし穴 / 注意点」の後に書く。
- 依存がある Issue は `<!-- op-depends-on: #N, #M -->` と振り分けの材料の「依存」に書く。`## 依存` の地の文は書かない。依存が無ければ marker を省略する。

### 振り分けの材料

コーディネーターやスレッドが op-skill を読まずに Issue を振り分けるための節。見出しは `## 振り分けの材料`、項目は次の 4 つで、この順に書く。

- 触るファイル: 主なファイル・ディレクトリ (新規は「新規」と書く)
- 画面: UI を触るなら画面の名前、触らなければ「なし」
- 依存: 先に要る Issue (`#N`) とこの Issue を待つもの、無ければ「なし」
- 大きさ: 小（半日）/ 中（1〜2 日）/ 大（2〜3 日）。3 日を超えるなら Issue を分ける

op-intake が起票する Issue では必須。他の skill は書ける分だけ書き、書けなければ節ごと省略する。

### Issue 本文 hidden marker

Issue 本文に書く marker は次だけ。検出 expert はタイトルの `[<expert>]`、深刻度は `severity:*` ラベルで表し、それ以外の情報 (元 Issue・巡回 area 等) は本文の自然文で書く。

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
| `security` | security-expert | security-expert | `pro-security-expert` (apply を debug-expert に回す場合は `pro-debug-expert` + `pro-security-expert`) |
| `ux-ui` | designer-expert | ux-ui-audit-expert | `pro-designer-expert` + `pro-ux-ui-audit-expert` |
| `design` (UI files に触る) | designer-expert | ux-ui-audit-expert | `pro-designer-expert` + `pro-ux-ui-audit-expert` |
| `design` (token・config のみ) | designer-expert | `null` | `pro-designer-expert` |
| `test` | test-expert | `null` | `pro-test-expert` |
| `feature` (UI 影響なし) | feature-expert | `null` | `pro-feature-expert` |
| `feature` (UI 影響あり) | feature-expert | ux-ui-audit-expert | `pro-feature-expert` + `pro-ux-ui-audit-expert` |
| `env` (planned) | env-expert | env-expert | `pro-env-expert` (routing metadata only) |

finding Issue のラベルは上表の `pro-*-expert` (完全形。`pro-review-expert` は付与禁止) + `auto-report` + `severity:<critical|high>`。バッチ Issue は `batch` を足す。op-plan / op-architect の計画 Issue は `severity:*` を付けない (`auto-report` は付ける)。op-report 等 severity で絞らない経路 (`filing-gate.md` §1) は Critical / High のときだけ `severity:*` を付ける。
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
- カテゴリ: <カテゴリ名>
- 件数: <N>

## 対象一覧

| # | ファイル:行 | 個別の指摘 | 修正方針 |
|---|------------|-----------|---------|
| 1 | `path/a.ext:12` | <個別指摘> | 削除 / 置換 / 修正 |

## 振り分けの材料
- 触るファイル: 対象一覧のとおり (<主なディレクトリ>)
- 画面: <画面名 | なし>
- 依存: <先に要る Issue | なし>
- 大きさ: <小（半日） | 中（1〜2 日） | 大（2〜3 日）>

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
