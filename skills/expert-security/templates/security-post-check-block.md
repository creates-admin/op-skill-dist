# security-post-check-block.md — post-check BLOCK / NEEDS_HUMAN_DECISION コメント

<!--
機能概要: security-expert post-check mode で BLOCK または NEEDS_HUMAN_DECISION を返す PR コメントテンプレ。
作成意図: <!-- op-security-post-check --> + <!-- op-post-check-meta --> block で BLOCK 状態を記録し、
         op-run が pro-security-needs-fix 付与 + apply 担当再 spawn (BLOCK) または人間判断待ち
         (NEEDS_HUMAN_DECISION) に分岐できるようにする。
注意点: BLOCK と NEEDS_HUMAN_DECISION で出力 block / 文言が異なる。
       いずれも merge gate で BLOCK されるため、本 PR は merge 不可になる。
-->

## PR コメント投稿コマンド (BLOCK)

```bash
POST_CHECK_SHA=$(git rev-parse HEAD)
POST_CHECK_ROUND="${POST_CHECK_ROUND:-1}"
BLOCKING_COUNT="${BLOCKING_COUNT:-1}"

# UI / workflow が破壊された場合は workflow_preservation_result: block
SECURITY_RESULT="${SECURITY_RESULT:-block}"
WORKFLOW_RESULT="${WORKFLOW_RESULT:-pass}"
LEGITIMATE_PRESERVED="${LEGITIMATE_PRESERVED:-true}"
UX_IMPACT="${UX_IMPACT:-none}"

REQUIRES_AUX="${REQUIRES_AUX:-false}"
AUX_EXPERTS="${AUX_EXPERTS:-none}"
AUX_REASON="${AUX_REASON:-}"
AUX_STATUS="${AUX_STATUS:-not_required}"

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-security-post-check -->
<!-- op-post-check-meta -->
post_check_expert: security-expert
post_check_result: block
post_checked_head_sha: ${POST_CHECK_SHA}
post_check_round: ${POST_CHECK_ROUND}
audit_result: BLOCK
audited_at: $(date -Iseconds)
auditor: security-expert
blocking_count: ${BLOCKING_COUNT}
notes_count: 0

security_result: ${SECURITY_RESULT}
finding_resolved: <true | false (BLOCK の主因なら false)>
new_attack_surface_introduced: <true | false>
scope_out_violation: <true | false>
secret_or_path_leak_detected: <true | false>

workflow_preservation_result: ${WORKFLOW_RESULT}
legitimate_workflow_preserved: ${LEGITIMATE_PRESERVED}
ux_impact: ${UX_IMPACT}
affected_user_capability: <CSV>

requires_aux_post_check: ${REQUIRES_AUX}
aux_post_check_experts: ${AUX_EXPERTS}
aux_post_check_reason: ${AUX_REASON}
aux_post_check_status: ${AUX_STATUS}
<!-- /op-post-check-meta -->

## ❌ Security Post-check Result: BLOCK

### 判定
BLOCK

### 評価サマリ
<2〜4 文で BLOCK の主因。元 finding 未解消 / 新攻撃面 / scope_out 違反 / 正当 capability 削除 のいずれか>

### 8 観点の評価
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | 元 finding の解消 | OK / **NG** | <NG なら未解消の挙動 + 該当ファイル> |
| 2 | 別の攻撃面増加チェック | OK / **NG** | <NG なら新規攻撃面 + 該当行> |
| 3 | 入力検証 | OK / **NG** | <NG なら検証漏れ + 該当箇所> |
| 4 | 認可 / capability | OK / **NG** | <NG なら境界違反 + 該当箇所> |
| 5 | エラーパス | OK / **NG** | <NG なら漏洩経路 / panic 経路 + 該当箇所> |
| 6 | scope_out 違反 | OK / **NG** | <NG なら scope_out 違反箇所> |
| 7 | 正当なユーザー操作維持 | OK / **NG** | <NG なら capability 削除 / 出力先固定 / UI 削除> |
| 8 | UX/UI auxiliary post-check 必要性 | NO / YES | <YES なら trigger_reason、aux_post_check_status を確認> |

### Required Changes (BLOCK 解消に必要な修正)

apply 担当 expert (security-expert または debug-expert) が再実装すべき項目:

- [ ] <修正項目 1: 例 「src-tauri/src/commands/io.rs::write_user_data に std::fs::canonicalize を追加し、scope check を実装」>
- [ ] <修正項目 2: 例 「reserved name (CON / PRN / AUX / NUL / COMx / LPTx) reject を validate ヘルパーに追加」>
- [ ] <修正項目 3: 例 「error message から std::path::Path::display() の戻り値を除去し、generic な error code に置換」>

### usable security 制約 (再実装時に守ること)

apply 担当が **絶対にやってはいけない** 修正:

- save_as / open_file / export / import / external_app_launch の UI 削除
- 出力先 directory の workspace 固定化
- capability 全体 disable
- 認証 / 権限モデル全体の再設計
- updater / installer / signing 設計の変更
- DB migration を伴う変更

修正は **validation / canonicalize / scope / confirm / audit / permission split** に閉じる。

この結果を受けて、op-run が \`pro-security-needs-fix\` ラベルを PR に付与し、apply 担当 expert を再 spawn して
Required Changes を実装します。再 audit で PASS / PASS_WITH_NOTES を取得するまで フェーズ4 へは進みません。
最大 2 回まで再実装、3 回目で BLOCK が継続する場合は \`pro-review-blocked\` 相当の人間判断待ちになります。
(label 操作は op-run の責務。security-expert は label を直接付与・剥奪しません)

---
🤖 security-expert による Security Post-check (op-run フェーズ3.5-B)
EOF
)"
```

---

## PR コメント投稿コマンド (NEEDS_HUMAN_DECISION)

human decision で停止する場合:

```bash
POST_CHECK_SHA=$(git rev-parse HEAD)
POST_CHECK_ROUND="${POST_CHECK_ROUND:-1}"

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-security-post-check -->
<!-- op-post-check-meta -->
post_check_expert: security-expert
post_check_result: needs_human_decision
post_checked_head_sha: ${POST_CHECK_SHA}
post_check_round: ${POST_CHECK_ROUND}
audit_result: BLOCK
audited_at: $(date -Iseconds)
auditor: security-expert
blocking_count: 1
notes_count: 0

security_result: block
finding_resolved: false
new_attack_surface_introduced: false
scope_out_violation: false
secret_or_path_leak_detected: false

workflow_preservation_result: block
legitimate_workflow_preserved: false
ux_impact: high
affected_user_capability: save_as,open_file

requires_aux_post_check: false
aux_post_check_experts: none
aux_post_check_reason: ""
aux_post_check_status: not_required
<!-- /op-post-check-meta -->

## 🛑 Security Post-check Result: NEEDS_HUMAN_DECISION

### 判定
NEEDS_HUMAN_DECISION

### 評価サマリ
<security_risk が high で、修正案が UX impact high (capability 削除等) になり自動判断不能>

### Needs Human Decision

\`\`\`yaml
needs_human_decision:
  required: true
  reason: |
    apply で save_as の OS dialog UI が削除されている (legitimate_workflow_preserved: false)。
    これは usable_security の forbidden_shortcuts (do_not_remove_file_picker /
    do_not_force_fixed_output_directory) に違反する。
    自動 PASS は不可。判断: 修正方針を変えるか、override を承認するか。
  decision_type: usable_security
  options:
    - id: "A"
      label: "BLOCK 判定として apply 担当に再実装を依頼 (UX 中立 mitigation のみ)"
      consequence: "apply 担当が再 spawn され、validation 強化のみで実装し直す"
    - id: "B"
      label: "manual override を承認 (緊急 hotfix 等の例外運用)"
      consequence: "pro-security-post-check-manual-override + op-manual-override block で承認、follow-up Issue で再 audit"
    - id: "C"
      label: "Issue 再設計 (UX 再設計を別 Issue 化)"
      consequence: "本 PR は閉じ、spec-expert + designer-expert で UX 再設計"
  recommended_option: "A"
  safest_default: "A"
  blocked_actions:
    - "PASS 判定 (legitimate_workflow_preserved: false のため)"
    - "merge (gate で BLOCK)"
  can_continue_without_decision: false
  next_safe_action: "post_check_result: needs_human_decision で記録、人間判断待ち"
\`\`\`

この結果を受けて、op-run は \`pro-security-needs-fix\` + \`needs:human-decision\` を PR に付与し、
人間判断待ちにします。op-run は自動継続しません。

---
🤖 security-expert による Security Post-check (op-run フェーズ3.5-B)
EOF
)"
```

---

## BLOCK / NEEDS_HUMAN_DECISION の使い分け

| 判定 | いつ使うか |
|------|----------|
| **BLOCK** | 修正方針が明確 (Required Changes が機械的に書ける)。apply 担当に再実装させれば解消できる |
| **NEEDS_HUMAN_DECISION** | 修正方針に複数の選択肢があり、自動判断不能 / UX impact high / capability 全体禁止が必要 / 認証 model 再設計が必要 |

---

## 注意点

- BLOCK では `Required Changes` を **必ず**列挙 (apply 担当が再実装できる粒度)
- NEEDS_HUMAN_DECISION では `needs_human_decision` block を **必ず**含める
- `legitimate_workflow_preserved: false` を検出した場合は BLOCK ではなく NEEDS_HUMAN_DECISION を優先
  (capability 削除を機械的に「再実装」させると元木阿弥)
- `post_checked_head_sha` は判定確定時の SHA (op-merge stale gate)
- label 操作は op-run の責務 (security-expert は付与・剥奪しない)
