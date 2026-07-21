<!--
schema_version: 1
last_breaking_change: 2026-05-04
notes: 初版。expert agent の direct human invocation と OP-managed invocation の対話可否を分離し、
       「質問で止まる責務」と「判断要求を構造化して返す責務」を明確に切り分ける。新標準名は
       `needs_human_decision`。旧 `needs_human_judgment` は deprecated alias として段階移行する。
-->

# Invocation Mode Policy

/**
 * 機能概要: expert agent が呼ばれた文脈に応じて Direct Mode / OP-managed Mode を判定し、
 *           対話可否・出力契約・「不足情報の扱い方」を切り分ける単一の真実源。
 * 作成意図: OP skill (op-scan / op-patrol / op-doctor / op-run / op-merge / op-architect) 由来の
 *           自動フローで expert が「Issue コメントで質問して停止」する事故を構造的に防ぐ。
 *           人間が expert を直接呼んだ場合の相談役としての使いやすさは保つ。
 * 注意点: 本ドキュメントは expert agent 全員と op-* skill 全員の共通契約。
 *         破壊的変更時は schema_version を bump し、版差分を notes に書く。
 */

## Purpose

expert agent は **direct human invocation** と **OP-managed invocation** で動作を分ける。

- Direct Mode = 人間が expert を直接呼び出し、相談役として使う場合
- OP-managed Mode = OP skill が自動フローの一部として expert を spawn する場合

両者を一律「対話 OK」または「対話 NG」にすると、自動フローが質問で停止するか、
直接実行時に user 体験が悪化する。本ドキュメントは責務境界を固定する。

---

## Mode Detection

expert は spawn された冒頭で必ず mode を判定する。判定材料は以下:

### OP-managed Mode と判定する条件

以下のいずれかを満たす場合は **OP-managed Mode** とする (一つでも該当したら確定)。

- spawn prompt に `invocation_mode: op_managed` が明記されている
- spawn prompt に `op-scan`, `op-patrol`, `op-doctor`, `op-run`, `op-merge`, `op-architect`
  由来であることが明記されている
- 入力に hidden marker が含まれる
  - `<!-- op-domain: ... -->`
  - `<!-- op-source: op-scan | op-patrol | op-run | op-merge | op-architect | op-plan -->`
  - `<!-- op-run-expert: ... -->`
  - `<!-- op-post-check-expert: ... -->`
  - `<!-- op-review-meta -->` / `<!-- op-review-finding -->`
  - `<!-- op-post-check-meta -->`
- Issue 指示書 / PR review / worktree path / branch / cluster id が OP から渡されている
- prompt に「あなたは <subagent> です」+ 「op-* skill から呼ばれました」相当の宣言がある

### Direct Mode と判定する条件

OP-managed Mode の条件を **一つも満たさない** 場合は Direct Mode とする。
ユーザーが直接 expert を起動 (例: `/expert-feature` 起動 / 自然文での依頼) したと解釈する。

判定が曖昧な場合は **OP-managed Mode 寄り** に倒す (= 対話せず構造化返却を優先)。
誤って質問で停止すると自動フローが崩れるため、安全側のデフォルトは「黙って契約通り返す」。

---

## Direct Mode Rules

人間との対話を前提にした、相談役としての挙動。

| 項目 | 挙動 |
|------|------|
| 対話質問 | 必要に応じて確認質問してよい |
| 確認対象 | scope / depth / output type / write 可否 / risk tolerance / verification |
| 選択肢提示 | audit-only / issue-draft / apply-ready / post-check / Design Plan などを提示してよい |
| 既定値 | ユーザーが「任せる」と言った場合は保守的な前提を置き、`assumptions` に記録する |

### Direct Mode でも禁止される行動

ユーザーが明示許可しない限り、以下は実行しない (確認を取る)。

- ファイル書き込み / 編集 / 削除
- 外部ツールのインストール
- branch 作成 / PR open / push / merge / Issue close
- 依存パッケージ追加・更新・削除
- production 環境への影響を持つ操作

「直接呼ばれている = なんでも自由」ではない。
判断と提案までは Direct Mode の自由、副作用は明示許可後にだけ起こす。

### Direct Mode の出力例

ユーザーに以下のような形式で確認してよい:

```
対象とモードを確認させてください。

1. 対象はどこですか? (ファイル / ディレクトリ / PR / Issue)
2. モードは scan / review / apply / post-check のどれですか?
3. 修正してよいですか? それとも指摘・計画のみですか?
4. 実行してよい確認コマンドはありますか?

指定がなければ scan-only / no-write / report 出力として扱います。
```

---

## OP-managed Mode Rules

自動フロー前提の非対話モード。**対話質問で停止しない** ことを最優先で守る。

### 必須行動

- 渡された Issue 指示書 / hidden marker / worktree / PR / scope を **source of truth** とする
- spawn prompt に明記された **required output contract** (canonical schema / report format) を必ず返す
- 不足情報があっても処理を進める (下記「不足情報の扱い」)
- spawn prompt に明示されない限り、expert 側から scope を広げない
- 並列タスクが触る範囲 / scope_out に踏み込まない

### 禁止行動

| 禁止 | 理由 |
|------|------|
| 対話質問で停止する | 自動フローが止まる。commander は通常応答できない |
| 司令官・ユーザーに「確認してください」と返す | OP-managed Mode の commander は agent の output を機械処理する |
| Issue コメントで質問して回答を待つ | コメント生成は OP skill / commander の責務 (expert に明示委譲された場合のみ可) |
| 自分で gh issue create / edit / comment を呼んで質問を立てる | 同上。明示委譲された場合のみ可 |
| 勝手に scope_out へ侵入する | 並列タスクと衝突 / 別 expert 担当領域への侵食 |
| 渡された hidden marker を書き換える | OP skill 側の dispatcher が壊れる |

### 不足情報の扱い (4 段階)

OP-managed Mode で「指示書だけでは判断できない」状況が出たら、停止せず以下の順で処理する。

1. **safe default** — 保守的に倒した既定値で続行 (例: post-check expert 不明 → null 扱い)
2. **explicit assumptions** — 自分が置いた前提を `assumptions[]` として完了報告に記録
3. **`needs_human_decision` block** — 構造化された判断要求として返す (下記)
4. **blocked / deferred / verification_not_run / manual_review_bucket** —
   危険な変更で続行不能なら、その finding / apply step を blocked として理由付きで返す

質問は出さず、構造化フィールドだけで commander に必要な情報を渡す。
commander / OP skill が必要に応じて Issue コメント・label・user prompt に変換する。

---

## `needs_human_decision` Block (新標準スキーマ)

OP-managed Mode で人間判断が要るとき、expert は以下の形式で完了報告に含める。

```yaml
needs_human_decision:
  required: true
  reason: "<判断が必要な理由を 1〜2 文で>"
  decision_type: "scope | risk | behavior | boundary | spec | compatibility | security | design | release | environment | deletion | dependency"
  options:
    - id: "A"
      label: "<選択肢ラベル>"
      consequence: "<選ぶと何が起きるか>"
    - id: "B"
      label: "<選択肢ラベル>"
      consequence: "<選ぶと何が起きるか>"
  recommended_option: "A | B | none"
  safest_default: "<判断不能時の保守的既定値>"
  blocked_actions:
    - "<この判断なしでは実行しない操作>"
  can_continue_without_decision: true | false
  next_safe_action: "<停止せず可能な次の安全行動 (audit のみ続ける / report に記録のみ等)>"
```

### フィールド説明

| フィールド | 必須 | 意味 |
|-----------|-----|------|
| `required` | ✓ | 人間判断が要るかどうか。要らないなら block ごと省略 |
| `reason` | ✓ | なぜ自動判断できないのか (例: scope_in 外への踏み込みが必要) |
| `decision_type` | ✓ | 判断種別。dispatcher / Issue 化時のラベルに使う (12 値の enum: scope / risk / behavior / boundary / spec / compatibility / security / design / release / environment / deletion / dependency) |
| `options[]` | ✓ | 最低 2 つ。`id` は短縮、`consequence` は具体的に |
| `recommended_option` | ✓ | expert の推奨。判断保留なら `none` |
| `safest_default` | ✓ | commander が即時に決められない場合に取る既定値 |
| `blocked_actions[]` | ✓ | 判断なしでは絶対に実行しない操作 (push / delete 等) |
| `can_continue_without_decision` | ✓ | true なら他の安全な作業は続行可、false なら全停止 |
| `next_safe_action` | ✓ | 続行可能な場合に取る次の行動 (停止と区別する) |

### 出力例

```yaml
needs_human_decision:
  required: true
  reason: "Issue に列挙されたファイル外で silent fork 候補が見つかったが、scope_in に含まれていない"
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

---

## Forbidden in OP-managed Mode (文言ブラックリスト)

OP-managed Mode の expert 出力 / 完了報告 / 完成 PR 本文 / commit message に以下の文言を含めない。
これらが残っていたら OP-managed Mode 違反として扱う。

| 禁止フレーズ | 置換先 |
|------------|-------|
| 「質問してください」 | `needs_human_decision.reason` に書く |
| 「Issue コメントで質問」 | 構造化返却に変える (commander が必要なら Issue コメント化する) |
| 「人間に補足質問」 | `needs_human_decision` / `assumptions` |
| 「司令官に確認」 | 同上 |
| 「対話モードに回す」 (expert 文脈) | `manual_review_bucket` (`auto-policy.md` 参照) |
| 「回答があるまで停止」 | `can_continue_without_decision: false` を `needs_human_decision` に明記 |
| 「ユーザーに判断を仰ぐ」 (expert 文脈) | 同上 |

> commander / OP skill が「これは Issue コメント化する」「これは user prompt に変える」を判断する。
> expert は構造化フィールドだけで状況を表現する。

---

## 互換性 (`needs_human_judgment` deprecated alias)

旧フィールド名 `needs_human_judgment` は段階移行する。

| 名称 | 状態 | 扱い |
|------|------|------|
| `needs_human_decision` | **新標準** | 新規記述・新規テンプレートで必ず使う |
| `needs_human_judgment` | **deprecated alias** | 既存出力を破壊しないため当面読み取り互換を維持。新規記述では使わない |

### 段階移行ルール

- 既存の `needs_human_judgment: true` は **当面 `needs_human_decision.required: true` 相当として読み取り互換**
- 新規テンプレート / 新規 schema 修正では `needs_human_decision` ブロックに統一する
- 旧 alias を残す場合は doc 内で「deprecated alias」と明記し、本ブロックへのリンクを張る
- schema_version を bump する場合は metadata の notes に変更理由を書く
  (`expert-spawn.md` / `pr-templates.md` の bump 規約と整合)

---

## Direct vs OP-managed の判断早見表

| 状況 | Direct Mode | OP-managed Mode |
|------|-------------|----------------|
| scope 不明 | ユーザーに対象を聞いてよい | 渡された scope_in を信じる、外に出ない |
| 修正可否不明 | 「指摘のみ / apply のどちら？」と聞いてよい | spawn prompt の指示に従う (apply 指示なら apply、scan なら scan) |
| 仕様不明 | spec 確認質問してよい | `needs_human_decision` に記録、scope 内で進める |
| destructive 操作 | 必ず明示許可を取る | spawn prompt に許可なければ blocked、許可あれば実行 |
| 検証手段不明 | 「どのコマンドを使ってよいか」確認可 | `verification_not_run` を返し、続行可能な範囲で進める |
| post-check で BLOCK | designer/feature に再委任を提案してよい | 構造化 finding (`<!-- op-review-finding -->`) で返す |

---

## 関連ドキュメント

- `_shared/expert-spawn.md` — spawn prompt 規約 (invocation_mode の必須化)
- `_shared/auto-policy.md` — `manual_review_bucket` の定義
- `_shared/common-setup.md` — Direct vs OP-managed の「ユーザー確認」分岐
- `_shared/version-check.md` — schema mismatch 時のユーザー確認は OP skill 側責務
- `_shared/pr-templates.md` — `needs_human_decision` block を含む完了報告テンプレ
