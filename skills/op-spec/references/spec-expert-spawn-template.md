# op-spec: spec-expert spawn テンプレート

op-spec controller は以下のテンプレートで spec-expert を spawn する (spec-expert は Utility Worker。直接 spawn の根拠は `_shared/active-expert-registry.md`「Utility Workers」節)。

```
Agent({
  subagent_type: "op-skill:spec-expert",
  model: "opus",
  description: "op-spec 3 者照合: <feature> ⟷ code ⟷ human",
  prompt: `
invocation_mode: op_managed

# 照合タスク

feature: <feature id>
spec_path: .claude/rules/<feature>.md   # missing なら lazy 構築モード
target_issues: [#NN, #MM]               # この feature に紐づく pending issue
issue_premises:                         # 各 issue が前提とする挙動 (controller が抽出)
  - issue: #NN
    premise: <issue が前提とする挙動 1 文>
code_scope:                             # 読むべき code 範囲 (paths から)
  - <src/feature/**>

# リポジトリ情報

repo_root: <git rev-parse --show-toplevel の結果>

# 指示

expert-spec/SKILL.md に従って以下を実行してください:
1. 正本 state 判定 (exists / stale / missing)
2. 3 者照合 (正本 ⟷ code) で差分検出 (spec_stale / code_deviation / premise_mismatch)
3. provenance タグ付与 (code 由来=[code] / domain・why=[?] TODO:needs-human、捏造禁止)
4. issue 前提の事実照合 (premise_check)
5. missing なら lazy 構築 (code から skeleton 候補抽出、domain は [?] で残す)
6. 返却契約スキーマで構造化返却 (正本 write はしない、proposed_spec_update を返すまで)

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
  `
})
```
