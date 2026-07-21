# security-post-check-pass-with-notes.md — post-check PASS_WITH_NOTES コメント

<!--
機能概要: security-expert post-check mode で PASS_WITH_NOTES を返す PR コメントテンプレ。
作成意図: 元 finding は解消し security_result: pass だが、軽微な hardening / docs / follow-up が
         残っている場合の PASS 判定。merge は許容する (Notes は review-expert / 人間に伝達)。
注意点: BLOCK ではない (= 修正必須ではない)。Notes は「次の機会に対応すべき改善」として残す。
       hardening を強制したい場合は別 Issue として起票する (本 PR では merge 通す)。
-->

## PR コメント投稿コマンド (PASS_WITH_NOTES)

```bash
POST_CHECK_SHA=$(git rev-parse HEAD)
POST_CHECK_ROUND="${POST_CHECK_ROUND:-1}"
NOTES_COUNT="${NOTES_COUNT:-1}"

REQUIRES_AUX="${REQUIRES_AUX:-false}"
AUX_EXPERTS="${AUX_EXPERTS:-none}"
AUX_REASON="${AUX_REASON:-}"
AUX_STATUS="${AUX_STATUS:-not_required}"

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-security-post-check -->
<!-- op-post-check-meta -->
post_check_expert: security-expert
post_check_result: pass_with_notes
post_checked_head_sha: ${POST_CHECK_SHA}
post_check_round: ${POST_CHECK_ROUND}
audit_result: PASS_WITH_NOTES
audited_at: $(date -Iseconds)
auditor: security-expert
blocking_count: 0
notes_count: ${NOTES_COUNT}

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

## ⚠️ Security Post-check Result: PASS_WITH_NOTES

### 判定
PASS_WITH_NOTES

### 評価サマリ
<元 finding は解消、security_result: pass。軽微な hardening / docs / follow-up が残る>

### 8 観点の評価
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | 元 finding の解消 | OK | <実装済み> |
| 2 | 別の攻撃面増加チェック | OK | <新攻撃面なし> |
| 3 | 入力検証 | OK | <canonicalize / extension / reserved name reject 実装済み> |
| 4 | 認可 / capability | OK | <IPC 権限境界 / scope 適切> |
| 5 | エラーパス | OK | <error sanitize 実装済み> |
| 6 | scope_out 違反 | OK | <scope_in 内に閉じている> |
| 7 | 正当なユーザー操作維持 | OK | <UI 維持> |
| 8 | UX/UI auxiliary post-check 必要性 | NO / YES | <該当時のみ> |

### Notes (フォローアップ事項)

レビュアー (review-expert) と人間に伝えたい軽微な観点:

- [ ] <hardening 候補 1: 例 「同 module の他関数にも path canonicalize を適用すると defense-in-depth になる」>
- [ ] <docs 改善: 例 「security note を README に追記 (path 検査の存在をユーザーに伝える)」>
- [ ] <follow-up Issue: 例 「別 Issue で similar pattern を audit」>

これらは本 PR では対応せず、別 Issue として後追いで起票することを推奨します。

### マージ後の確認ポイント
<具体的に動作確認すべき項目>

この結果を受けて、op-run が フェーズ4 (review-expert global review) に \`light-after-security-postcheck\` モードで進めます。
Notes は review-expert と人間レビューで参照されます。

---
🤖 security-expert による Security Post-check (op-run フェーズ3.5-B)
EOF
)"
```

---

## PASS_WITH_NOTES の典型ケース

```text
- 元 finding は閉じたが、同 module の他関数にも同種の入力検証を入れると defense-in-depth になる
- canonicalize / scope は実装されたが、test の数が薄い (1 〜 2 件のみ)
- error sanitize は実装されたが、log permission の縮小は別 PR で対応推奨
- security regression test は追加されたが、edge case (空文字列 / 巨大入力 等) のカバーは不十分
- security 修正は完璧だが、CLAUDE.md 規約観点で minor refactor 候補 (gate 不足ではない)
```

これらはすべて **merge を止めるほどではない**。
「次の機会に対応する候補」として Notes に列挙し、別 Issue 起票で track する。

---

## BLOCK との違い

```text
PASS_WITH_NOTES:
  - 元 finding は解消 (security_result: pass)
  - 別の攻撃面 / 漏洩 / scope_out 違反 / 正当 capability 削除 はない
  - Notes は merge 後に対応する候補

BLOCK:
  - 上記いずれかが NG (= security_result: block / workflow_preservation_result: block)
  - apply 担当に再実装を依頼する必要あり
  - merge してはいけない
```

---

## 注意点

- `notes_count` は Notes 件数 (Notes セクションの bullet 数) を反映
- `blocking_count` は 0 (PASS_WITH_NOTES では BLOCKER 扱いにしない)
- `requires_aux_post_check: true` の場合は aux_post_check_status を `required_pending` で初期化
- label 操作は op-run の責務 (security-expert は付与・剥奪しない)
