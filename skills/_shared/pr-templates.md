# PR / Issue 本文テンプレ

op-* スキル群が GitHub に投稿する Issue / PR / コメントの本文テンプレ。

---

## Canonical Labels and Markers

label / marker の名前・所有者・semantics の正本は `skills/_shared/markers/labels-and-markers.md`、spawn 可否は
`skills/_shared/runtime-contract.md`。本ファイルはテンプレのみを持つ。

Issue 本文に書く hidden marker は `op-fingerprint` / `op-fingerprint-bulk` / `op-run-expert` / `op-post-check-expert` /
`op-depends-on` / `op-spec-ref` のうち該当するものだけ。それ以外の情報は本文の自然文で書く。

### 工程依存 marker 予約行 (op-architect / op-plan milestone Issue)

depends_on を持つ milestone 工程 Issue は、prose `## 依存` と同じ依存を hidden marker でも記録する
(依存が無ければ行ごと省略)。消費側は op-loop / `op issue dep-graph`。

```
<!-- op-depends-on: #<先行工程N>, #<先行工程M> -->
```

---

## 共通ルール

- すべての本文は日本語
- 本文は一時ファイルに書き、`op issue create` / `op pr create` / `op pr comment` に `--body-file` で渡す
- `\n` リテラル禁止 (GitHub で改行されない)
- 末尾に自動生成タグ: `🤖 <skill-name> による自動投稿`
- ラベルは小文字ハイフン区切り (`auto-fix`, `pro-reviewed` 等)

---

## marker-bearing comment lifecycle contract

OP skill / expert agent が投稿したコメント (Patrol Ledger / Spec Patrol Ledger のコメントを含む) は **immutable**。

- 禁止: `gh api -X PATCH .../issues/comments/:id` / `--edit-last` / その他 comment body を in-place で書き換える API
- 修復は delete-and-republish: 削除 → 原因 (変数展開漏れ・引用誤り等) を特定 → 値が確定した状態で **新規** 投稿

---

## op-scan: Issue 起票テンプレ (指示書化された context handoff)

Issue は検出報告ではなく、apply agent への **指示書** として書く (scan の推論・除外仮説・触ってよい範囲を渡す)。

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
- <仮説 Y: 否定の根拠>

### 触ってよいファイル
- `path/to/file.ext`
- `path/to/related.ext`

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

### 実行ルール (apply agent / refactor-expert)

- **`immediate_refactor` かつ `direct_apply_safe=true`**: `scope_in` 範囲で recommendation 全体を direct apply してよい
- **`immediate_refactor` かつ `direct_apply_safe=false`**: 着手しない (`needs:triage` で人間判断)
- **`staged_refactor` / `architecture_debt`**: `safe_first_step` のみ実行する (1 stage = 1 PR)
- **`needs_spec_decision`** または **`needs_human_decision.required=true`**: コードを編集しない。
  `needs_human_decision` block と `human_decision_points` を完了報告に構造化返却する

---

## 関連
<関連 Issue / PR / 既知の議論があれば>

---
🤖 op-scan による自動起票
```

省略規則:

- `デザインモック:` 行は UI を含み、かつモック (`_shared/design-mock.md`) がある Issue のみ。無ければ行ごと省略する。
- refactor の debt 系 finding (`finding_type` ∈ architecture_debt / staged_refactor / needs_spec_decision) は
  `op-fingerprint` に加えて debt 追跡キー `<!-- op-fingerprint-bulk: refactor:<bulk_group>:<primary_dir> -->` も埋める
  (`op core fingerprint-bulk`)。
- `op-post-check-expert`: runtime spawn されるのは `ux-ui-audit-expert` / `security-expert` のみ。`env-expert` は planned
  (記録しても post-check は skip / needs_human_decision)。不要でも省略せず `null` を書く。
- `🧱 Refactor Execution Control` 節 (実行ルール含む) は domain=refactor の Issue でのみ書く。

ラベル: `auto-report` + `pro-<expert>-expert` (`pro-review-expert` は付与禁止) + `severity:<level>`。
domain 別の `pro-*-expert` ラベル付与パターン:

- `domain = ux-ui`: `pro-designer-expert` (apply) + `pro-ux-ui-audit-expert` (post-check)
- `domain = design` (UI files に触る): `pro-designer-expert` (apply) + `pro-ux-ui-audit-expert` (post-check)
- `domain = design` (UI files に触らない): `pro-designer-expert` 1 つ
- `domain = security`: 基本は `pro-security-expert` (apply 兼 post-check) 1 つ。op-run の判定優先順位で apply を
  debug-expert に回す場合は `pro-debug-expert` (apply) + `pro-security-expert` (post-check)
- `domain = feature` (UI 影響あり): `pro-feature-expert` (apply) + `pro-ux-ui-audit-expert` (post-check)
- 上記以外 (debug / refactor / optimize / test / UI 影響なし feature): `pro-<expert>-expert` 1 つ

---

## op-scan: バッチ Issue 起票テンプレ (一括削除・命名統一など)

同質な検出が大量に出る場合は、カテゴリ単位で 1 Issue 1 PR にまとめる。適用条件 (すべて満たす):

- 同一 expert + 同一カテゴリの検出が 5 件以上
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
| 2 | `path/b.ext:45` | ... | ... |

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
1. 対象一覧を 5〜10 件ずつのバッチに分割
2. 各バッチ処理後に検証 (テスト実行)
3. 失敗したバッチは隔離 (別 Issue 化検討)、残りは続行

---

## 関連
<関連 Issue / PR があれば>

---
🤖 op-scan による自動起票 (batch)
```

apply 側は 1 PR で全件処理し、コミットは 5〜10 件単位で分ける。

---

## op-run: PR open テンプレ

PR 本文は **二層構造** で書く。上半分は非エンジニア (現場・運用・QA) 向けの業務視点、下半分はエンジニア向けの技術詳細。
**「自動検証」(`cargo test` 等の機械的確認) と「回帰テスト」(業務シナリオが壊れていないか) を分ける**。

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

`op pr create --draft --base <base> --head <branch> --title "<タイトル>" --body-file body.md` (ラベル `auto-fix` は
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
🤖 op-run による自動 PR (draft)。
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

footer (`🤖 op-run による自動 PR (draft)。`) の **後** に `<!-- op-review-state -->` marker + JSON fence の state block が置かれる。
review / post-check の結果の唯一の機械記録であり、機械管理領域:

- 人間 / agent とも手編集しない。書き換えは `op pr edit-body` / `op review state push` 経由のみ。
- `<!-- op-review-state -->` marker 行を PR 本文 (説明・コード例・引用) に独立行として書かない
  (parse は body 内で最初に出現する marker 行を state block とみなす)。
- field schema の正本は `skills/_shared/markers/review-markers.md` の「`<!-- op-review-state -->` body block」節。

### PR 本文の品質要件 (apply agent / reviewer 共通)

**必須**:
- 冒頭に「ひとことで言うと」を置く (非エンジニアにも伝わる 1〜2 文)
- 「なぜ変更したか」「何が変わったか」「変わらないこと」を業務視点で書く
- 利用者から見える変更と、裏側の実装変更を分ける
- 回帰テストで確認すべき業務シナリオをチェックリスト化する
- 自動検証と回帰テストを別セクションとして分けて記載する
- apply 完了報告に follow-up 項目 (上表) がある場合は「残存リスク / follow-up」節に転記する

**禁止**:
- 「バリデーションを修正」「state を更新」「型を整理」だけで終わる説明
- 変更ファイル一覧だけで業務視点の説明がない PR 本文
- 自動検証コマンドだけで、業務上の確認観点 (回帰テスト) がない PR 本文
- ファイル名・関数名・クラス名のみで何が起きるかを説明する
- 専門用語を業務上の意味に言い換えずそのまま使う

判断基準: 「コードを読まない現場担当者が何を確認すればよいか自力で分かるか?」。

---

## op-run: review 結果コメント (review-expert)

人間向けの記録。機械記録は PR body の `<!-- op-review-state -->` (`op review state push/pull`)。

- **approve**: `op review publish-approval` を使う (state push + `pro-reviewed` 付与を atomic に実行)。
- **needs-fix / needs-specialist-review / blocked**: 下記を `op pr comment <pr> --body-file` で投稿する。OP-managed Mode では
  投稿者は ClusterOrchestrator (review-expert は構造化返却のみ)。label 操作は op-run の責務。

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
🤖 review-expert による独立 global review (op-run)
```

---

## op-run: specialist 判断結果コメント (specialist expert)

人間向けの記録。機械記録は state 文書の `specialist_reviews[]` であり、ClusterOrchestrator は投稿に加えて
`op review state push` (`specialist_review` payload) を行う。

- 1 コメント = 1 finding。判断・根拠・推奨 apply expert を自然文で書く。specialist expert 自身が出す (review-expert / op-run が代理出力しない)。
- 推奨 apply expert に `review-expert` / `ux-ui-audit-expert` を指定しない。
- specialist がその場で修正まで行うケースでも、判断根拠として残す。

---

## op-run: UX/UI Post-check Result (ux-ui-audit-expert 出力)

apply 後の draft PR diff を ux-ui-audit-expert が独立に audit した結果。人間向けの記録であり、機械記録は state 文書の
`post_checks["ux-ui-audit-expert"]` (ClusterOrchestrator は投稿に加えて `op review state push` の `post_check` payload を行う)。
Issue にデザインモックがあれば `Artifact({action:"read", url})` で参照して照合する。

司令官 (op-run) の分岐:
- PASS: review-expert global review (フェーズ4) へ進む
- PASS_WITH_NOTES: Notes を残して global review へ進む
- BLOCK: global review を呼ばず、該当クラスタの op-run-expert (apply 担当。designer-expert または UI 影響あり
  feature の feature-expert) に戻して Required Changes を実装させる (op-run/SKILL.md フェーズ 3.5)

```markdown
## UX/UI Post-check Result

### 判定
PASS | PASS_WITH_NOTES | BLOCK (post-check head: <sha> / round: <N>)

### 評価サマリ
<2〜4 文で全体評価>

### 観点別チェック
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | デザインモックと実装が一致 (モックがある場合) | OK / NG / N/A | <NG なら逸脱箇所> |
| 2 | 必要な状態 (loading / empty / error 等、UI 種別ごとに該当するもの) の実装 | OK / NG | <NG なら欠落 state + 該当ファイル> |
| 3 | error / loading の実装 (該当する場合) | OK / NG | <NG なら不足箇所 + 該当ファイル> |
| 4 | keyboard / focus の保持 | OK / NG | <NG なら回帰内容> |
| 5 | 操作のわかりやすさ (クリック数 / 戻る導線) | OK / NG | <NG なら劣化点> |
| 6 | Issue 範囲外 redesign の混入 | OK / NG | <NG なら scope_out 違反箇所> |
| 7 | style 変更による UX / a11y 退化 | OK / NG | <NG なら退化箇所 (focus / contrast / keyboard / state visibility 破壊。hard-coded style / token bypass そのものは designer-expert の post-check 領域)> |

### Notes (PASS_WITH_NOTES 時)
- レビュアー (review-expert) に伝えたい軽微な観点を箇条書き

### Required Changes (BLOCK 時)
- 実装で追加すべきコード / 修正すべき差分を具体的に記述
- 例: `features/job-board/JobList.vue` に EmptyState コンポーネントを追加
```

---

## op-run: Security Post-check Result (security-expert 出力)

apply 後の draft PR diff を security-expert が独立に issue 固有再監査した結果。人間向けの記録であり、機械記録は state 文書の
`post_checks["security-expert"]` (aux post-check は同じ map に `ux-ui-audit-expert@aux` キーで同居)。
8 観点の semantics は expert-security skill の `post-check-policy.md`。

- 本 post-check は元 finding の解消と新たな露出面の有無の深掘り。フェーズ4 global review (7 lens 横断) とは別工程で、
  PASS / PASS_WITH_NOTES の PR ではフェーズ4 の Security/Abuse Lens を「PR 全体の新たな露出面のみ軽く」に切り替える。

司令官 (op-run) の分岐:
- PASS: フェーズ4 に軽量モードで進む
- PASS_WITH_NOTES: フェーズ4 にそのまま進む
- BLOCK: フェーズ4 を呼ばず `pro-security-needs-fix` を付与し、apply 担当 expert (security-expert または debug-expert) を
  再 spawn して Required Changes を実装させる (op-run/SKILL.md フェーズ 3.5-B)

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

---

## Needs Human Decision (構造化された人間判断要求)

OP-managed Mode の expert は質問テキストではなく `needs_human_decision` YAML block で返す。
schema・フィールド説明・禁止フレーズ・出力例の正本は `_shared/invocation-mode.md`。
