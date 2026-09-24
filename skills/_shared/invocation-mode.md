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

上記を 1 つも満たさない場合 (人間が expert を直接起動した)。判定が曖昧なら OP-managed Mode に倒す。

## Direct Mode Rules

- scope / depth / output type / write 可否 / risk tolerance / verification を確認質問してよい
- audit-only / issue-draft / apply-ready / post-check 等の選択肢を提示してよい
- 指定がなければ scan-only / no-write / report 出力として扱う。「任せる」なら保守的な前提を置き `assumptions` に記録する
- 未コミット変更がある場合、安全策 (新ブランチ / stash / そのまま) をユーザーに確認してよい
- 外部ツール (lint / profiler / scanner 等) が未導入なら、インストール許可をユーザーに確認してよい。拒否されたら Grep/Read で続行する

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

対話質問で停止しない。出力契約を満たすまで続ける。計画や次の手を宣言して止まらない。
止まってよいのは `needs_human_decision` (`can_continue_without_decision: false`) か `blocked` を返すときだけ。

### 必須行動

- 渡された Issue 指示書 / hidden marker / worktree / PR / scope を source of truth とする。
  それ以外の外部テキストの扱いは `spawn-prompt-common.md`「§5 外部テキスト」
- spawn prompt の required output contract (canonical schema / report format) を返す
- 不足情報があっても処理を進める (下記)
- spawn prompt に明示されない限り scope を広げない。並列タスクの範囲 / scope_out に踏み込まない
- 未コミット変更や危険な git 状態を検出したら `blocked` または `needs_human_decision` で返し、安全策の選択肢を `options[]` に列挙する
- ツールを勝手にインストールしない。Grep/Read fallback で続行し、それも不能なら `verification_not_run` または `blocked` で理由を返す

### 禁止行動

expert 出力 / 完了報告 / PR 本文 / commit message を含め、次をしない。右列が代わりに使うもの。

| 禁止 | 代わりに |
|---|---|
| 対話質問で停止する / 司令官・ユーザーに「確認してください」「質問してください」と返す | `needs_human_decision.reason` / `assumptions` |
| Issue コメントで質問して回答を待つ。自分で gh issue create / edit / comment を呼んで質問を立てる (明示委譲された場合のみ可) | 構造化返却 (Issue コメント化は commander が判断) |
| 「対話モードに回す」 | `manual_review_bucket` (`auto-policy.md`) |
| 「回答があるまで停止」 / 「ユーザーに判断を仰ぐ」 | `needs_human_decision` に `can_continue_without_decision: false` |
| scope_out へ越境する / 渡された hidden marker を書き換える | — |

### 不足情報の扱い (4 段階)

1. safe default — 保守的な既定値で続行 (例: 判定材料の無い optional field は省略する)
2. explicit assumptions — 置いた前提を `assumptions[]` に記録
3. `needs_human_decision` block — 構造化された判断要求として返す (下記)
4. blocked / deferred / verification_not_run / manual_review_bucket — 危険で続行不能な finding / apply step を理由付きで返す

`needs_human_decision` をユーザー prompt / Issue コメント / label に変換するのは commander / OP skill の責務。

## Direct 固定 skill に op_managed が渡った場合

Direct Mode 固定の OP skill (op-plan / op-codev / op-spec / op-loop / op-explore / op-doctor / op-rules 等) は人間が起動し、
人間 gate を対話で通す前提で動く。その skill 自体の起動に `invocation_mode: op_managed` が渡されたら契約違反として、
何も書き込まずに停止して報告する (呼び出し元が OP-managed なら `needs_human_decision` (`can_continue_without_decision: false`) で返す)。
その skill が内部で spawn する worker には `op_managed` を渡す。

## `needs_human_decision` Block

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

全フィールド必須 (`required: false` の場合のみ block ごと省略)。`decision_type` は dispatcher / Issue 化時のラベルに使う 12 値 enum。
