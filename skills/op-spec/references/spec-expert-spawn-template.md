<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29, Wave B1 / ADR-0029 決定2): op-spec/SKILL.md「spec-expert spawn テンプレート」節
       (spawn prompt 本体 + 非対称についての注記 + subagent_type 直接渡しの根拠) を物理切り出し。
       spawn prompt dump は「本文の逐次手順」ではなく「成果物サンプル」であり順序契約を持たないため
       references 候補。切り出し前後で内容 byte-identical (移動であって書き換えではない)。
       spawn テンプレ内部 (読者は Sonnet 級 worker) は ADR-0029 決定3 に従い保守的に維持し、書き換えない。
-->

<!--
機能概要: op-spec controller が spec-expert を isolated context で spawn する際の literal prompt
         テンプレートと、Direct Mode (op-spec) / OP-managed Mode (spec-expert) の非対称設計の注記、
         subagent_type に spec-expert を直接渡せる根拠。
作成意図: SKILL.md 本文を「毎回・必ず・順序が重要」な主経路に絞るための progressive disclosure
         (ADR-0029 決定2、Wave B1)。spawn prompt はテンプレ dump (成果物サンプル) であり、
         本文の逐次手順そのものではないため参照側へ出す。
注意点: いつ読むか = 本文フェーズ2「2-1. spec-expert を spawn (gather)」に到達した時。
       spawn テンプレ内部は Sonnet 級 worker が読む契約文なので、参照に降格しても文言は変更しない
       (ADR-0029 決定3: 「spawn prompt テンプレ内部は明示指示・骨格例を保守的に維持する」)。
       末尾の質問禁止 + fallback ブロックは `_shared/spawn-prompt-common.md (>=1)` §4 の canonical
       全文を独自省略せず転記する契約 — この規約自体は本ファイルの移動によって変わらない。
-->

# op-spec: spec-expert spawn テンプレート

op-spec controller は以下のテンプレートで spec-expert を spawn する。

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

> 末尾の質問禁止 + fallback ブロックは `_shared/spawn-prompt-common.md (>=1)` §4 の canonical 全文
> (独自省略形にしない — 省略すると fallback 経路が worker に伝わらない)。

### 非対称についての注記

- **op-spec 自身**: Direct Mode (人間起動、align 対話あり、正本 write は human 承認 gate)
- **spec-expert**: OP-managed Mode (op-spec controller から spawn、質問で停止しない、read-only)

この非対称は意図的な設計。controller は human との align 対話と正本 write を担い、
spec-expert は隔離 context で機械的に 3 者照合して差分を返す。

### spec-expert を subagent_type に直接渡せる根拠

正本: `_shared/active-expert-registry.md`「Utility Workers」節「直接 spawn の根拠」。
op-spec 固有の点: 呼び出し元は op-spec controller のみ。scoped 名は `op-skill:spec-expert` (上記テンプレ参照)。
