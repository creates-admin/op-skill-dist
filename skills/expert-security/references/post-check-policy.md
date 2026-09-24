# post-check-policy.md — Security post-check

op-run の post-check で、apply 担当 (security-expert / debug-expert) が実装した PR を Issue 固有に再監査する。

最初に worktree の `git rev-parse HEAD` が spawn prompt の head SHA と一致するか確認し、不一致なら BLOCK で報告する。
diff だけで判定せず、元 Issue の success_criteria / scope_in / scope_out と照合する。

## 8 観点 (post-check の核)

1. **元 finding の解消** — success_criteria を満たすか。元 finding の `attack_path.steps` が diff で実際に閉じているか。
   `recommendation.steps` が実装され、適用 mitigation が `preferred_mitigation` と整合するか。未解消 → `finding_resolved: false`。
2. **別の露出面** — 修正で入った path / IO / IPC / shell / parser に未検証の入力経路がないか。別の境界 (例: frontend 文字列 → file IO)
   が開いていないか。canonicalize 追加で新しい error path / panic が生まれていないか。あり → `new_attack_surface_introduced: true`。
3. **入力検証** — canonicalize / encoding / size limit / null byte / `..` / Unicode 正規化、reserved name・ADS・device・UNC、
   archive entry 検証、deserialize の size・depth・count、URL の scheme・host allowlist。
4. **認可 / capability** — IPC command と capability の整合、shell は args 配列、file IO の root / scope が境界どおり、
   新規 capability に根拠があるか、dangerous 設定が無効か、削除した command の permission が残っていないか。
5. **エラーパス** — check-then-act が atomic 操作になっているか、privilege drop の漏れ、失敗時 message への secret・絶対 path・
   文書内容の漏洩、user input 経路の panic / unwrap / expect、error chain の sanitize。漏洩あり → `secret_or_path_leak_detected: true`。
6. **scope_out 違反** — scope_out への変更、scope_in 外への overreach (refactor / feature の混入)、public API・event 名・IPC contract の変更。
   あり → `scope_out_violation: true`。
7. **正当なユーザー操作の維持** — save_as / open_file / export / import / external_app_launch / batch の UI が残っているか、
   出力先・読込元が固定されていないか、capability 全体 disable がないか、`forbidden_shortcuts` が守られているか、
   ux_impact が none / low に収まるか (`usable-security.md` §3)。
8. **UX/UI auxiliary post-check の要否** — 次のいずれかに該当すれば `requires_aux_post_check: true` /
   `aux_post_check_experts: [ux-ui-audit-expert]` / `aux_post_check_reason` を返す。該当しなければ `false`。
   - frontend (vue / svelte / react / tsx / css / scss) に diff がある
   - dialog / Toast / button / menu / keyboard handler の追加、Toast・dialog 文言の大きな変更
   - a11y 要素 (aria / role / focus / contrast) の変化
   - workflow の step 数の増加 (1 click → 2 click、batch に確認段階を追加 など)

   不要な例: backend のみの修正 / 画面に出ない log・error 文字列 / UI に影響しない capability JSON / frontend が既存の error path で
   扱える IPC 入力検証 / UI から呼ばれない command の削除。
   aux post-check の実行・再実行 (head が進んだ場合) と結果の記録は op-run が行う。

## 判定 4 種

| 判定 | 条件 |
|---|---|
| PASS | 観点 1〜7 がすべて OK |
| PASS_WITH_NOTES | 観点 1〜7 は OK だが、follow-up (同 module の他関数への同種検証、test の薄さ、edge case、log 権限の別 PR 対応など) が残る |
| BLOCK | 観点 1〜6 のいずれかが NG。Required Changes が具体的に書け、apply 担当の再実装で解消できる |
| NEEDS_HUMAN_DECISION | 観点 7 が NG (`legitimate_workflow_preserved: false`) / security risk と UX のトレードオフで方針が複数ありうる / 大規模な capability 再設計・認証モデル・token 保存・updater 設計の見直しが必要 / DB migration を伴う互換性問題 |

`legitimate_workflow_preserved: false` は BLOCK にしない (NEEDS_HUMAN_DECISION)。aux post-check の結果は本判定に含めない
(aux の実行と合成は op-run が行う)。

典型:

| ケース | 観点 | 判定 |
|---|---|---|
| canonicalize 漏れが残る / 新しい IO 経路に検証漏れ | 1, 2, 3 | BLOCK |
| capability の過剰許可が残る | 4 | BLOCK |
| error message に絶対 path | 5 | BLOCK |
| scope_out への refactor 混入 | 6 | BLOCK (または別 Issue 化を Required Changes に書く) |
| save_as UI の削除 / 出力先の workspace 固定 | 7 | NEEDS_HUMAN_DECISION |

## 出力

**PR コメント** (自然文、HTML marker なし): 書式は `~/.claude/skills/_shared/pr-templates.md`「op-run: Security Post-check Result」。
BLOCK では Required Changes を再実装できる粒度で列挙し、再実装時に守る usable security 制約 (UI 削除・出力先固定・
capability 全体 disable をしない、修正は mitigation ladder の範囲) を添える。

**返却 field** (controller が op-review-state の `post_checks["security-expert"]` に記録する):

```yaml
verdict: PASS | PASS_WITH_NOTES | BLOCK | NEEDS_HUMAN_DECISION
post_checked_head_sha: <40 桁 SHA>
post_check_round: <spawn prompt の値>
required_changes: []          # BLOCK 時
notes: []                     # PASS_WITH_NOTES 時
finding_resolved: true | false
new_attack_surface_introduced: true | false
scope_out_violation: true | false
secret_or_path_leak_detected: true | false
legitimate_workflow_preserved: true | false
ux_impact: none | low | medium | high
affected_user_capability: [save_as, ...]
requires_aux_post_check: true | false
aux_post_check_experts: [ux-ui-audit-expert]   # requires_aux_post_check: true のとき
aux_post_check_reason: "<何が UI / workflow に影響したか>"
needs_human_decision: {...}   # NEEDS_HUMAN_DECISION 時。schema は ~/.claude/skills/_shared/invocation-mode.md
comment_url: <投稿した PR コメントの URL>
```

NEEDS_HUMAN_DECISION の選択肢には「UX 中立な mitigation のみで再実装させる」と「UX 再設計を別 Issue に切り出す」を含める。
