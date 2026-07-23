<!--
schema_version: 13
last_breaking_change: 2026-05-17
notes: v13 (2026-05-17) — post-check meta block に `audit_result` 追加 (#110)。
       v12 (2026-05-16) — marker-bearing comment lifecycle contract 節追加 (PR #88 再発防止)。破壊的変更。
       v11 (2026-05-07) — UX/UI post-check テンプレに `post_check_result` 追加 (gate 13a fail 修正)。
       v10 (2026-05-06) — Marker schema 分割 (followup #20)。field schema を領域別 6 ファイルへ切り出し。
       v9 (2026-05-06) — label/marker 正本を labels-and-markers.md / runtime-contract.md に移管。
       v2〜v8: 旧版 changelog 省略 (git log 参照)。
-->

# PR / Issue 本文テンプレ

/**
 * 機能概要: op-scan が起票する Issue、op-run が open する PR、op-merge のマージコメントの本文テンプレを集約する
 * 作成意図: フォーマットを揃えて検索性・読みやすさを担保し、自動化された Issue/PR と手動のものを判別可能にする
 * 注意点: gh コマンドの --body は必ず HEREDOC 形式。文字列内の \n リテラルは GitHub で改行されないので禁止
 */

op-* スキル群が GitHub に投稿する Issue / PR / コメントの本文テンプレを集約する。
すべて日本語、HEREDOC 形式、自動生成タグを末尾に付与する。

---

## Canonical Labels and Markers

The canonical label names, marker names, marker ownership, and core marker semantics are defined in:

- `skills/_shared/markers/labels-and-markers.md`

Detailed field schema for marker blocks is defined per-domain in:

- `skills/_shared/markers/review-markers.md` — `op-review-meta` / `op-review-finding` / `op-review-finding-direct` / `op-review-report` / `op-specialist-review-meta`
- `skills/_shared/markers/post-check-markers.md` — `op-post-check-meta` 共通 schema
- `skills/_shared/markers/security-markers.md` — `op-security-post-check` / `op-security-requires-aux-post-check` / aux post-check 状態遷移
- `skills/_shared/markers/ux-ui-markers.md` — `op-ux-ui-gate` / `op-ux-ui-audit` / observation 観点 / Applicable States 判定
- `skills/_shared/markers/patrol-markers.md` — `op-patrol-run` / `op-patrol-checkpoint` の Patrol Ledger コメント JSON schema / area_state 構造
- `skills/_shared/markers/merge-gate-markers.md` (>=2) — `op-manual-override` block schema (`reviewed_head_sha` 必須)

Runtime spawn / merge blocking interpretation is defined in:

- `skills/_shared/runtime-contract.md`

This file provides **PR body templates, comment templates, and human-readable examples only**.
It must not redefine label or marker semantics in conflict with the shared contracts.

具体的には以下の正本性を本ファイルでは持たない (重複定義を見つけたら正本側に揃える):

- marker 名 inventory / marker ownership / core marker semantics → `labels-and-markers.md`
- label 名 inventory / label semantics (active / deprecated / 互換 含む) → `labels-and-markers.md`
- detailed field schema / enum 値 / null 許可ルール / state machine → 上記領域別 `*-markers.md`
- spawn authorization (どの marker / label が runtime spawn を許可するか) → `runtime-contract.md`
- merge blocking effect (どの marker / label が op-merge をブロックするか) → `runtime-contract.md`

本ファイルが正本責務を持つのは、上記契約を **どう PR 本文 / Issue 本文 / コメントに具体的な
bash gh HEREDOC / markdown として表現するか** のテンプレと書式・コピペ可能な実装例である。
bash テンプレ内に marker block が inline 出力として登場するのは実行可能性確保のためであり、
field の正規仕様 (型 / enum / 必須 / null 許可 / 検査ルール) は領域別 `*-markers.md` 側を SSoT とする。

### 工程依存 marker 予約行 (op-architect / op-plan milestone Issue、ADR-0019)

op-architect / op-plan が depends_on を持つ milestone 工程 Issue を起票する際、prose `## 依存` と
**同じ依存関係を機械可読化**するため、Issue 本文の hidden marker ブロックに以下の予約行を additive で含める
(依存が無い工程では行ごと省略する):

```
<!-- op-depends-on: #<先行工程N>, #<先行工程M> -->
```

- 値は `#<整数>` のカンマ区切り (semantics / lint 規約の正本は `labels-and-markers.md` の op-depends-on 節)。
- 消費側は op-loop / `op issue dep-graph` (DAG 層分割で工程を直列駆動する)。
- **merge-blocking ではない** (tracking marker、ADR-0019 D2 / D6)。

---

## 共通ルール

- すべての本文は日本語
- gh コマンドは `--body "$(cat <<'EOF' ... EOF )"` の HEREDOC 形式必須
- `\n` リテラル禁止 (GitHub で改行されない)
- 末尾に自動生成タグ: `🤖 <skill-name> による自動投稿`
- ラベルは小文字ハイフン区切り (`auto-fix`, `pro-reviewed` 等)

---

## marker-bearing comment lifecycle contract

<!--
機能概要: marker tag を含む PR/Issue コメントの編集可否・破損リカバリ手順を定義する契約節。
作成意図: PR #88 で review-expert が op-review-meta タグを含むコメントを gh api -X PATCH で
          修正した際に HTML コメント tag が消失し、op-merge gate 3a が fail した事故を受けて
          明文化。delete-and-republish を唯一の正規リカバリ経路として強制する。
注意点: 本節は全 op-* skill / expert agent に適用する。review-expert 専用ではない。
        marker が存在しないコメントの PATCH は禁止しない。
-->

以下の marker のいずれかを含む PR/Issue コメントは **immutable** として扱う。

- `<!-- op-review-meta -->` / `<!-- op-specialist-review-meta -->` / `<!-- op-review-controller-meta -->`
- `<!-- op-post-check-meta -->` / `<!-- op-security-post-check -->` / `<!-- op-ux-ui-audit -->`
- `<!-- op-review-finding -->` / `<!-- op-review-finding-direct -->` / `<!-- op-review-report -->`
- `<!-- op-manual-override -->`
- `<!-- op-fallback-applied -->`
- その他 `skills/_shared/markers/*.md` で `source_kind: pr-comment` を持つ marker

**禁止される操作** (op-* skill / expert agent が posting した marker-bearing comment に限定):

- `gh api -X PATCH /repos/:owner/:repo/issues/comments/:id`
- `gh issue comment --edit-last`
- `gh pr comment --edit-last`
- `gh api graphql` を用いた comment body の in-place 書き換え
- 上記と等価な comment body を書き換えるすべての API

**broken な marker comment を発見した場合の手順 (delete-and-republish)**:

1. `gh api -X DELETE /repos/:owner/:repo/issues/comments/<id>` で当該コメントを削除
2. 原因を特定する (env 未 export / HEREDOC 引用誤り / 改行コード / 変数展開漏れ 等)
3. 値が確定した env 上で **新規** に `gh pr comment --body ...` を投稿する
4. 新規投稿により `created_at` が更新された fresh コメントが op-merge gate 3 / gate 10 / gate 13 系の最新 marker 探索に拾われる

**理由 (PR #88 事故再発防止)**:

marker block を含むコメントを PATCH すると、agent が値を整形する際に意図せず HTML コメント tag を
削ぎ落とす事故が起きる (PR #88 で実例: `updated_at 2026-05-16T12:12:02Z`、64 秒後の PATCH で
`<!-- op-review-meta -->` tag が消失し op-merge gate 3a fail)。
op-merge gate 3 は trusted author の最新 marker block のみを追跡する設計のため、broken 状態を rescue できない。
delete + 新規投稿なら gate は次の有効な marker を捕捉できる。

---

## op-scan: Issue 起票テンプレ (指示書化された context handoff)

Issue は単なる検出報告ではなく、apply agent への **指示書** として書く。
context 喪失問題への対策 (scan の推論・除外仮説・触ってよい範囲が apply agent に伝わる)。

### Issue タイトル

```
[<expert>] <短い要約>
```

例: `[debug-expert] 認証ミドルウェアでセッション破棄が漏れる`

### Issue 本文 (指示書フル版)

```bash
# --label の組み合わせは domain によって変える (二重ラベルパターン参照)。
#   domain = debug / refactor / optimize / test:
#     --label "pro-<expert>-expert" 1 つ
#   domain = security:
#     --label "pro-security-expert" (apply 兼 post-check)、または
#     --label "pro-debug-expert" --label "pro-security-expert" の両方
#     (apply 担当は op-run の判定優先順位 1-8 に従い security-expert または debug-expert を選ぶ)
#   domain = ux-ui:
#     --label "pro-designer-expert" --label "pro-ux-ui-audit-expert" の両方 (apply は designer、post-check は ux-ui-audit)
#   domain = design (UI files に触る):
#     --label "pro-designer-expert" --label "pro-ux-ui-audit-expert" の両方
#   domain = design (UI files に触らない):
#     --label "pro-designer-expert" 1 つ
#   domain = feature:
#     UI 影響なし → --label "pro-feature-expert" 1 つ
#     UI 影響あり → --label "pro-feature-expert" --label "pro-ux-ui-audit-expert" の両方
gh issue create \
  --title "[<expert>] <要約>" \
  --label "auto-report" <domain 別の pro-*-expert ラベル群> --label "severity:<critical|high>" \
  --body "$(cat <<'EOF'
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-source: op-scan -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature | env> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert (canonical schema の recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | env-expert | null>。env-expert は planned のため、値として記録しても op-run は spawn せず post-check を skip / needs_human_decision に倒す。runtime spawn される値は ux-ui-audit-expert / security-expert / null のみ -->
<!-- op-security-requires-aux-post-check: <false | ux-ui-audit-expert>。op-domain == security の Issue でのみ使用。UI / workflow 影響を伴う mitigation を想定する場合 ux-ui-audit-expert を指定し、apply 後の post-check で op-run が ux-ui-audit-expert auxiliary post-check を spawn する判定の hint にする。通常は false で起票し、apply 後の security post-check で実 mitigation 内容を見て確定する -->
<!-- op-refactor-debt-key: refactor:<bulk_group>:<root_path>:<symbol_or_boundary> -->
<!-- op-refactor-debt-key 行は finding_type が architecture_debt / staged_refactor / needs_spec_decision の場合のみ残し、それ以外の finding_type では行ごと削除する。詳細は _shared/dedup-policy.md の architecture_debt 補助 marker 節を参照。 -->
<!-- op-finding-type: <immediate_refactor | staged_refactor | architecture_debt | needs_spec_decision> -->
<!-- op-finding-type 行は domain=refactor の Issue でのみ残し、他 domain では行ごと削除する。op-run dispatcher / gh issue jq からの取り出しに使う。 -->

## 概要
<1〜2文で問題を説明>

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

<!-- 以下の Refactor Execution Control 節は domain=refactor の Issue でのみ埋める。
     他 domain の Issue では本節を省略する。 -->

## 🧱 Refactor Execution Control (domain=refactor 専用)

- finding_type: <immediate_refactor | staged_refactor | architecture_debt | needs_spec_decision>
- execution_mode: <direct_apply | staged_refactor | needs_human_decision>
- direct_apply_safe: <true | false>
- safe_first_step: <この Issue で実行してよい最初の一手 (1〜2 文)>
- proposed_stages:
  1. <stage 1>
  2. <stage 2>
  3. ...
- forbidden_stage_actions:
  - safe_first_step 以外の stage を本 PR 内で実行しない
  - public API / serialized format / DB schema / migration / IPC contract を変更しない
  - Tauri command name / event name / permission name / 実値 (path / key / status / error code / env var) を変更しない
  - file location を移動しない (移動が必要な stage は別 PR)
  - bug fix / performance optimization / feature 実装を混ぜない
- blocking: <true | false>
- blocking_reason: <blocking=true の場合のみ理由を記述、false なら null>
- recommended_followup_experts:
  - <follow-up が必要な expert がある場合のみ列挙、なければ省略>
  - <例: test-expert (既存テスト薄いため回帰テスト整備推奨)>
- affected_paths (architecture_debt / staged_refactor / needs_spec_decision で必須):
  - <path glob 1>
  - <path glob 2>
- architecture_debt メタ (finding_type=architecture_debt の場合のみ):
  - first_detected_at: <YYYY-MM-DD>
  - last_seen_at: <YYYY-MM-DD>
  - seen_count: <整数>
  - risk_trend: <stable | worsening | spreading>
- needs_human_decision (`required: true` の場合のみ block 全体を埋める。
  不要なら block ごと省略):
  - required: <true | false>
  - reason: <なぜ自動判断できないか>
  - decision_type: <scope | risk | behavior | boundary | spec | compatibility | security | design | release | environment | deletion | dependency>
  - options:
    - id: A
      label: <選択肢ラベル>
      consequence: <選ぶと何が起きるか>
    - id: B
      label: <選択肢ラベル>
      consequence: <選ぶと何が起きるか>
  - recommended_option: <A | B | none>
  - safest_default: <判断保留時の安全策>
  - blocked_actions:
    - <この判断なしでは実行しない操作>
  - can_continue_without_decision: <true | false>
  - next_safe_action: <停止せず可能な次の安全行動>
- human_decision_points (refactor 固有の補助。判断点を自然文で 1〜N 件):
  - <判断が必要な決定点 1>
  - <判断が必要な決定点 2>

### 実行ルール (apply agent / refactor-expert)

apply agent (refactor-expert) は本節を **必ず** 読み取り、`finding_type` に従って分岐する:

- **`finding_type=immediate_refactor` かつ `direct_apply_safe=true`**:
  `scope_in` 範囲で recommendation 全体を direct apply してよい (通常の direct apply)
- **`finding_type=immediate_refactor` かつ `direct_apply_safe=false`**:
  着手しない (設定不整合。`needs:triage` で人間判断)
- **`finding_type=staged_refactor` / `architecture_debt`**:
  `safe_first_step` のみ実行する。`proposed_stages` の 2 つ目以降は本 PR で実行しない
  (1 stage = 1 PR を厳守)。**direct apply しない**
- **`finding_type=needs_spec_decision`** または **`needs_human_decision.required=true`**:
  コードを編集しない。`needs_human_decision` block (decision_type / options /
  blocked_actions ほか) と `human_decision_points` を完了報告に構造化返却する

---

## 関連
<関連 Issue / PR / 既知の議論があれば>

---
🤖 op-scan による自動起票
EOF
)"
```

ラベル使用例 (本テンプレで頻出するもののみ。label 名・所有者・semantics の正本は
`skills/_shared/markers/labels-and-markers.md`、merge blocking 効果は `skills/_shared/runtime-contract.md`):

- `auto-report` (op-scan 起票の共通ラベル)
- `pro-<expert>-expert` (担当 expert、必ず `pro-*-expert` 完全形式。短縮形 `pro-debug` 等は不可)
  - 利用可能な完全形式の一覧と各 label の owner / consumer / merge blocking effect は
    `labels-and-markers.md` を参照
  - **`pro-review-expert` は新規付与禁止 (deprecated)**。review 状態の表現は `pro-reviewed` /
    `pro-review-needs-fix` / `pro-review-fix-in-progress` / `pro-review-stale` /
    `pro-review-blocked` 系で行う (詳細 semantics は `labels-and-markers.md`)
- `severity:<level>` (深刻度、必ず `severity:*` 完全形式。旧 `critical` / `high` は読み取り互換のみ)
  - 利用可能 enum と互換扱いの詳細は `labels-and-markers.md` を参照

**domain 別のラベル付与パターン**:
- `domain = ux-ui` (使いやすさ番人 → designer 実装): `pro-ux-ui-audit-expert` (post-check) + `pro-designer-expert` (apply) の両方
- `domain = design` (UI files に触る場合): `pro-designer-expert` (apply) + `pro-ux-ui-audit-expert` (post-check) の両方
- `domain = design` (UI files に触らない非 UI 配置): `pro-designer-expert` (apply) 1 つ
- `domain = security`: 基本は `pro-security-expert` (apply 兼 post-check) 1 つ。op-run の判定優先順位 1-8 で apply を debug-expert に回す場合は `pro-debug-expert` (apply) + `pro-security-expert` (post-check) の両方
- `domain = feature` (UI 影響あり、apply は feature-expert): `pro-feature-expert` (apply) + `pro-ux-ui-audit-expert` (post-check) の両方
- 上記以外 (debug / refactor / optimize / test / UI 影響なし feature): `pro-<expert>-expert` 1 つ

---

## op-scan: バッチ Issue 起票テンプレ (一括削除・命名統一など)

同質な検出が大量に出る場合 (ゴミテスト 14 件、命名違反 30 件等) は
1 検出 1 Issue ではなく **カテゴリ単位で 1 Issue 1 PR** にまとめる。

適用条件:
- 同一 expert + 同一カテゴリの検出が **5 件以上**
- 各検出の修正方針が均質 (削除のみ / 命名置換のみ等)
- ファイル間に強い依存がない (順序実行不要)

### Issue タイトル

```
[<expert>] <カテゴリ> 一括対応 (N 件)
```

例: `[test-expert] ゴミテスト一括削除 (放置 .skip 系 8 件)`

### Issue 本文 (バッチ版)

```bash
# --label の組み合わせは個別 Issue と同じ domain 別二重ラベルパターンに従う
# (上記「op-scan: Issue 起票テンプレ (指示書化された context handoff)」の domain 別ラベル付与パターン参照)。
gh issue create \
  --title "[<expert>] <カテゴリ> 一括対応 (<N> 件)" \
  --label "auto-report" <domain 別の pro-*-expert ラベル群> --label "severity:<critical|high>" --label "batch" \
  --body "$(cat <<'EOF'
<!-- op-fingerprint: <domain>:<bulk_group>:<primary_dir> -->
<!-- op-source: op-scan -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature | env> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert (canonical schema の recommended_runner を転写)> -->
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
| ... | ... | ... | ... |

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
EOF
)"
```

apply 側は 1 PR で全件まとめて処理。コミットは 5〜10 件単位で分けると review しやすい。

---

## op-run: PR open テンプレ

PR 本文は **二層構造** で書く。
上半分は非エンジニア (現場・運用・QA) が読むだけで「何が変わって何を確認すればいいか」が分かる業務視点の説明。
下半分はエンジニア向けの技術詳細 (変更ファイル・安全性・自動検証)。

**「自動検証」と「回帰テスト」を必ず分ける**:
- 自動検証 = `cargo test` / `pnpm test` 等。コードとして壊れていないかの機械的確認。
- 回帰テスト = 現場のいつもの操作・業務シナリオが壊れていないかの観点。

### PR タイトル

```
<業務領域>: <利用者から見える変更> [#<issues>]
```

- 業務領域: 利用者が認識する機能名 (例: `帳票出力` / `検版` / `ジョブ発行` / `ログイン` / `面付` / `PDF入稿`)
- 利用者から見える変更: ファイル名・関数名ではなく、利用者の視点で何が起きるかを 1 行で

例:
- `帳票出力: 保存先エラー時にアプリが落ちないよう修正 [#42]`
- `検版: PDF読込失敗時のエラー表示を改善 [#51]`
- `ジョブ発行: 面付作成時の未入力チェックを追加 [#60]`

業務領域が定まらない (純粋なリファクタ・依存更新等で利用者影響がない) 場合のみ、
旧形式 `<type>(<scope>): <summary> [#<issues>]` (例: `refactor(auth): ヘルパ関数を整理`) を許容する。
その場合も「ひとことで言うと」セクションは省略しない (技術視点でなぜ必要かを書く)。

### PR 本文

```bash
gh pr create --draft \
  --title "<業務領域>: <利用者から見える変更> [#<issues>]" \
  --label "auto-fix" \
  --body "$(cat <<'EOF'
## ひとことで言うと

<非エンジニアにも伝わる 1〜2 文。技術用語を避ける。
例: 帳票出力時に、保存先フォルダが見つからない場合でもアプリが落ちず、
わかりやすいエラーを表示するようにしました。>

## なぜ変更したか

<発生していた困りごと・業務上の不便・事故リスクを業務視点で。
例: 保存先が外付けドライブで未接続のとき、
アプリが強制終了してしまい原因が分からないという報告がありました。>

## 何が変わったか

| 観点 | 内容 |
|------|------|
| 利用者から見える変更 | <画面・操作・表示・出力結果の変化> |
| 裏側の変更 | <非エンジニア向けに短く。例: 保存先チェックの順番を整理しました> |
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

「コードとして壊れていないか」(下記の自動検証) ではなく、
「業務として壊れていないか」を確認するためのチェックリスト。

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
Fixes #45

## 変更内容 (技術詳細)
| ファイル | 変更内容 |
|---------|---------|
| src/auth/login.ts | ... |
| src/auth/session.ts | ... |
| src/auth/middleware.ts | ... |

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

`_shared/project-profile.md` の分類に従い必ず記載する。
これは「コードとして壊れていないか」の機械的確認であり、回帰テスト (上記) とは別物。

| レベル | 結果 | 実行コマンド or skipped 理由 |
|--------|------|----------------------------|
| Static | pass / fail / skipped | <例: cargo fmt --check / cargo clippy> |
| Unit | pass / fail / skipped | <例: cargo test / pnpm test> |
| Build | pass / fail / skipped | <例: pnpm build / cargo build> |
| Integration | pass / fail / skipped | <例: pnpm test:e2e / 環境依存で skipped> |
| Manual required | yes / no | <必要な手動確認の概要> |

Manual required = yes は失格ではない。
環境依存 (InDesign COM / Tauri full build / iOS Android 実機 等) は
skipped + 理由記載で問題ない。

## 残存リスク / follow-up

apply 完了報告の以下のいずれかに値があれば本節に転記する (空なら本節は省略)。

| source | 転記内容 |
|--------|---------|
| `recommended_followup_experts[]` | 各要素 `{expert, reason, scope}` を箇条書き |
| `needs_human_decision` (opt-out で `safe_first_step` のみ実行した PR) | block 全体 (decision_type / options / safest_default / blocked_actions / next_safe_action) を転記。merge 後の判断材料として残す |
| 未解消 `assumptions[]` | 推定で進めた前提と、検証が必要なポイント |
| safe_first_step 中に検出された `blocked_actions[]` 抵触候補 | 次 stage で扱うべき範囲 |

**Issue 自動起票はしない**。本節はレビュアー / ユーザーが merge 後に
op-scan / 手動起票 / 別 stage 着手 を判断するための候補リストとして機能する。
op-run フェーズ4 の review-expert global review は本節を Refactor / Compatibility /
Test / Release lens の確認材料として参照する (詳細は op-run/SKILL.md フェーズ3-1-a)。

例:

```markdown
## 残存リスク / follow-up

- recommended_followup_experts:
  - test-expert: 既存テストが薄いため回帰テスト整備推奨 (follow-up Issue)
- needs_human_decision (opt-out 経路):
  - decision_type: boundary
  - 判断点: report path contract の配置 (TS feature-local / generated single source)
  - safest_default: A (feature-local)
  - blocked_actions: directory move / 実値変更 / contract module 作成
  - 本 PR では inventory のみ実行済み。stage 2 以降は判断後に別 PR
```

## レビュー観点

- <レビュアーに特に見てほしい点>
- <トレードオフや迷った判断>
- <環境依存で未確認の点>

---
🤖 op-run による自動 PR (draft)。レビュー通過後 op-merge で取り込み。
EOF
)"
```

### body 末尾の op-review-state block (位置規約、ADR-0027 6a additive 予告)

上記テンプレの footer (`🤖 op-run による自動 PR (draft)...`) の **後** に、
`<!-- op-review-state -->` marker + JSON fence の state block が置かれうる (ADR-0027、6a 基盤 wave)。
本 block は **機械管理領域**であり、人間 / agent とも手編集しない (state 文書の全置換は
`op pr edit-body` / `op review state push` 経由でのみ行う)。`<!-- op-review-state -->` marker
行そのものも**機械専有**であり、人間 / agent が PR 本文 (説明・コード例・引用) に独立行として
書いてはならない — parse / splice は body 内で最初に出現する marker 行を state block と
みなすため、本文中の偽 marker は state の誤読・誤置換を招く。field 単位の schema の正本は
`skills/_shared/markers/review-markers.md` の「`<!-- op-review-state -->` body block」節
(予告節) および ADR-0027。本節が定めるのは「PR body 上のどこに現れうるか」という位置規約のみ。

ラベル使用例 (label 名・所有者・semantics の正本は `skills/_shared/markers/labels-and-markers.md`、
merge blocking 効果は `skills/_shared/runtime-contract.md`):

- `auto-fix` (op-run 作成の共通ラベル)
- `pro-reviewed` (review 通過後に付与)
- `pro-review-needs-fix` (レビューで修正必要が判明した場合)

### PR 本文の品質要件 (apply agent / reviewer 共通)

**必須**:
- 冒頭に「ひとことで言うと」を置く (非エンジニアにも伝わる 1〜2 文)
- 「なぜ変更したか」「何が変わったか」「変わらないこと」を業務視点で書く
- 利用者から見える変更と、裏側の実装変更を分ける
- 回帰テストで確認すべき業務シナリオをチェックリスト化する
- 自動検証と回帰テストを別セクションとして分けて記載する
- apply 完了報告に `recommended_followup_experts[]` / opt-out 経路の `needs_human_decision` /
  未解消 `assumptions[]` / safe_first_step 中の `blocked_actions[]` 抵触候補がある場合は
  「残存リスク / follow-up」節に必ず転記する (空ならセクション省略可)

**禁止**:
- 「バリデーションを修正」「state を更新」「型を整理」だけで終わる説明
- 変更ファイル一覧だけで業務視点の説明がない PR 本文
- 自動検証コマンドだけで、業務上の確認観点 (回帰テスト) がない PR 本文
- ファイル名・関数名・クラス名のみで何が起きるかを説明する
- 専門用語を業務上の意味に言い換えずそのまま使う

判断基準: 「コードを読まない現場担当者が何を確認すればよいか自力で分かるか?」。不明なら「ひとことで言うと」「回帰テスト」を厚くする。

---

## op-run: review 結果コメント (review-expert)

`review-expert` が **監査専任**で出力する review meta block と finding block を埋め込む PR comment テンプレ。
review-expert はコードを編集・push しない。`needs-fix-applied` 判定は廃止 (op-run が specialist expert に再委任する)。

> **本節は PR comment テンプレ (bash gh HEREDOC) の正本**であり、marker block の field 単位 schema /
> enum 値 / null 許可ルール / Direct Mode と OP-managed Mode の契約 / `review_result` 集約ルール /
> reclassification metadata は **`skills/_shared/markers/review-markers.md` を SSoT とする**。
> 本節以下の bash テンプレ内に marker block が inline 出力として登場するのは実行可能性のためであり、
> 仕様変更は `review-markers.md` 側に反映してから本テンプレを更新する。

`<!-- op-review-meta -->` ヘッダーで `reviewed_head_sha` / `review_round` / `max_review_fix_rounds` /
`global_review_expert` を必ず記録する。op-merge はこの SHA と現在 head を比較し、レビュー後に commit が
積まれていないか検証する。許可される review_round は `1..(max_review_fix_rounds + 1) = 1..3` であり、
最終許可 round (= 3) で `needs-fix` / `needs-specialist-review` が残った場合の自動継続停止 (= blocked) は
op-run (フェーズ4.5-1) が判定する。review-expert 自身は通常通り 4 種の judgment を返す。

field 単位 schema / provenance フィールドの op-merge 必須要件 / `review_round` 通算ルール /
集約ルール / `recommended_fix_expert` null 許可範囲 / Direct Mode 契約 (`<!-- op-review-report -->` /
`<!-- op-review-finding-direct -->`) / reclassification metadata の正本は `review-markers.md` を参照。

### approve コメント (問題なし)

`review_round` は op-run が事前に計算して spawn prompt 経由で渡す (詳細は op-run/SKILL.md フェーズ4 の
review_round 計算節を参照)。テンプレ側は `${REVIEW_ROUND}` を必ず展開する形にし、
**未指定時は `:?` で fail-fast** にする (default で 1 に倒すと Review Fix Loop の round 管理が壊れる)。

```bash
: "${REVIEW_ROUND:?REVIEW_ROUND is required. op-run must export computed review_round before invoking this template.}"
: "${OP_RUN_SESSION_ID:?OP_RUN_SESSION_ID is required in OP-managed mode. op-run controller must export a real session id (not 'unknown').}"
if [ "$OP_RUN_SESSION_ID" = "unknown" ]; then
  echo "❌ OP-managed mode で OP_RUN_SESSION_ID=unknown は許可されません。op-run controller が払い出した値を export してください (op-merge gate 3i 対応)。" >&2
  exit 1
fi
: "${REVIEW_WT_HEAD_SHA:?REVIEW_WT_HEAD_SHA is required in OP-managed mode. op-run must export review worktree HEAD SHA.}"

REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-meta -->
review_result: approve
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## ✅ レビュー結果: 問題なし

review-expert の 7 lens (Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor) で確認済み。

### この変更でどうなるか
<技術用語を避けた 1〜3 文の説明>

### チェック内容
- [x] Security / Abuse: 入力検証・認可・IPC・file IO・shell の攻撃面
- [x] Workflow / UX: 画面遷移・状態復帰・操作破壊・a11y 波及
- [x] Test / Regression: 変更に対する回帰検証
- [x] Compatibility: 保存データ・migration・rollback
- [x] Release: 配布・updater・installer・artifact
- [x] Spec: Issue 要求・acceptance criteria・scope
- [x] Refactor: 構造劣化・命名・配置

### マージ後の確認ポイント
<具体的に動作確認すべき項目>

この結果を受けて、op-run が \`pro-reviewed\` ラベルを付与する想定です。マージ可能な状態です。
(label 操作は op-run の責務。review-expert は label を直接付与・剥奪しない)

---
🤖 review-expert による独立 global review (op-run)
EOF
)"
```

**注意**: HEREDOC は `<<EOF` (`<<'EOF'` ではなく) を使い、`${REVIEWED_SHA}` / `${REVIEW_ROUND}` を展開する。
他の `$` リテラルが必要な場合は `\$` でエスケープすること。

### needs-fix コメント (same-pr 内修正可能 / 単一 expert で完結 / 既知パターン)

3 条件 AND で `needs-fix` を返す。1 つでも欠けるなら `needs-specialist-review` に切り替える。
review-expert は **修正・push しない**。op-run が specialist expert に再委任して修正させる。

```bash
: "${REVIEW_ROUND:?REVIEW_ROUND is required. op-run must export computed review_round before invoking this template.}"
: "${OP_RUN_SESSION_ID:?OP_RUN_SESSION_ID is required in OP-managed mode. op-run controller must export a real session id (not 'unknown').}"
if [ "$OP_RUN_SESSION_ID" = "unknown" ]; then
  echo "❌ OP-managed mode で OP_RUN_SESSION_ID=unknown は許可されません。op-run controller が払い出した値を export してください (op-merge gate 3i 対応)。" >&2
  exit 1
fi
: "${REVIEW_WT_HEAD_SHA:?REVIEW_WT_HEAD_SHA is required in OP-managed mode. op-run must export review worktree HEAD SHA.}"

REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-meta -->
review_result: needs-fix
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## 🔧 レビュー結果: 修正必要 (needs-fix)

3 条件 AND で needs-fix と判定:
- [x] same-pr 内で修正できる
- [x] 単一 expert で完結する
- [x] 既知パターンの修正である

### Findings

<!-- op-review-finding
id: RVW-001
result: needs-fix
severity: high
lens: Workflow / UX
scope: same-pr
recommended_fix_expert: feature-expert
requires_post_check: ux-ui-audit-expert
-->
<問題説明と推奨方針>

この結果を受けて、op-run が \`pro-review-needs-fix\` ラベルを付与し、specialist expert に再委任して修正します
(op-merge 対象外)。label 操作は op-run の責務であり、review-expert は付与・剥奪を行いません。

---
🤖 review-expert による独立 global review (op-run)
EOF
)"
```

### needs-specialist-review コメント (専門判断が必要)

修正方針決定や妥当性判断に specialist 観点が必要な場合。op-run はまず specialist expert に handoff する。

```bash
: "${REVIEW_ROUND:?REVIEW_ROUND is required. op-run must export computed review_round before invoking this template.}"
: "${OP_RUN_SESSION_ID:?OP_RUN_SESSION_ID is required in OP-managed mode. op-run controller must export a real session id (not 'unknown').}"
if [ "$OP_RUN_SESSION_ID" = "unknown" ]; then
  echo "❌ OP-managed mode で OP_RUN_SESSION_ID=unknown は許可されません。op-run controller が払い出した値を export してください (op-merge gate 3i 対応)。" >&2
  exit 1
fi
: "${REVIEW_WT_HEAD_SHA:?REVIEW_WT_HEAD_SHA is required in OP-managed mode. op-run must export review worktree HEAD SHA.}"

REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-meta -->
review_result: needs-specialist-review
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## 🧐 レビュー結果: 専門判断が必要 (needs-specialist-review)

needs-fix 3 条件のいずれかが欠けるため specialist にエスカレート:
- same-pr 可否が不明 / 担当 expert が一意に決まらない / 修正パターンが未知 / 専門判断後でないと修正方針を決められない

### Findings

<!-- op-review-finding
id: RVW-001
result: needs-specialist-review
severity: high
lens: Security / Abuse
scope: same-pr
recommended_fix_expert: security-expert
requires_post_check: security-expert
-->
<問題説明、なぜ specialist 判断が必要か>

この結果を受けて、op-run が \`pro-review-needs-fix\` ラベルを付与し、specialist expert に handoff した後に
再委任します。label 操作は op-run の責務であり、review-expert は付与・剥奪を行いません。

---
🤖 review-expert による独立 global review (op-run)
EOF
)"
```

### blocked コメント (自動継続不能)

scope_out / 人間判断必要 / loop 上限超過 / Issue 再設計が必要な場合。

```bash
: "${REVIEW_ROUND:?REVIEW_ROUND is required. op-run must export computed review_round before invoking this template.}"
: "${OP_RUN_SESSION_ID:?OP_RUN_SESSION_ID is required in OP-managed mode. op-run controller must export a real session id (not 'unknown').}"
if [ "$OP_RUN_SESSION_ID" = "unknown" ]; then
  echo "❌ OP-managed mode で OP_RUN_SESSION_ID=unknown は許可されません。op-run controller が払い出した値を export してください (op-merge gate 3i 対応)。" >&2
  exit 1
fi
: "${REVIEW_WT_HEAD_SHA:?REVIEW_WT_HEAD_SHA is required in OP-managed mode. op-run must export review worktree HEAD SHA.}"

REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-meta -->
review_result: blocked
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## ⛔ レビュー結果: blocked (自動継続不能)

理由: <scope_out 違反 / 人間判断必要 / loop 上限超過 / Issue 再設計必要 のいずれか>

### Findings

<!-- op-review-finding
id: RVW-001
result: blocked
severity: critical
lens: Spec
scope: blocked
recommended_fix_expert: null
requires_post_check: null
-->
<問題説明と推奨対応 (Issue 分割 / 別 Issue 化 / 人間判断点)>

この結果を受けて、op-run が \`pro-review-blocked\` ラベルを付与する想定です。op-run は自動継続せず、人間判断待ちです。
(label 操作は op-run の責務。review-expert は label を直接付与・剥奪しない)

---
🤖 review-expert による独立 global review (op-run)
EOF
)"
```

---

## op-run: specialist 判断結果コメント (specialist expert)

`needs-specialist-review` finding を受けた specialist expert (security-expert / debug-expert /
designer-expert / feature-expert / test-expert など、active expert のみ。planned expert
(release-expert / compatibility-expert / env-expert) は specialist 候補にしない。`spec-expert` は
active だが op-spec 専用 Utility Worker のため同じく specialist 候補にしない。
詳細は `skills/_shared/runtime-contract.md`) が **修正の前段で** 出す判断結果コメントの bash テンプレ。
specialist は finding の妥当性 / 影響範囲 / 修正方針 / same-pr 可否を判断するだけで、原則 **直接修正はしない**
(必要なら apply は op-run が再決定して別 spawn する)。

これは Review Fix Loop の自動分岐を自然文依存にしないための machine-readable 契約。
op-run は本 block を読み取り、フェーズ4.5-2 の判定優先順位 1-8 に handoff する。

> **本節は PR comment テンプレ (bash gh HEREDOC) の正本**であり、`<!-- op-specialist-review-meta -->`
> block の field 単位 schema / 必須要件 / `specialist_result` enum の意味 / `recommended_apply_expert`
> の null 許可ルール / apply target に指定不可の expert は **`skills/_shared/markers/review-markers.md` を SSoT** とする。
> 仕様変更は `review-markers.md` 側に反映してから本テンプレを更新する。

### コメント例 (security-expert handoff の場合)

```bash
gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-specialist-review-meta -->
source_finding_id: RVW-002
specialist: security-expert
specialist_result: same-pr-fixable
recommended_apply_expert: feature-expert
requires_post_check: security-expert
reviewed_round: 1
reviewed_at: $(date -Iseconds)
reason: 入力検証は同 PR 内 src-tauri/src/export.rs に追加すれば閉じる。capability 変更は不要、新たな攻撃面は生まない。

## 🧐 specialist 判断結果

review-expert finding RVW-002 (path traversal の入力検証不足) を security 観点で再点検。
same-pr-fixable と判断。修正は feature-expert に再委任、修正後に security-expert で再 post-check。
EOF
)"
```

### 注意点

- 本 block は **specialist expert が出す** (review-expert / op-run が代理出力しない)
- 1 PR コメントに 1 個。複数 finding を同時に handoff したい場合はコメントを分ける
  (1 finding = 1 specialist judgment block を保つ)
- `recommended_apply_expert` に `review-expert` / `ux-ui-audit-expert` を指定してはいけない
  (前者は監査専任 / 後者は検出 + post-check 専任、いずれも apply target ではない)
- specialist が **修正までその場で行ってよい** ケース (= apply 権限を持つ expert が specialist を兼ねたケース) でも、
  本 block は **判断の根拠記録として必ず残す**。apply 結果は通常の commit / PR 進行で表現する

---

## op-architect / op-run: Design Plan (designer-expert 出力)

`designer-expert` が op-architect の Architect Mode で出力する Design Plan のテンプレ。
op-architect は Issue 本文または関連コメントに添付して保存し、op-run の apply フェーズで designer-expert が
これを読み込んで実装する。詳細は `~/.claude/agents/designer-expert.md` の Architect Mode 節参照。

```markdown
## Design Plan

### User Goal
ユーザーがこの画面で達成したい目的 (1〜2 文)。

### Current UX/UI Problem
現在の破綻点 (Issue で指摘されている UX/UI 問題)。

### Design Intent
なぜこの修正が必要か / 設計上の狙い (1〜3 文)。

### Components to Use
- 既存 `<Button variant="primary">` (frontend/src/components/Button.vue)
- 既存 `<Dialog>` (frontend/src/components/Dialog.vue)
- 既存 `<FormField>` (frontend/src/components/forms/FormField.vue)
- 既存 `<Toast>` (frontend/src/composables/useToast.ts)

### Tokens to Use
- `color.semantic.error` / `color.semantic.success`
- `spacing.4` / `spacing.6` / `spacing.8`
- `radius.md` / `radius.lg`
- `typography.body.regular` / `typography.title.lg`

### Applicable States
この画面 / 操作に該当する state のみ設計・実装する。
**6 状態を機械的に全列挙してはいけない。** UI 種別ごとに該当する state だけ書き、該当しない state は省略するか
`not_applicable_reason` を 1 行添える (静的表示画面で empty を持たない理由など)。

UI 種別ごとの典型 applicable state (起点。実画面に応じて取捨する):

| UI 種別 | 必須 state |
|--------|-----------|
| 非同期データ取得 (一覧 / 詳細) | loading / failure / empty / focus |
| フォーム送信 | loading / success または遷移 / failure / disabled / focus |
| 破壊操作 (削除等) | confirmation または undo / success / failure / focus |
| modal / drawer | focus / keyboard / Esc close / failure (async 時) |
| 静的表示 (説明 / about / 法務文書) | focus / heading / contrast |
| toast / inline message | success / failure (toast 自体は state を多く持たない) |

Plan には該当 state ごとに「何を表示するか」「何を許可するか」を 1 行ずつ書く。
例:
- loading: skeleton + 二重送信防止 (button disabled)
- failure: 原因 + retry button + 戻る導線
- empty: 「タスクがまだありません」+ 「+ 新規作成」ボタン
- focus: `:focus-visible` で 3:1 以上の contrast ring

### Layout Strategy
情報階層 / 余白 / 配置の方針 (3〜5 行)。

### Accessibility Requirements
- focus visible
- keyboard reachable (`<button>` 要素を使用、`@click` を `<div>` に付けない)
- error association (`aria-describedby` で field と error を結ぶ)
- contrast 4.5:1 以上 (本文)、3:1 以上 (非テキスト UI)
- icon に必ず `aria-label` または隣接テキスト

### Motion Strategy (motion を使う画面のみ)
状態遷移・micro-interaction に動きを付ける画面に限り記載する (静的画面は省略)。
詳細規約は `expert-design/references/motion-patterns.md`。
- Design Intent: なぜ動かすか (どの状態変化の因果を伝えるか、1〜2 文)
- 採用 pattern: <enter-leave / slide / expand-collapse / state-feedback / list-stagger 等> / Tier: ①② (token 適用で完成) または ③④ (仕様のみ・human polish 要・design spike 候補)
- 使用 motion token: duration `--motion-duration-*` / easing `--motion-ease-*` (生値直書き禁止。不在なら foundation 役が正規化追加、per-feature 役は参照のみ)
- 性能: animate は `transform` / `opacity` のみ (layout-triggering プロパティ不使用)
- Reduced Motion (必須): `prefers-reduced-motion: reduce` 時の挙動 (完全停止 / fade のみ残す)。状態変化の結果は reduced でも伝わること
- Verification (human 確認、③④ は必須): timing の自然さ / easing 方向感 / 反復使用での鬱陶しさ / (③④) Storybook・draft PR での候補比較要否

### Implementation Boundaries
- 変更してよい範囲: <files>
- 触らない範囲: <files / 領域>

### Verification
- 確認すべき画面状態: loading / success / failure / empty
- 操作: keyboard / マウス / screen reader
- 回帰観点: 既存 Toast / Dialog / ナビゲーションへの影響
```

Issue 本文に埋め込む場合は、`## 🎨 Design Plan` 節として `## 🤖 apply agent への指示書` の直後に挟む。
これにより op-run の designer-expert が apply 時に確実に参照できる。

---

## op-architect: UX/UI Audit Gate Result (ux-ui-audit-expert 出力)

`ux-ui-audit-expert` が op-architect の Design Plan を gate した結果のテンプレ。
判定は PASS / PASS_WITH_NOTES / BLOCK の 3 択。詳細は `~/.claude/agents/ux-ui-audit-expert.md` の gate モード節参照。

> **本節は markdown / bash テンプレ (出力本文) の正本**。`<!-- op-ux-ui-gate -->` block の field 単位 schema /
> enum 値 / 6 観点 (+ motion 時 観点7) の判定基準 / Design Plan gate 段階の制約は **`skills/_shared/markers/ux-ui-markers.md` を SSoT とする**。
> 仕様変更は `ux-ui-markers.md` 側に反映してから本テンプレを更新する。

**冒頭に machine-readable header `<!-- op-ux-ui-gate -->` を必ず置く。** op-architect / op-run はこのヘッダーから
audit_result / blocking_count / notes_count を直接 parse する (Markdown 走査では脆い)。

司令官 (op-architect) は判定に応じて:
- PASS: そのまま op-run に渡す Issue 本文に Design Plan を確定埋め込み
- PASS_WITH_NOTES: Notes を Issue 本文の `## 🎨 Design Plan` 節末尾に追記してから確定
- BLOCK: designer-expert に Required Changes を渡して Design Plan を再作成させる (3 回 BLOCK 続いたら人間判断)

```markdown
<!-- op-ux-ui-gate -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
auditor: ux-ui-audit-expert
audited_at: <ISO8601>
blocking_count: <BLOCK 時に挙げた Required Changes の件数 (0 なら 0)>
notes_count: <PASS_WITH_NOTES 時に挙げた Notes の件数 (0 なら 0)>

## UX/UI Audit Gate Result

### 判定
PASS | PASS_WITH_NOTES | BLOCK

### 評価サマリ
<2〜4 文で全体評価>

### 観点別チェック
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | 次の行動が明確 | OK / NG | <NG なら理由> |
| 2 | Applicable States 網羅 (UI 種別ごとに該当する state) | OK / NG | <NG なら欠落 state + 該当しない state は not_applicable_reason> |
| 3 | エラー復帰導線 | OK / NG | <NG なら不足箇所> |
| 4 | 業務フロー整合 | OK / NG | <NG なら矛盾点> |
| 5 | accessibility (focus / aria / contrast) | OK / NG | <NG なら不足要件> |
| 6 | 見た目偏重でない | OK / NG | <NG なら指摘> |
| 7 | motion 安全性 (Motion Strategy 節がある場合のみ) | OK / NG / N/A | <N/A=motion 節なし / NG なら Static Hard blocker> |

### Notes (PASS_WITH_NOTES 時)
- 実装時に追加で意識してほしい注意点を箇条書き

### Required Changes (BLOCK 時)
- Design Plan に追加すべき項目 / 修正すべき設計を箇条書き
```

> **観点7 (motion) は conditional**: Design Plan に `### Motion Strategy` 節がある場合のみ評価する additive 観点 (ADR-0012 Wave4)。
> motion 節が無ければ N/A (行ごと省略可)。判定基準は `ux-ui-markers.md` / `gate-criteria.md` の観点7 を参照。

> **Applicable States の判定**: UI 種別 (フォーム / 一覧 / modal / 静的表示等) ごとに必要な state は異なる。
> 機械的に loading/success/failure/empty/disabled/focus すべてを必須とすると、過剰実装で BLOCK されやすくなる。
> Plan で該当しない state を「not_applicable_reason」付きで省略していれば OK。
> 詳細は `~/.claude/skills/expert-ux-ui-audit/references/recovery-and-states.md` を参照。

---

## op-run: UX/UI Post-check Result (ux-ui-audit-expert 出力)

designer-expert が op-run の apply で実装を完了し PR を draft で open した直後に、
ux-ui-audit-expert が PR diff を独立に audit した結果のテンプレ。判定は同じく PASS / PASS_WITH_NOTES / BLOCK。

> **本節は bash テンプレ (PR comment HEREDOC) の正本**。`<!-- op-ux-ui-audit -->` + `<!-- op-post-check-meta -->`
> block の field 単位 schema / 7 観点の判定基準 / `audit_result` ↔ `post_check_result` 対応 / 司令官の動作分岐は
> **`skills/_shared/markers/ux-ui-markers.md` を SSoT** とする。共通 post-check meta フィールド
> (`audit_result` / `post_check_expert` / `post_check_result` / `post_checked_head_sha` / `post_check_round`) は
> **`skills/_shared/markers/post-check-markers.md (>=2)` を SSoT** とする。
> 仕様変更は領域別 `*-markers.md` 側に反映してから本テンプレを更新する。

司令官 (op-run) は判定に応じて:
- PASS: review-expert global review (フェーズ4) に進める
- PASS_WITH_NOTES: PR コメントに Notes を残してから review-expert global review に進める
- BLOCK: review-expert global review を呼ばず、**該当クラスタの op-run-expert に戻して** Required Changes を実装させる。
  戻し先は `op-run-expert` (= apply 担当) であり、designer-expert に固定されない:
    - op-run-expert = `designer-expert` → designer-expert に戻す
    - op-run-expert = `feature-expert` (UI 影響あり feature) → feature-expert に戻す
  (`pro-review-needs-fix` 相当のフロー、詳細は op-run/SKILL.md フェーズ 3.5 参照)

post-check 結果は PR コメントとして投稿し、`<!-- op-ux-ui-audit -->` ヘッダーで識別する。
gate と同じく machine-readable header に audit_result / blocking_count / notes_count を必ず含める。
**さらに `<!-- op-post-check-meta -->` block で `post_checked_head_sha` / `post_check_round` /
`post_check_expert` を必ず記録する**。op-merge はこの SHA と現在 head を比較して post-check stale 判定する
(security post-check と同形式に揃える)。

```bash
POST_CHECK_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-ux-ui-audit -->
<!-- op-post-check-meta -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
audited_at: $(date -Iseconds)
auditor: ux-ui-audit-expert
post_check_expert: ux-ui-audit-expert
post_check_result: pass | pass_with_notes | block
post_checked_head_sha: ${POST_CHECK_SHA}
post_check_round: 1
blocking_count: <BLOCK 時の Required Changes 件数 (0 なら 0)>
notes_count: <PASS_WITH_NOTES 時の Notes 件数 (0 なら 0)>

## UX/UI Post-check Result

### 判定
PASS | PASS_WITH_NOTES | BLOCK

### 評価サマリ
<2〜4 文で全体評価>

### 観点別チェック
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | Design Plan と実装差分が一致 | OK / NG | <NG なら逸脱箇所> |
| 2 | Applicable States の実装 (UI 種別ごとに該当する state) | OK / NG | <NG なら欠落 state + 該当ファイル / 該当しない state は not_applicable_reason> |
| 3 | error / loading の実装 (該当する場合) | OK / NG | <NG なら不足箇所 + 該当ファイル> |
| 4 | keyboard / focus の保持 | OK / NG | <NG なら回帰内容> |
| 5 | 操作のわかりやすさ (クリック数 / 戻る導線) | OK / NG | <NG なら劣化点> |
| 6 | Issue 範囲外 redesign の混入 | OK / NG | <NG なら scope_out 違反箇所> |
| 7 | style 変更による UX / a11y 退化 | OK / NG | <NG なら退化箇所 (focus / contrast / keyboard / state visibility 破壊。hard-coded style / token bypass そのものは designer-expert の post-check 領域)> |

### Notes (PASS_WITH_NOTES 時)
- レビュアー (review-expert) に伝えたい軽微な観点を箇条書き

### Required Changes (BLOCK 時)
- 実装で追加すべきコード / 修正すべき差分を具体的に記述
- 例: \`features/job-board/JobList.vue\` に EmptyState コンポーネントを追加
EOF
)"
```

**注意**: HEREDOC は `<<EOF` (`<<'EOF'` ではなく) を使い、`${POST_CHECK_SHA}` と `$(date -Iseconds)` を
展開する。本文中のバッククォート (`code`) は `\`` でエスケープして command substitution を避けること
(security post-check と同じ方式)。

`<!-- op-ux-ui-audit -->` マーカーで始まるコメントは op-run / op-merge から検索可能。
op-run はこのコメントを見て、BLOCK なら apply 担当 expert (designer-expert または feature-expert、すなわち該当クラスタの op-run-expert) を再 spawn する。

---

## op-run: Security Post-check Result (security-expert 出力)

apply 担当 expert (security-expert または debug-expert) が op-run の apply で security domain Issue を実装し
PR を draft で open した直後に、security-expert が PR diff を独立に **issue 固有再監査** する結果のテンプレ。
判定は PASS / PASS_WITH_NOTES / BLOCK。

> **本節は bash テンプレ (PR comment HEREDOC) の正本**。`<!-- op-security-post-check -->` +
> `<!-- op-post-check-meta -->` block の field 単位 schema / `security_result` / `finding_resolved` /
> usable_security 系 (`workflow_preservation_result` / `legitimate_workflow_preserved` / `ux_impact` /
> `affected_user_capability`) / aux post-check 連携 (`requires_aux_post_check` / `aux_post_check_status` 状態遷移) /
> `post_check_result == needs_human_decision` の使用条件 / 8 観点 semantics は
> **`skills/_shared/markers/security-markers.md` を SSoT** とする。共通 post-check meta フィールドは
> **`skills/_shared/markers/post-check-markers.md (>=2)` を SSoT** とする。
> 仕様変更は領域別 `*-markers.md` 側に反映してから本テンプレを更新する。

> **post_check と global review の概念分離**:
> - 本テンプレ (3.5-B) は **元 finding が解消されたか / 修正で別の攻撃面が増えていないか** の security 深掘り再監査 (specialist 鑑識)
> - フェーズ4 の global review は review-expert が PR 全体を 7 lens (Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor) で横断確認する別工程
> - 3.5-B が PASS / PASS_WITH_NOTES を返した PR では、フェーズ4 は Security/Abuse Lens を「PR 全体の新たな攻撃面のみ軽く」に切り替える (重複監査回避)

司令官 (op-run) は判定に応じて:
- PASS: フェーズ4 (review-expert global review) に軽量モードで進める
- PASS_WITH_NOTES: Notes は post-check コメントに既に残っているので、フェーズ4 にそのまま進める
- BLOCK: フェーズ4 を呼ばず、`pro-security-needs-fix` ラベルを PR に付与。op-run の判定優先順位 1-8 で apply 担当 expert (security-expert または debug-expert) を再 spawn して Required Changes を実装させる
  (詳細は op-run/SKILL.md フェーズ 3.5-B 参照)

post-check 結果は PR コメントとして投稿し、`<!-- op-security-post-check -->` ヘッダーで識別する。
machine-readable header に audit_result / audited_at / auditor / blocking_count / notes_count / post_checked_head_sha / post_check_round を必ず含める。
**さらに security-expert 固有の usable_security / threat_model / aux post-check 状態フィールドを必ず含める** (op-merge gate と auxiliary post-check 連携に必要)。

```bash
POST_CHECK_SHA=$(git rev-parse HEAD)
POST_CHECK_ROUND="${POST_CHECK_ROUND:-1}"

# security mitigation が UI / workflow に影響する場合
REQUIRES_AUX="${REQUIRES_AUX:-false}"        # true | false
AUX_EXPERTS="${AUX_EXPERTS:-none}"            # CSV (e.g. "ux-ui-audit-expert") | "none"
AUX_REASON="${AUX_REASON:-}"                  # 短い理由 | empty
AUX_STATUS="${AUX_STATUS:-not_required}"      # not_required | required_pending | pass | block | skipped | stale

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-security-post-check -->
<!-- op-post-check-meta -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
audited_at: $(date -Iseconds)
auditor: security-expert
post_check_expert: security-expert
post_check_result: pass | pass_with_notes | block | needs_human_decision
post_checked_head_sha: ${POST_CHECK_SHA}
post_check_round: ${POST_CHECK_ROUND}
blocking_count: <BLOCK 時の Required Changes 件数 (0 なら 0)>
notes_count: <PASS_WITH_NOTES 時の Notes 件数 (0 なら 0)>

security_result: pass | block
finding_resolved: true | false
new_attack_surface_introduced: true | false
scope_out_violation: true | false
secret_or_path_leak_detected: true | false

workflow_preservation_result: pass | block | not_applicable
legitimate_workflow_preserved: true | false
ux_impact: none | low | medium | high
affected_user_capability: <CSV (例: save_as,open_file,export)>

requires_aux_post_check: ${REQUIRES_AUX}
aux_post_check_experts: ${AUX_EXPERTS}
aux_post_check_reason: ${AUX_REASON}
aux_post_check_status: ${AUX_STATUS}
<!-- /op-post-check-meta -->

## Security Post-check Result

### 判定
PASS | PASS_WITH_NOTES | BLOCK | NEEDS_HUMAN_DECISION

### 評価サマリ
<2〜4 文で全体評価>

### 観点別チェック (8 観点)
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | 元 finding の解消 (Issue success_criteria 達成) | OK / NG | <NG なら未解消の挙動 + 該当ファイル> |
| 2 | 修正で別の攻撃面が増えていないか | OK / NG | <NG なら新規攻撃面 + 該当行> |
| 3 | 入力検証 (path / encoding / canonicalization / size limit) | OK / NG | <NG なら検証漏れ + 該当箇所> |
| 4 | 認可 / capability の境界 (IPC / shell / file IO) | OK / NG | <NG なら境界違反 + 該当箇所> |
| 5 | エラーパスでの情報漏洩 / 失敗時挙動 (TOCTOU / privilege drop) | OK / NG | <NG なら漏洩経路 + 該当箇所> |
| 6 | Issue scope_out 違反 (redesign の混入) | OK / NG | <NG なら scope_out 違反箇所> |
| 7 | 正当なユーザー操作維持 (legitimate_workflow_preserved) | OK / NG | <NG なら capability 削除 / 出力先固定 / UI 削除> |
| 8 | UX/UI auxiliary post-check 必要性 | NO / YES | <YES なら trigger_reason、ux-ui-audit-expert post-check が追加実行される> |

### Notes (PASS_WITH_NOTES 時)
- フェーズ4 review-expert に伝えたい軽微な観点を箇条書き

### Required Changes (BLOCK 時)
- 実装で追加すべきコード / 修正すべき差分を具体的に記述
- 例: \`src-tauri/src/commands/export.rs:export_report\` の path canonicalization に \`..\` rejection を追加

### Needs Human Decision (NEEDS_HUMAN_DECISION 時)
- security risk と usable workflow のトレードオフが高く自動判断不能な場合
- needs_human_decision YAML block を本文に埋め込む (`_shared/invocation-mode.md` の正規 schema)
EOF
)"
```

`post_check_result` enum (4 値) と `aux_post_check_status` 状態遷移 (`not_required` / `required_pending` /
`pass` / `block` / `skipped` / `stale`) の semantics は `skills/_shared/markers/security-markers.md` を SSoT とする。

`<!-- op-security-post-check -->` マーカーで始まるコメントは op-run / op-merge から検索可能。
op-run はこのコメントを見て、BLOCK なら apply 担当 expert (security-expert または debug-expert) を再 spawn する。
op-merge は本テンプレの audit_result が PASS / PASS_WITH_NOTES でないと、また `post_checked_head_sha` と
現在 head が一致していない (post-check stale) と security 影響 PR をマージしない (gate は op-merge/SKILL.md 参照)。

---

## op-run: post-check meta block (head sha 管理用)

UX/UI / Security 以外の post-check や、複数 post-check が同じ PR にぶら下がる場合は、
post-check 結果コメントに `<!-- op-post-check-meta -->` block を必ず含める。
op-merge はこの block の `post_checked_head_sha` で stale 判定する。

> **本節は inline 利用例の正本**。`<!-- op-post-check-meta -->` block の field 単位 schema /
> enum 値 / 複数 post-check の共存ルール / op-merge gate の SHA 一致要件 / planned post-check skip 連携は
> **`skills/_shared/markers/post-check-markers.md (>=2)` を SSoT** とする。
> 仕様変更は `post-check-markers.md` 側に反映してから本テンプレを更新する。

```
<!-- op-post-check-meta -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
post_check_expert: ux-ui-audit-expert | security-expert | <その他 active expert>
post_check_result: pass | pass_with_notes | block | needs_human_decision
post_checked_head_sha: <sha>
post_check_round: <1, 2, ...>
```

`audit_result` (UPPER CASE, human-readable) と `post_check_result` (lower_case, machine-readable) は
必ず整合させる。許容対応表は `skills/_shared/markers/post-check-markers.md (>=2)` を参照。

複数 post-check の場合、expert ごとに 1 block を持たせる (重複可)。
op-merge は **すべての required post-check が current head sha に対して `pass` または `pass_with_notes`**
のときだけマージを許可する。

---

## op-merge: manual override block (post-check skip / BLOCK 例外運用)

UI 影響 PR (gate 12〜13) または security 影響 PR (gate 15〜16) で post-check が
skipped または BLOCK のままマージする例外運用を行う場合、人間が以下の block を PR コメントに残す。
op-merge は対応する manual-override ラベル + この block の **両方が揃った場合のみ** gate を skip する。
ラベルだけでは認めない (理由 / 承認者 / follow-up Issue が記録されないため)。
さらに `reviewed_head_sha` は **override 承認時の PR head SHA**。op-merge gate ではこの SHA と
現在の PR head SHA を照合し、override 後に新 commit が追加された stale 状態を検出する。

> **本節は markdown テンプレ (PR comment 本文) の正本**。`<!-- op-manual-override -->` block の field 単位
> schema / 必須要件 / `override_target` enum / validation rule / 監査追跡ポリシー / 常用禁止条項は
> **`skills/_shared/markers/merge-gate-markers.md` (>=2) を SSoT** とする。
> 仕様変更は `merge-gate-markers.md` 側に反映してから本テンプレを更新する。

UX/UI 影響 PR の override sample (`pro-ux-ui-audit-manual-override`):

```markdown
<!-- op-manual-override
override_target: pro-ux-ui-audit-manual-override
approver: <GitHub handle>
reason: <なぜ post-check skip / BLOCK のままマージしたか。緊急性の根拠を含める>
followup_issue: #<N>
overridden_at: <ISO8601 timestamp>
reviewed_head_sha: <40 hex SHA>
-->
```

security 影響 PR の override sample (`pro-security-post-check-manual-override`):

```markdown
<!-- op-manual-override
override_target: pro-security-post-check-manual-override
approver: <GitHub handle>
reason: <なぜ post-check skip / BLOCK のままマージしたか。緊急性の根拠を含める>
followup_issue: #<N>
overridden_at: <ISO8601 timestamp>
reviewed_head_sha: <40 hex SHA>
-->
```

各フィールドの責務 (詳細な validation rule / 監査追跡ポリシーは `merge-gate-markers.md` (>=2) を参照):

| フィールド | 必須 | 内容 |
|-----------|-----|------|
| override_target | ✓ | どのラベルの override を意味するか。`pro-ux-ui-audit-manual-override` または `pro-security-post-check-manual-override` |
| approver | ✓ | override を承認した人間の GitHub handle (`@username` 形式または bare username) |
| reason | ✓ | override の根拠。緊急対応 / hotfix / 検証 PR 等の状況説明 |
| followup_issue | ✓ | override 後の再 audit / 是正を追跡する Issue 番号。security override の場合は `security-expert` (Phase 2) 実装後の再 post-check を必ず予約 |
| overridden_at | ✓ | ISO8601 タイムスタンプ (例: `2026-05-05T14:23:00+09:00`) |
| reviewed_head_sha | ✓ | override 承認時の PR head SHA (40 hex)。op-merge gate がこの SHA と現在の PR head SHA を照合し、override 後に新 commit が積まれた stale 状態を検出する |

op-merge は block 不在時、または block 内 `reviewed_head_sha` が現 PR head SHA と不一致の場合に
manual-override ラベルを「無効」とみなし、gate 12〜13 / 15〜16 / 18 を中断扱いにする。
これにより override は常に追跡可能・監査可能・最新 commit に対する明示承認である状態で残り、
silent な常用化と stale override の再利用を構造的に防ぐ。

---

## Needs Human Decision (構造化された人間判断要求)

OP-managed Mode の expert が人間判断を必要とする場合は、**質問テキストではなく以下の YAML block** で返す。
expert は質問で停止せず、commander / OP skill が必要に応じて Issue コメント / label / user prompt に変換する。

詳細 schema・mode 判定・禁止フレーズの正規仕様は `_shared/invocation-mode.md` を SSoT として参照する。
本ドキュメントは Issue / PR / review / post-check テンプレに **そのまま埋め込んで使える表記** を提供する。

### 使う場面

- expert の scan finding に判断が必要な項目がある場合 (canonical schema の他フィールドと並べて返す)
- apply agent が scope 外への踏み込みを検出した場合
- review-expert の finding を `<!-- op-review-finding -->` と一緒に出す場合 (recommended_fix_expert が一意に決まらないなど)
- post-check が PASS_WITH_NOTES / BLOCK のとき、対処方針が複数ある場合
- delete / push / install / 依存追加・削除など destructive 系で判断不能な場合

### 標準テンプレ (YAML, 完了報告 / Issue / PR コメント内に埋め込む)

```yaml
needs_human_decision:
  required: false
  reason: ""
  decision_type: "scope | risk | behavior | boundary | spec | compatibility | security | design | release | environment | deletion | dependency"
  options: []
  recommended_option: "none"
  safest_default: ""
  blocked_actions: []
  can_continue_without_decision: true
  next_safe_action: ""
```

### フィールド早見表

| フィールド | 必須 | 意味 |
|-----------|-----|------|
| `required` | ✓ | 人間判断が要るかどうか。要らないなら block ごと省略可 |
| `reason` | ✓ | なぜ自動判断できないのか (例: scope_in 外への踏み込みが必要 / spec が複数解釈可能) |
| `decision_type` | ✓ | 判断種別。dispatcher / Issue 化時のラベルに使う (12 値の enum: scope / risk / behavior / boundary / spec / compatibility / security / design / release / environment / deletion / dependency) |
| `options[]` | ✓ | 最低 2 つ。各要素は `id` (短縮) / `label` / `consequence` を持つ |
| `recommended_option` | ✓ | expert の推奨。判断保留なら `none` |
| `safest_default` | ✓ | commander が即時に決められない場合に取る既定値 |
| `blocked_actions[]` | ✓ | 判断なしでは絶対に実行しない操作 (push / delete 等) |
| `can_continue_without_decision` | ✓ | true なら他の安全な作業は続行可、false なら全停止 |
| `next_safe_action` | ✓ | 続行可能な場合に取る次の行動 (停止と区別する) |

### 出力例 (scope 判断)

```yaml
needs_human_decision:
  required: true
  reason: "Issue scope_in 外で silent fork 候補が見つかった。同 PR で扱うか別 Issue 化するか自動判断できない"
  decision_type: "scope"
  options:
    - id: "A"
      label: "現 Issue の scope_in に追加して同 PR で修正"
      consequence: "PR が広がるが silent fork が一括解消する"
    - id: "B"
      label: "別 Issue として後追いで起票"
      consequence: "現 PR は予定どおり閉じる、追加検出は別タスク化"
  recommended_option: "B"
  safest_default: "B"
  blocked_actions:
    - "scope_in 外のファイル編集"
  can_continue_without_decision: true
  next_safe_action: "Issue scope_in 内の元の修正のみ完了させ、報告に candidate finding を記録"
```

### 出力例 (deletion 判断, test-expert)

```yaml
needs_human_decision:
  required: true
  reason: "delete 専用 Issue だが、quarantine 観察期間が完了しているか CI ログから確定できない"
  decision_type: "deletion"
  options:
    - id: "A"
      label: "観察期間完了として物理削除"
      consequence: "テストが永久に消える。代替カバレッジが薄ければ regression を見逃す"
    - id: "B"
      label: "観察期間延長 (quarantine 維持)"
      consequence: "削除を見送り、別 PR で再判定"
  recommended_option: "B"
  safest_default: "B"
  blocked_actions:
    - "対象テストファイルの物理削除"
  can_continue_without_decision: false
  next_safe_action: "完了報告に blocked として記録し、commit せず終了"
```

### 互換性 (deprecated alias)

旧フィールド名 `needs_human_judgment: true / false` は **deprecated alias**。
- 新規テンプレート / 新規記述では必ず `needs_human_decision` を使う
- 既存出力 (open Issue / 過去 PR コメント) との読み取り互換のため当面は受理する
- 両者が併存する場合は `needs_human_decision` を優先

### 質問テキストとの違い (重要)

OP-managed Mode の expert は以下を **やらない**:

| 旧 (禁止) | 新 (構造化返却) |
|----------|---------------|
| 「Issue コメントで質問してください」 | `needs_human_decision.reason` に書き、commander が必要なら Issue コメント化 |
| 「ユーザーに判断を仰ぐ」 | `decision_type` + `options` + `recommended_option` で判断材料を構造化 |
| 「回答があるまで停止」 | `can_continue_without_decision: false` を明記。停止理由は `blocked_actions` に列挙 |
| 「対話モードに回す」 | `manual_review_bucket` (`auto-policy.md`) または `needs_human_decision` |

詳細・mode 判定・禁止フレーズ完全リストは `_shared/invocation-mode.md` を参照。

---

## op-merge: マージコミットメッセージ

squash merge のデフォルトメッセージ:

```
<type>(<scope>): <summary> (#<pr-number>)

<PR 本文の「変更概要」セクションをそのまま貼り付け>

Fixes #42
Fixes #43
Fixes #45

🤖 op-merge による取り込み
Co-Authored-By: <expert-agent-name>
```

---

## ラベルカタログ (pointer)

op-* スキル群が使う label の **正本は `skills/_shared/markers/labels-and-markers.md`**。
本節はもはや label name inventory / label semantics / merge blocking effect の正本ではない。

ここでは、本ファイル内の template / 例で参照される label を「テンプレ読解の利便のため」だけに
カテゴリ別に **名前列挙** で列挙する。色・所有者・consumer・merge blocking effect の正規定義および
deprecated / 互換 label の取り扱いは **すべて `labels-and-markers.md` を参照すること**
(本ファイルと矛盾した場合は `labels-and-markers.md` が勝つ)。

### Active PR review state labels (本ファイル内テンプレで参照)

- `pro-reviewed` / `pro-review-needs-fix` / `pro-review-fix-in-progress` /
  `pro-review-stale` / `pro-review-blocked`

### Active post-check labels (本ファイル内テンプレで参照)

- UX/UI: `pro-ux-ui-audit-needs-fix` / `pro-ux-ui-audit-skipped` /
  `pro-ux-ui-audit-manual-override`
- Security: `pro-security-needs-fix` / `pro-security-post-check-skipped` /
  `pro-security-post-check-manual-override`
- Planned domain: `op-planned-post-check-skipped` (marker。詳細は labels-and-markers.md)

### Active Issue routing labels (本ファイル内テンプレで参照)

- 共通: `auto-report` / `auto-fix` / `batch` / `patrol` / `do-not-close` / `op-state`
- 起票元: `op-architect` / `op-patrol`
- 派生 / 正規化: `derived-from-issue` / `superseded-by-scan` /
  `requires-normalization` / `needs-clarification`
- マイルストーン / area / module: `milestone:initial` / `area:*` / `module:*`

### Active expert routing labels (本ファイル内テンプレで参照)

- `pro-debug-expert` / `pro-refactor-expert` / `pro-optimize-expert` /
  `pro-security-expert` / `pro-ux-ui-audit-expert` / `pro-designer-expert` /
  `pro-feature-expert` / `pro-test-expert` / `pro-env-expert`

### Severity labels (本ファイル内テンプレで参照)

- 現行: `severity:critical` / `severity:high` / `severity:medium` /
  `severity:low` / `severity:n/a`

### Refactor / architecture-debt labels (本ファイル内テンプレで参照)

- `op:architecture-debt` / `op:staged-refactor` / `op:blocking-finding`

### Human-decision labels (本ファイル内テンプレで参照)

- `needs:triage` / `needs:human-decision` / `needs:human-decision-followup` /
  `needs:boundary-decision` / `needs:spec-decision`

### Deprecated / compatibility labels (削除しない。読み取り互換のみ)

- `pro-review-expert` (新規付与禁止。詳細 semantics は labels-and-markers.md)
- `critical` / `high` (旧 severity 表記。新規付与は `severity:critical` /
  `severity:high` を使う)

> 上記のいずれの label についても、**意味・所有者・runtime spawn effect / merge blocking effect
> の判定根拠は `skills/_shared/markers/labels-and-markers.md` および `skills/_shared/runtime-contract.md`** に
> ある。本ファイル内の名前列挙とそれらの正本記述に齟齬があった場合、正本側を更新するか
> 本ファイルの名前列挙を直すかのどちらかで解消する (重複定義を増やさない)。
> planned expert (`env-expert` / `release-expert` / `compatibility-expert`) を
> runtime spawn target / fallback target として記述してはならない (詳細は runtime-contract.md)。
> Utility Worker (`scout` / `spec-expert`) も op-run の spawn / fallback target にはしない (専用 OP skill が内部 spawn する)。
