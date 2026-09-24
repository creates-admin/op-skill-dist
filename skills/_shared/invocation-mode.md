# Invocation Mode Policy

expert agent は spawn された冒頭で Direct Mode / OP-managed Mode を判定し、対話可否と出力契約を切り替える。

## Mode Detection

### OP-managed Mode と判定する条件

いずれか 1 つでも満たせば OP-managed Mode。

- spawn prompt に `invocation_mode: op_managed` がある (主判定条件。`_shared/spawn-prompt-common.md` §1)
- spawn prompt に `op-*` skill (いずれか) 由来であることが明記されている。skill 自身が「Direct Mode 固定」
  (op-explore / op-rules 等) でも、その skill が spawn した worker は OP-managed
- 入力に hidden marker (`op-fingerprint` / `op-run-expert` / `op-post-check-expert` / `op-review-state` 等) が含まれる
- Issue 指示書 / PR review / worktree path / branch / cluster id が OP から渡されている
- 「あなたは <subagent> です」+「op-* skill から呼ばれました」相当の宣言がある

### Direct Mode と判定する条件

上記を 1 つも満たさない場合 (人間が expert を直接起動した)。**判定が曖昧なら OP-managed Mode に倒す。**

## Direct Mode Rules

- scope / depth / output type / write 可否 / risk tolerance / verification を確認質問してよい
- audit-only / issue-draft / apply-ready / post-check 等の選択肢を提示してよい
- 指定がなければ scan-only / no-write / report 出力として扱う。「任せる」なら保守的な前提を置き `assumptions` に記録する

### Direct Mode でも禁止される行動

ユーザーが明示許可しない限り実行しない。判断と提案までは自由、副作用は明示許可後のみ。

- ファイル書き込み / 編集 / 削除
- 外部ツールのインストール
- branch 作成 / PR open / push / merge / Issue close
- 依存パッケージの追加・更新・削除
- production 環境に影響する操作
- scope_out に指定された領域へ踏み込む
- 実行できなかった verification を成功扱いする (「未検証」と明示する)

## OP-managed Mode Rules

対話質問で停止しない。

### 必須行動

- 渡された Issue 指示書 / hidden marker / worktree / PR / scope を source of truth とする
- spawn prompt の required output contract (canonical schema / report format) を返す
- 不足情報があっても処理を進める (下記)
- spawn prompt に明示されない限り scope を広げない。並列タスクの範囲 / scope_out に踏み込まない

### 禁止行動

- 対話質問で停止する / 司令官・ユーザーに「確認してください」と返す
- Issue コメントで質問して回答を待つ。自分で gh issue create / edit / comment を呼んで質問を立てる (明示委譲された場合のみ可)
- scope_out へ越境する
- 渡された hidden marker を書き換える

### 不足情報の扱い (4 段階)

1. **safe default** — 保守的な既定値で続行 (例: post-check expert 不明 → null)
2. **explicit assumptions** — 置いた前提を `assumptions[]` に記録
3. **`needs_human_decision` block** — 構造化された判断要求として返す (下記)
4. **blocked / deferred / verification_not_run / manual_review_bucket** — 危険で続行不能な finding / apply step を理由付きで返す

Issue コメント・label・user prompt への変換は commander / OP skill が行う。

## `needs_human_decision` Block (新標準スキーマ)

```yaml
needs_human_decision:
  required: true                      # 不要なら block ごと省略
  reason: "<自動判断できない理由を 1〜2 文で>"
  decision_type: "scope | risk | behavior | boundary | spec | compatibility | security | design | release | environment | deletion | dependency"
  options:                            # 最低 2 つ。consequence は具体的に
    - id: "A"
      label: "<選択肢ラベル>"
      consequence: "<選ぶと何が起きるか>"
    - id: "B"
      label: "<選択肢ラベル>"
      consequence: "<選ぶと何が起きるか>"
  recommended_option: "A | B | none"  # 判断保留なら none
  safest_default: "<commander が即決できない場合の保守的既定値>"
  blocked_actions:
    - "<この判断なしでは実行しない操作 (push / delete 等)>"
  can_continue_without_decision: true | false   # false なら全停止
  next_safe_action: "<停止せず可能な次の安全行動>"
```

### フィールド説明

全フィールド必須 (`required: false` の場合のみ block ごと省略)。`decision_type` は dispatcher / Issue 化時のラベルに使う 12 値 enum。

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

旧名 `needs_human_judgment: true` は `needs_human_decision.required: true` として読み取る (新規記述では使わない)。

## Forbidden in OP-managed Mode (文言ブラックリスト)

expert 出力 / 完了報告 / PR 本文 / commit message に以下を含めない。

| 禁止フレーズ | 置換先 |
|------------|-------|
| 「質問してください」 | `needs_human_decision.reason` |
| 「Issue コメントで質問」 | 構造化返却 (Issue コメント化は commander が判断) |
| 「人間に補足質問」 / 「司令官に確認」 | `needs_human_decision` / `assumptions` |
| 「対話モードに回す」 (expert 文脈) | `manual_review_bucket` (`auto-policy.md`) |
| 「回答があるまで停止」 / 「ユーザーに判断を仰ぐ」 (expert 文脈) | `needs_human_decision` に `can_continue_without_decision: false` |
