# security-post-check-pass.md — post-check PASS コメント

<!--
機能概要: security-expert post-check mode で PASS を返す PR コメントテンプレ。
作成意図: <!-- op-security-post-check --> + <!-- op-post-check-meta --> block を出力し、op-merge gate に
         必要な情報 (post_checked_head_sha / security_result / workflow_preservation_result /
         requires_aux_post_check / aux_post_check_status) を含める。
注意点: 共通テンプレ (`~/.claude/skills/_shared/pr-templates.md` の op-run: Security Post-check Result) と
       同期する。schema 違反 (必須フィールド欠落 / enum 不正値) は merge gate で BLOCK される。
-->

## PR コメント投稿コマンド (PASS)

```bash
POST_CHECK_SHA=$(git rev-parse HEAD)
POST_CHECK_ROUND="${POST_CHECK_ROUND:-1}"

# UI / workflow 影響なしの場合は requires_aux_post_check: false / aux_post_check_status: not_required
# UI / workflow 影響ありの場合は requires_aux_post_check: true / aux_post_check_status: required_pending
REQUIRES_AUX="${REQUIRES_AUX:-false}"
AUX_EXPERTS="${AUX_EXPERTS:-none}"
AUX_REASON="${AUX_REASON:-}"
AUX_STATUS="${AUX_STATUS:-not_required}"

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-security-post-check -->
<!-- op-post-check-meta -->
post_check_expert: security-expert
post_check_result: pass
post_checked_head_sha: ${POST_CHECK_SHA}
post_check_round: ${POST_CHECK_ROUND}
audit_result: PASS
audited_at: $(date -Iseconds)
auditor: security-expert
blocking_count: 0
notes_count: 0

security_result: pass
finding_resolved: true
new_attack_surface_introduced: false
scope_out_violation: false
secret_or_path_leak_detected: false

workflow_preservation_result: pass
legitimate_workflow_preserved: true
ux_impact: none
affected_user_capability: <CSV>

requires_aux_post_check: ${REQUIRES_AUX}
aux_post_check_experts: ${AUX_EXPERTS}
aux_post_check_reason: ${AUX_REASON}
aux_post_check_status: ${AUX_STATUS}
<!-- /op-post-check-meta -->

## ✅ Security Post-check Result: PASS

### 判定
PASS

### 評価サマリ
<2〜4 文で全体評価。元 finding が解消され、別の攻撃面が増えていないこと、
正当な user capability が維持されていることを記述>

### 8 観点の評価
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | 元 finding の解消 | OK | <Issue success_criteria を満たした実装> |
| 2 | 別の攻撃面増加チェック | OK | <修正で導入されたコードに新しい攻撃面なし> |
| 3 | 入力検証 | OK | <canonicalize / extension / reserved name reject 等が実装済み> |
| 4 | 認可 / capability | OK | <IPC 権限境界 / shell args 配列 / file IO scope 適切> |
| 5 | エラーパス | OK | <TOCTOU 対策 / error sanitize 実装済み> |
| 6 | scope_out 違反 | OK | <Issue scope_out への変更なし> |
| 7 | 正当なユーザー操作維持 | OK | <save_as / open_file / export / import / external_app_launch UI 維持、capability 削除なし> |
| 8 | UX/UI auxiliary post-check 必要性 | NO | <UI / workflow 影響なし> または YES <UI 変更あり、ux-ui-audit-expert post-check 必要> |

### マージ後の確認ポイント
<具体的に動作確認すべき項目>

この結果を受けて、op-run が フェーズ4 (review-expert global review) に \`light-after-security-postcheck\` モードで進めます。
${REQUIRES_AUX:+\`requires_aux_post_check: true\` のため ux-ui-audit-expert post-check が追加実行されます。}
(label 操作は op-run の責務。security-expert は label を直接付与・剥奪しません)

---
🤖 security-expert による Security Post-check (op-run フェーズ3.5-B)
EOF
)"
```

---

## meta block の必須フィールド (PASS)

| フィールド | 値 |
|-----------|---|
| post_check_expert | security-expert |
| post_check_result | pass |
| post_checked_head_sha | $(git rev-parse HEAD) |
| post_check_round | 数値 (op-run が事前計算して渡す) |
| audit_result | PASS |
| security_result | pass |
| finding_resolved | true |
| new_attack_surface_introduced | false |
| scope_out_violation | false |
| secret_or_path_leak_detected | false |
| workflow_preservation_result | pass |
| legitimate_workflow_preserved | true |
| ux_impact | none / low (PASS なら medium / high にしない) |
| affected_user_capability | CSV (該当する capability) |
| requires_aux_post_check | true / false |
| aux_post_check_experts | CSV (true 時) または "none" |
| aux_post_check_reason | 短い理由 / empty |
| aux_post_check_status | not_required / required_pending / pass |

---

## 注意点

- HEREDOC は `<<EOF` を使い、`${POST_CHECK_SHA}` 等の変数を展開する
- 本文中のバッククォートは `\`` でエスケープ (command substitution 防止)
- `post_checked_head_sha` は判定確定時の `git rev-parse HEAD` (op-merge の stale gate)
- `requires_aux_post_check: true` の場合 `aux_post_check_status: required_pending` を初期値とし、
  ux-ui-audit-expert post-check 完了後に op-run が `pass` / `block` に更新する
- label 操作は op-run の責務 (security-expert は付与・剥奪しない)
