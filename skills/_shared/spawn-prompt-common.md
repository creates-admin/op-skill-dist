# spawn-prompt-common: expert spawn prompt 共通必須ブロック

OP skill 由来の spawn prompt は §1〜§4 を必ず含める。SKILL.md の spawn テンプレは本ファイルへの
pointer 1 行でよいが、**実際に worker へ渡す spawn prompt には §1 の行・§2 の該当 variant・§4 ブロック全文を
含める** (要約・縮約しない)。フェーズ名 / 出力契約 / 作業環境 / cluster 固有値 / domain 表は各 SKILL.md 側に書く。

SKILL.md 側の pointer 形式:

```
共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を含める。
```

## §1 invocation_mode 宣言

prompt 冒頭に 1 行:

```text
invocation_mode: op_managed
```

## §2 必読 apply-completion-checklist

フェーズ種別で variant を選ぶ。

exploration-only (research / investigation / patrol / post-check / review):

```text
【必読】Read `~/.claude/skills/_shared/apply-completion-checklist.md` — 完了手順の正本。
本フェーズは <フェーズ名> (exploration-only) のため commits_added: [] が正解 (commit は行わない)。
```

apply (実装・scaffold・修正):

```text
【必読】Read `~/.claude/skills/_shared/apply-completion-checklist.md` — 完了手順の正本。
本フェーズは <フェーズ名> (apply) のため commits_added: [SHA, ...] (1 件以上) を完了報告に必ず含める。
```

## §3 commits_added

§2 の variant 文言で宣言する。apply spawn が `commits_added: []` を返すのは contract violation。

## §4 質問禁止 + assumptions fallback

以下を全文そのまま含める。

```text
You must not ask interactive questions.
You must not ask the commander or user for clarification.
Do not write Issue comments asking for clarification unless the OP skill explicitly delegates comment creation to you.
If information is missing, return one of:
  - assumptions[]               (前提を置いて続行する)
  - needs_human_decision        (構造化された判断要求)
  - blocked_actions[]           (この情報なしで実行しない操作のリスト)
  - verification_not_run        (検証不能な場合)
  - manual_review_bucket        (--auto 起票しないが人間レビューには載せる)
Return the required schema / report format. Do not produce free-form question text.
```

mode 判定 / 禁止フレーズ / `needs_human_decision` schema は `_shared/invocation-mode.md`。
